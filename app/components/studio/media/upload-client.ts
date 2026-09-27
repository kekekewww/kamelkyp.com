/**
 * Browser side of the streamed upload (content-architecture §4.3):
 *
 * 1. `preflightUpload` applies the same allowlist and size limits as the
 *    Worker, so a refused file is explained before anything is sent.
 * 2. `uploadFile` declares the upload (JSON, CSRF header, one refresh and
 *    retry on 403 through `studioFetch`), then PUTs the raw file with
 *    `XMLHttpRequest` so `upload.onprogress` can feed a native `<progress>`.
 *    A 403 on the PUT refreshes the token once and sends the file again.
 */
import type { ExtractedMetadata } from "../../../lib/cms/media/metadata.client";
import {
  canonicalMimeType,
  checkUploadDeclaration,
  UPLOAD_RULES,
  type UploadKind,
  uploadKindForMime,
} from "../../../lib/cms/media/signatures";
import { formatBytes, type MediaSummary } from "../../../lib/cms/media/summary";
import type { MediaKind } from "../../../lib/cms/schemas/media-asset";
import {
  fetchStudioSession,
  SessionExpiredError,
  STUDIO_CSRF_HEADER,
  studioFetch,
} from "../../../lib/cms/studio/session.client";
import type { LocalizedText } from "../../../lib/cms/types";

const KIND_NOUN: Record<UploadKind, string> = {
  image: "an image",
  audio: "audio",
  video: "a video",
  document: "a PDF document",
};

const ALLOWED_SUMMARY =
  "Use JPEG, PNG, WebP, AVIF or GIF images; MP3, WAV, AAC, M4A, OGG or FLAC audio; MP4 or WebM video; or PDF documents.";

export type Preflight =
  | { ok: true; kind: UploadKind; mimeType: string }
  | { ok: false; message: string };

function limitLabel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Client copy of the Worker's type and size rules, in plain words. */
export function preflightUpload(file: File, expected?: MediaKind): Preflight {
  const mimeType = canonicalMimeType(file.type, file.name);
  const actual = uploadKindForMime(mimeType);
  if (!actual) {
    return {
      ok: false,
      message: `${file.name} is not allowed. ${ALLOWED_SUMMARY}`,
    };
  }
  const expectedKind =
    expected && expected in UPLOAD_RULES ? (expected as UploadKind) : null;
  if (expectedKind && actual !== expectedKind) {
    return {
      ok: false,
      message: `This field needs ${KIND_NOUN[expectedKind]}. ${file.name} is ${KIND_NOUN[actual]}.`,
    };
  }
  const check = checkUploadDeclaration(
    { mimeType, sizeBytes: file.size },
    expected,
  );
  if (check.ok) return check;
  if (check.code === "empty_file") {
    return { ok: false, message: `${file.name} is empty.` };
  }
  if (check.code === "file_too_large") {
    const longMedia =
      actual === "audio" || actual === "video"
        ? " Register a YouTube or SoundCloud link for longer media."
        : "";
    return {
      ok: false,
      message: `${file.name} is ${formatBytes(file.size)}; ${actual} uploads are limited to ${limitLabel(check.maxBytes ?? 0)}.${longMedia}`,
    };
  }
  return {
    ok: false,
    message: `${file.name} is not allowed. ${ALLOWED_SUMMARY}`,
  };
}

export class UploadFailure extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "UploadFailure";
    this.code = code;
    this.status = status;
  }
}

const CLIENT_MESSAGES: Record<string, string> = {
  network_error:
    "The connection dropped during the upload. Check the network and retry.",
  aborted: "Upload cancelled.",
  session_expired: "Session expired. Sign in again, then retry.",
  unexpected: "The upload failed. Try again.",
};

function failure(code: string, status = 0, message?: string): UploadFailure {
  return new UploadFailure(
    code,
    status,
    message || CLIENT_MESSAGES[code] || CLIENT_MESSAGES.unexpected || "",
  );
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function failureFrom(status: number, body: Record<string, unknown> | null) {
  const code = typeof body?.code === "string" ? body.code : "unexpected";
  const message = typeof body?.message === "string" ? body.message : undefined;
  return failure(code, status, message);
}

/** The subset of XMLHttpRequest the upload uses (tests pass a fake). */
export interface UploadXhr {
  status: number;
  responseText: string;
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
}

export interface UploadInput {
  file: File;
  /** Canonical type from `preflightUpload`. */
  mimeType: string;
  /** The kind the field expects (the Worker enforces it too). */
  kind?: MediaKind;
  metadata: ExtractedMetadata;
  title: LocalizedText;
  alt: LocalizedText;
}

export interface UploadOptions {
  csrfToken: string;
  onToken?: (token: string) => void;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  createXhr?: () => UploadXhr;
}

function put(
  url: string,
  input: UploadInput,
  token: string,
  options: UploadOptions,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    const xhr = options.createXhr
      ? options.createXhr()
      : (new XMLHttpRequest() as unknown as UploadXhr);
    const onAbort = () => xhr.abort();
    if (options.signal?.aborted) {
      reject(failure("aborted"));
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const settle = () => options.signal?.removeEventListener("abort", onAbort);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", input.mimeType);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader(STUDIO_CSRF_HEADER, token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      settle();
      resolve({ status: xhr.status, body: parseJson(xhr.responseText) });
    };
    xhr.onerror = () => {
      settle();
      reject(failure("network_error"));
    };
    xhr.onabort = () => {
      settle();
      reject(failure("aborted"));
    };
    xhr.send(input.file);
  });
}

/** Declare → stream → the ready asset's summary. Throws `UploadFailure`. */
export async function uploadFile(
  input: UploadInput,
  options: UploadOptions,
): Promise<MediaSummary> {
  let token = options.csrfToken;
  let declared: Response;
  try {
    declared = await studioFetch("/api/studio/media", {
      method: "POST",
      csrfToken: token,
      onToken: (next) => {
        token = next;
        options.onToken?.(next);
      },
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: input.file.name,
        mimeType: input.mimeType,
        sizeBytes: input.file.size,
        ...input.metadata,
        title: input.title,
        alt: input.alt,
        ...(input.kind ? { kind: input.kind } : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof SessionExpiredError) throw failure("session_expired");
    if (options.signal?.aborted) throw failure("aborted");
    throw failure("network_error");
  }
  const declaration = parseJson(await declared.text());
  if (declared.status !== 201 || typeof declaration?.uploadUrl !== "string") {
    throw failureFrom(declared.status, declaration);
  }

  let result = await put(declaration.uploadUrl, input, token, options);
  if (result.status === 403) {
    const session = await fetchStudioSession();
    if (!session) throw failure("session_expired", 403);
    token = session.csrfToken;
    options.onToken?.(token);
    result = await put(declaration.uploadUrl, input, token, options);
    if (result.status === 403) throw failure("session_expired", 403);
  }
  const asset = result.body?.asset as MediaSummary | undefined;
  if (result.status !== 200 || !asset) {
    throw failureFrom(result.status, result.body);
  }
  return asset;
}
