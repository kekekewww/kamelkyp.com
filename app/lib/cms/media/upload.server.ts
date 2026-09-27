/**
 * Worker-streamed uploads into R2 (content-architecture §4.3, owner-only).
 *
 * 1. Declare: `createPendingUpload` validates type and size, stores a
 *    `pending` row with key `media/<yyyy>/<mm>/<uuid>/<sanitized-filename>`
 *    and returns the upload URL. Metadata extracted in the browser (width,
 *    height, duration) is advisory and clamped here.
 * 2. Stream: `receiveUpload` requires `Content-Length === sizeBytes` and the
 *    declared type, pipes the body through a first-bytes signature check into
 *    `MEDIA.put` (never buffering the file), compares the stored size, then
 *    marks the row `ready` — or `failed`, deleting the object.
 * 3. Cleanup of abandoned rows lives in `cleanup.server.ts` (daily cron).
 */
import { z } from "zod";
import type { Env } from "../../env.server";
import { emptyText } from "../localized";
import type { MediaAsset, MediaKind } from "../schemas/media-asset";
import { MEDIA_KINDS } from "../schemas/media-asset";
import { jsonError, jsonOk } from "../studio/responses";
import { getAsset } from "./assets.server";
import { readMediaConfig } from "./config.server";
import {
  canonicalMimeType,
  checkUploadDeclaration,
  matchesSignature,
  normalizeMime,
  SIGNATURE_BYTES,
  type UploadKind,
} from "./signatures";
import { toMediaSummary } from "./summary";
import type { MediaConfig } from "./urls";

export type UploadErrorCode =
  | "uploads_not_configured"
  | "invalid_request"
  | "unsupported_media_type"
  | "file_too_large"
  | "empty_file"
  | "length_required"
  | "size_mismatch"
  | "signature_mismatch"
  | "upload_not_pending"
  | "not_found"
  | "upload_failed";

const STATUS: Record<UploadErrorCode, number> = {
  uploads_not_configured: 503,
  invalid_request: 422,
  unsupported_media_type: 415,
  file_too_large: 413,
  empty_file: 422,
  length_required: 411,
  size_mismatch: 422,
  signature_mismatch: 415,
  upload_not_pending: 409,
  not_found: 404,
  upload_failed: 502,
};

export const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  uploads_not_configured:
    "Uploads are off: no media bucket is configured for this site. Register a URL instead.",
  invalid_request: "The upload request was incomplete.",
  unsupported_media_type: "This file type is not allowed.",
  file_too_large: "This file is larger than the upload limit.",
  empty_file: "This file is empty.",
  length_required: "The upload size was missing.",
  size_mismatch: "The file size changed during the upload. Try again.",
  signature_mismatch:
    "The file contents do not match its type. Export it again and retry.",
  upload_not_pending: "This upload has already finished.",
  not_found: "This upload no longer exists. Start it again.",
  upload_failed: "The file could not be stored. Try again.",
};

export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: UploadErrorCode, details?: Record<string, unknown>) {
    super(code);
    this.name = "UploadError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isUploadError(error: unknown): error is UploadError {
  return error instanceof UploadError;
}

const text = z
  .object({
    zh: z.string().trim().max(300).default(""),
    en: z.string().trim().max(300).default(""),
  })
  .optional();

const advisoryNumber = z.number().finite().nullable().optional();

export const UploadDeclarationSchema = z.object({
  filename: z.string().trim().min(1).max(1000),
  mimeType: z.string().trim().max(200),
  sizeBytes: z.number().finite(),
  width: advisoryNumber,
  height: advisoryNumber,
  durationMs: advisoryNumber,
  title: text,
  alt: text,
  kind: z.enum(MEDIA_KINDS).optional(),
});

export type UploadDeclaration = z.input<typeof UploadDeclarationSchema>;

const MAX_DIMENSION = 30_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function clampInt(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

/** Display filename: last path segment, no control characters, ≤ 255. */
export function displayFilename(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const cleaned = last.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 255) || "upload";
}

/** Storage-safe filename: `[a-z0-9._-]`, extension kept, stem ≤ 100 chars. */
export function sanitizeFilename(name: string): string {
  const last = (name.split(/[\\/]/).pop() ?? "").toLowerCase();
  const match = /\.([a-z0-9]{1,8})$/.exec(last);
  const extension = match ? `.${match[1]}` : "";
  const stem = (match ? last.slice(0, -match[0].length) : last)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return `${stem || "file"}${extension}`;
}

export function storageKeyFor(now: Date, id: string, filename: string): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${year}/${month}/${id}/${sanitizeFilename(filename)}`;
}

export function uploadUrlFor(assetId: string): string {
  return `/api/studio/media/${encodeURIComponent(assetId)}/content`;
}

function requireConfigured(config: MediaConfig) {
  if (!config.uploadsEnabled || !config.publicBaseUrl) {
    throw new UploadError("uploads_not_configured");
  }
}

/** Step 1: validate the declaration and store a `pending` row. */
export async function createPendingUpload(
  db: D1Database,
  input: unknown,
  config: MediaConfig,
  now: Date = new Date(),
): Promise<{ assetId: string; uploadUrl: string }> {
  requireConfigured(config);
  const parsed = UploadDeclarationSchema.safeParse(input);
  if (!parsed.success) throw new UploadError("invalid_request");
  const declaration = parsed.data;
  const filename = displayFilename(declaration.filename);
  const mimeType = canonicalMimeType(declaration.mimeType, filename);
  const check = checkUploadDeclaration(
    { mimeType, sizeBytes: declaration.sizeBytes },
    declaration.kind as MediaKind | undefined,
  );
  if (!check.ok) {
    throw new UploadError(
      check.code,
      check.maxBytes ? { maxBytes: check.maxBytes } : undefined,
    );
  }
  const kind: UploadKind = check.kind;
  const visual = kind === "image" || kind === "video";
  const timed = kind === "audio" || kind === "video";
  const width = visual ? clampInt(declaration.width, 1, MAX_DIMENSION) : null;
  const height = visual ? clampInt(declaration.height, 1, MAX_DIMENSION) : null;
  const pair = width !== null && height !== null;

  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  await db
    .prepare(
      "INSERT INTO media_assets (id, kind, source, state, storage_key, provider, filename, mime_type, " +
        "size_bytes, width, height, duration_ms, title_i18n, alt_i18n, created_at, updated_at) " +
        "VALUES (?, ?, 'r2', 'pending', ?, 'r2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      kind,
      storageKeyFor(now, id, filename),
      filename,
      check.mimeType,
      declaration.sizeBytes,
      pair ? width : null,
      pair ? height : null,
      timed ? clampInt(declaration.durationMs, 0, MAX_DURATION_MS) : null,
      JSON.stringify(declaration.title ?? emptyText()),
      JSON.stringify(
        kind === "image" ? (declaration.alt ?? emptyText()) : emptyText(),
      ),
      timestamp,
      timestamp,
    )
    .run();
  return { assetId: id, uploadUrl: uploadUrlFor(id) };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function asBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new UploadError("invalid_request");
}

/**
 * Reads until the first {@link SIGNATURE_BYTES} bytes are available (or the
 * body ends). Nothing is stored before this check passes.
 */
async function readHead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array> {
  let head: Uint8Array = new Uint8Array(0);
  while (head.byteLength < SIGNATURE_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    head = concat(head, asBytes(value));
  }
  return head;
}

/**
 * Writes the verified head and then the rest of the body into `writable`,
 * counting bytes; errors on an overrun or a short body.
 */
async function pump(
  head: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writable: WritableStream<Uint8Array>,
  expected: number,
): Promise<void> {
  const writer = writable.getWriter();
  try {
    let seen = head.byteLength;
    if (seen > expected) throw new UploadError("size_mismatch");
    await writer.write(head);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const bytes = asBytes(value);
      seen += bytes.byteLength;
      if (seen > expected) throw new UploadError("size_mismatch");
      await writer.write(bytes);
    }
    if (seen !== expected) throw new UploadError("size_mismatch");
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await reader.cancel().catch(() => {});
    throw error;
  }
}

async function markFailed(
  db: D1Database,
  bucket: R2Bucket,
  asset: MediaAsset,
  now: Date,
) {
  await db
    .prepare(
      "UPDATE media_assets SET state = 'failed', updated_at = ? WHERE id = ? AND state = 'pending'",
    )
    .bind(now.toISOString(), asset.id)
    .run();
  if (asset.storageKey) {
    try {
      await bucket.delete(asset.storageKey);
    } catch {
      // The cron's orphan pass retries it.
    }
  }
}

const DRAIN_LIMIT_BYTES = 1024 * 1024;

/**
 * Discards a refused request body: small bodies are drained (answering with
 * a body still unread drops the local runtime's connection), larger or
 * unsized ones are cancelled. The bytes are never parsed or stored.
 */
async function discard(request: Request) {
  if (!request.body || request.bodyUsed) return;
  const length = Number(request.headers.get("Content-Length") ?? Number.NaN);
  try {
    if (Number.isFinite(length) && length <= DRAIN_LIMIT_BYTES) {
      await request.arrayBuffer();
    } else {
      await request.body.cancel();
    }
  } catch {
    // Already closed.
  }
}

/** Step 2: stream the request body into R2 and mark the asset ready. */
export async function receiveUpload(
  db: D1Database,
  bucket: R2Bucket | undefined,
  assetId: string,
  request: Request,
  config: MediaConfig,
  now: Date = new Date(),
): Promise<MediaAsset> {
  if (!bucket) {
    await discard(request);
    throw new UploadError("uploads_not_configured");
  }
  try {
    requireConfigured(config);
  } catch (error) {
    await discard(request);
    throw error;
  }
  const asset = await getAsset(db, assetId);
  if (!asset || asset.source !== "r2" || !asset.storageKey) {
    await discard(request);
    throw new UploadError("not_found");
  }
  if (asset.state !== "pending") {
    await discard(request);
    throw new UploadError("upload_not_pending");
  }
  const mimeType = asset.mimeType ?? "";
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader === null || !/^[0-9]{1,12}$/.test(lengthHeader)) {
    await discard(request);
    throw new UploadError("length_required");
  }
  if (Number(lengthHeader) !== asset.sizeBytes) {
    await discard(request);
    throw new UploadError("size_mismatch");
  }
  const contentType = canonicalMimeType(
    request.headers.get("Content-Type"),
    asset.filename,
  );
  if (normalizeMime(contentType) !== mimeType) {
    await discard(request);
    throw new UploadError("unsupported_media_type");
  }
  if (!request.body) throw new UploadError("empty_file");

  const expected = asset.sizeBytes ?? 0;
  const reader = request.body.getReader();
  const head = await readHead(reader);
  if (!matchesSignature(mimeType, head.subarray(0, SIGNATURE_BYTES))) {
    await reader.cancel().catch(() => {});
    await markFailed(db, bucket, asset, now);
    throw new UploadError("signature_mismatch");
  }

  // R2 needs a stream of known length; the body goes straight through it.
  const fixed = new FixedLengthStream(expected);
  let streamError: unknown = null;
  const piping = pump(head, reader, fixed.writable, expected).catch(
    (error: unknown) => {
      streamError = error;
    },
  );
  let stored: R2Object | null = null;
  let putError: unknown = null;
  try {
    stored = await bucket.put(asset.storageKey, fixed.readable, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    putError = error;
  }
  await piping;

  if (streamError || putError || !stored) {
    await markFailed(db, bucket, asset, now);
    if (isUploadError(streamError)) throw streamError;
    if (isUploadError(putError)) throw putError;
    throw new UploadError("upload_failed");
  }
  if (stored.size !== expected) {
    await markFailed(db, bucket, asset, now);
    throw new UploadError("size_mismatch");
  }
  const result = await db
    .prepare(
      "UPDATE media_assets SET state = 'ready', size_bytes = ?, updated_at = ? WHERE id = ? AND state = 'pending'",
    )
    .bind(stored.size, now.toISOString(), asset.id)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    // Removed (cleanup) or finished elsewhere while streaming.
    await bucket.delete(asset.storageKey);
    throw new UploadError("upload_not_pending");
  }
  const ready = await getAsset(db, asset.id);
  if (!ready) throw new UploadError("not_found");
  return ready;
}

/** UploadError → JSON error response; rethrows anything else. */
export function uploadErrorJson(error: unknown): Response {
  if (!isUploadError(error)) throw error;
  return jsonError(error.code, error.status, {
    message: UPLOAD_ERROR_MESSAGES[error.code],
    ...(error.details ?? {}),
  });
}

interface UploadRouteArgs {
  request: Request;
  db: D1Database;
  env: Env;
  now: Date;
  params: Record<string, string | undefined>;
}

/** `POST /api/studio/media`: declaration JSON → 201 `{ assetId, uploadUrl }`. */
export async function handleDeclareUpload({
  request,
  db,
  env,
  now,
}: UploadRouteArgs): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonError("method_not_allowed", 405);
  }
  const config = readMediaConfig(env);
  if (!config.uploadsEnabled) {
    await discard(request);
    return uploadErrorJson(new UploadError("uploads_not_configured"));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return uploadErrorJson(new UploadError("invalid_request"));
  }
  try {
    const declared = await createPendingUpload(db, body, config, now);
    return jsonOk(declared, { status: 201 });
  } catch (error) {
    return uploadErrorJson(error);
  }
}

/** `PUT /api/studio/media/:id/content`: raw body → 200 `{ asset }`. */
export async function handleUploadContent({
  request,
  db,
  env,
  now,
  params,
}: UploadRouteArgs): Promise<Response> {
  if (request.method.toUpperCase() !== "PUT") {
    await discard(request);
    return jsonError("method_not_allowed", 405);
  }
  const config = readMediaConfig(env);
  try {
    const asset = await receiveUpload(
      db,
      env.MEDIA,
      params.id ?? "",
      request,
      config,
      now,
    );
    return jsonOk({ asset: toMediaSummary(asset, config) });
  } catch (error) {
    return uploadErrorJson(error);
  }
}
