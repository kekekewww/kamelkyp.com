/**
 * P2 media: streamed uploads into a Miniflare R2 bucket, pending cleanup,
 * the library (search, filters, usage), metadata edits and delete safety.
 */
import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { createCsrfToken } from "../../app/lib/auth/csrf.server";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import {
  createEntity,
  getEntity,
  publishEntity,
  saveEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import { cleanupPendingUploads } from "../../app/lib/cms/media/cleanup.server";
import { readMediaConfig } from "../../app/lib/cms/media/config.server";
import {
  createPendingUpload,
  receiveUpload,
  sanitizeFilename,
  storageKeyFor,
  UploadError,
} from "../../app/lib/cms/media/upload.server";
import {
  DraftUsageError,
  deleteAsset,
  getAssetWithUsages,
  handleMediaLibraryAction,
  listLibrary,
  loadMediaLibrary,
  updateAssetMetadata,
} from "../../app/lib/cms/repositories/media-library.server";
import { MusicDraftSchema } from "../../app/lib/cms/schemas/music";
import {
  ownerContext,
  STUDIO_CSRF_HEADER,
} from "../../app/lib/cms/studio/auth.server";
import type { Env } from "../../app/lib/env.server";
import { action as declareAction } from "../../app/routes/api/studio/media";
import { action as contentAction } from "../../app/routes/api/studio/media-content";
import { uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const owner = { subject: "owner-subject", email: "admin@example.com" };
const BASE = "https://media.example.test";

const configured = readMediaConfig({
  MEDIA: env.MEDIA,
  MEDIA_PUBLIC_BASE_URL: BASE,
});
const unconfigured = readMediaConfig({});

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4,
]);
const MP3 = new Uint8Array([
  0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
]);

function putRequest(
  assetId: string,
  body: BodyInit | null,
  headers: Record<string, string>,
) {
  return new Request(
    `https://kamelkyp.com/api/studio/media/${assetId}/content`,
    { method: "PUT", headers, body },
  );
}

async function assetRow(id: string) {
  return env.DB.prepare(
    "SELECT state, storage_key, size_bytes, kind, mime_type, width, height, duration_ms, filename FROM media_assets WHERE id = ?",
  )
    .bind(id)
    .first<{
      state: string;
      storage_key: string;
      size_bytes: number | null;
      kind: string;
      mime_type: string;
      width: number | null;
      height: number | null;
      duration_ms: number | null;
      filename: string;
    }>();
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("upload declaration", () => {
  it("creates a pending R2 asset with a dated storage key", async () => {
    const declared = await createPendingUpload(
      env.DB,
      {
        filename: "Signal Garden (final).PNG",
        mimeType: "image/png",
        sizeBytes: PNG.byteLength,
        width: 1600,
        height: 900,
        durationMs: 5000,
        alt: { zh: "封面", en: "Cover" },
      },
      configured,
      now,
    );
    expect(declared.uploadUrl).toBe(
      `/api/studio/media/${declared.assetId}/content`,
    );
    const row = await assetRow(declared.assetId);
    expect(row).toMatchObject({
      state: "pending",
      kind: "image",
      mime_type: "image/png",
      width: 1600,
      height: 900,
      // Duration is not an image property: dropped.
      duration_ms: null,
      filename: "Signal Garden (final).PNG",
    });
    expect(row?.storage_key).toBe(
      `media/2026/09/${declared.assetId}/signal-garden-final.png`,
    );
  });

  it("clamps advisory metadata to sane ranges", async () => {
    const declared = await createPendingUpload(
      env.DB,
      {
        filename: "take.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 100,
        width: 640,
        height: -3,
        durationMs: 183_456.7,
      },
      configured,
      now,
    );
    const row = await assetRow(declared.assetId);
    expect(row).toMatchObject({
      kind: "audio",
      width: null,
      height: null,
      duration_ms: 183_457,
    });
  });

  it("refuses types outside the allowlist, oversize files and a wrong kind", async () => {
    const svg = await rejection(
      createPendingUpload(
        env.DB,
        { filename: "logo.svg", mimeType: "image/svg+xml", sizeBytes: 10 },
        configured,
        now,
      ),
    );
    expect(svg).toBeInstanceOf(UploadError);
    expect(svg).toMatchObject({ code: "unsupported_media_type", status: 415 });

    const big = await rejection(
      createPendingUpload(
        env.DB,
        {
          filename: "huge.png",
          mimeType: "image/png",
          sizeBytes: 21 * 1024 * 1024,
        },
        configured,
        now,
      ),
    );
    expect(big).toMatchObject({ code: "file_too_large", status: 413 });

    const wrongKind = await rejection(
      createPendingUpload(
        env.DB,
        {
          filename: "a.mp3",
          mimeType: "audio/mpeg",
          sizeBytes: 10,
          kind: "image",
        },
        configured,
        now,
      ),
    );
    expect(wrongKind).toMatchObject({ code: "unsupported_media_type" });
  });

  it("answers 503 uploads_not_configured without the bucket or base URL", async () => {
    const error = await rejection(
      createPendingUpload(
        env.DB,
        { filename: "a.png", mimeType: "image/png", sizeBytes: 10 },
        unconfigured,
        now,
      ),
    );
    expect(error).toMatchObject({
      code: "uploads_not_configured",
      status: 503,
    });
  });

  it("sanitizes storage filenames and keeps the extension", () => {
    expect(sanitizeFilename("C:\\fakepath\\My Mix — v2.WAV")).toBe(
      "my-mix-v2.wav",
    );
    expect(sanitizeFilename("混音.wav")).toBe("file.wav");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename(`${"a".repeat(300)}.png`)).toBe(
      `${"a".repeat(100)}.png`,
    );
    expect(storageKeyFor(now, "id-1", "x y.png")).toBe(
      "media/2026/09/id-1/x-y.png",
    );
  });
});

describe("streamed upload", () => {
  it("streams the body into R2 and marks the asset ready", async () => {
    const declared = await createPendingUpload(
      env.DB,
      { filename: "cover.png", mimeType: "image/png", sizeBytes: PNG.length },
      configured,
      now,
    );
    const asset = await receiveUpload(
      env.DB,
      env.MEDIA,
      declared.assetId,
      putRequest(declared.assetId, PNG, {
        "Content-Type": "image/png",
        "Content-Length": String(PNG.length),
      }),
      configured,
      now,
    );
    expect(asset.state).toBe("ready");
    expect(asset.sizeBytes).toBe(PNG.length);
    const object = await env.MEDIA.get(asset.storageKey ?? "");
    expect(object).not.toBeNull();
    expect(
      new Uint8Array(await (object as R2ObjectBody).arrayBuffer()),
    ).toEqual(PNG);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    expect(object?.httpMetadata?.cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("accepts a body delivered in small chunks", async () => {
    const declared = await createPendingUpload(
      env.DB,
      { filename: "take.mp3", mimeType: "audio/mpeg", sizeBytes: MP3.length },
      configured,
      now,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < MP3.length; index += 3) {
          controller.enqueue(MP3.slice(index, index + 3));
        }
        controller.close();
      },
    });
    const asset = await receiveUpload(
      env.DB,
      env.MEDIA,
      declared.assetId,
      putRequest(declared.assetId, stream, {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(MP3.length),
      }),
      configured,
      now,
    );
    expect(asset.state).toBe("ready");
    expect(asset.kind).toBe("audio");
  });

  it("marks the asset failed and stores nothing when the signature does not match", async () => {
    const html = new TextEncoder().encode(
      "<html><body>not a png</body></html>",
    );
    const declared = await createPendingUpload(
      env.DB,
      { filename: "fake.png", mimeType: "image/png", sizeBytes: html.length },
      configured,
      now,
    );
    const error = await rejection(
      receiveUpload(
        env.DB,
        env.MEDIA,
        declared.assetId,
        putRequest(declared.assetId, html, {
          "Content-Type": "image/png",
          "Content-Length": String(html.length),
        }),
        configured,
        now,
      ),
    );
    expect(error).toMatchObject({ code: "signature_mismatch", status: 415 });
    const row = await assetRow(declared.assetId);
    expect(row?.state).toBe("failed");
    expect(await env.MEDIA.head(row?.storage_key ?? "")).toBeNull();
  });

  it("requires Content-Length to equal the declared size and the declared type", async () => {
    const declared = await createPendingUpload(
      env.DB,
      { filename: "cover.png", mimeType: "image/png", sizeBytes: 999 },
      configured,
      now,
    );
    const size = await rejection(
      receiveUpload(
        env.DB,
        env.MEDIA,
        declared.assetId,
        putRequest(declared.assetId, PNG, {
          "Content-Type": "image/png",
          "Content-Length": String(PNG.length),
        }),
        configured,
        now,
      ),
    );
    expect(size).toMatchObject({ code: "size_mismatch", status: 422 });

    const second = await createPendingUpload(
      env.DB,
      { filename: "cover.png", mimeType: "image/png", sizeBytes: PNG.length },
      configured,
      now,
    );
    const type = await rejection(
      receiveUpload(
        env.DB,
        env.MEDIA,
        second.assetId,
        putRequest(second.assetId, PNG, {
          "Content-Type": "image/jpeg",
          "Content-Length": String(PNG.length),
        }),
        configured,
        now,
      ),
    );
    expect(type).toMatchObject({ code: "unsupported_media_type", status: 415 });
    // A refused request leaves the declaration pending (it can be retried).
    expect((await assetRow(second.assetId))?.state).toBe("pending");
  });

  it("refuses a second upload into a ready asset and unknown ids", async () => {
    const declared = await createPendingUpload(
      env.DB,
      { filename: "cover.png", mimeType: "image/png", sizeBytes: PNG.length },
      configured,
      now,
    );
    const headers = {
      "Content-Type": "image/png",
      "Content-Length": String(PNG.length),
    };
    await receiveUpload(
      env.DB,
      env.MEDIA,
      declared.assetId,
      putRequest(declared.assetId, PNG, headers),
      configured,
      now,
    );
    const again = await rejection(
      receiveUpload(
        env.DB,
        env.MEDIA,
        declared.assetId,
        putRequest(declared.assetId, PNG, headers),
        configured,
        now,
      ),
    );
    expect(again).toMatchObject({ code: "upload_not_pending", status: 409 });
    const missing = await rejection(
      receiveUpload(
        env.DB,
        env.MEDIA,
        "missing-id",
        putRequest("missing-id", PNG, headers),
        configured,
        now,
      ),
    );
    expect(missing).toMatchObject({ code: "not_found", status: 404 });
  });
});

describe("pending upload cleanup", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function insertUploadRow(input: {
    state: "pending" | "failed" | "ready";
    createdAt: Date;
    key?: string;
  }) {
    const id = crypto.randomUUID();
    const key = input.key ?? storageKeyFor(input.createdAt, id, "take.mp3");
    await env.DB.prepare(
      "INSERT INTO media_assets (id, kind, source, state, storage_key, provider, filename, mime_type, " +
        "size_bytes, created_at, updated_at) VALUES (?, 'audio', 'r2', ?, ?, 'r2', 'take.mp3', 'audio/mpeg', 4, ?, ?)",
    )
      .bind(
        id,
        input.state,
        key,
        input.createdAt.toISOString(),
        input.createdAt.toISOString(),
      )
      .run();
    await env.MEDIA.put(key, MP3);
    return { id, key };
  }

  async function exists(id: string) {
    return Boolean(
      await env.DB.prepare("SELECT 1 AS x FROM media_assets WHERE id = ?")
        .bind(id)
        .first(),
    );
  }

  it("removes pending and failed uploads older than 24 hours with their objects", async () => {
    const runAt = new Date(Date.now() + 3 * DAY);
    const stalePending = await insertUploadRow({
      state: "pending",
      createdAt: new Date(runAt.getTime() - 2 * DAY),
    });
    const staleFailed = await insertUploadRow({
      state: "failed",
      createdAt: new Date(runAt.getTime() - 25 * 60 * 60 * 1000),
    });
    const freshPending = await insertUploadRow({
      state: "pending",
      createdAt: new Date(runAt.getTime() - 60 * 60 * 1000),
    });
    const oldReady = await insertUploadRow({
      state: "ready",
      createdAt: new Date(runAt.getTime() - 30 * DAY),
    });

    const removed = await cleanupPendingUploads(env.DB, env.MEDIA, runAt);
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await exists(stalePending.id)).toBe(false);
    expect(await exists(staleFailed.id)).toBe(false);
    expect(await env.MEDIA.head(stalePending.key)).toBeNull();
    expect(await env.MEDIA.head(staleFailed.key)).toBeNull();
    expect(await exists(freshPending.id)).toBe(true);
    expect(await env.MEDIA.head(freshPending.key)).not.toBeNull();
    expect(await exists(oldReady.id)).toBe(true);
    expect(await env.MEDIA.head(oldReady.key)).not.toBeNull();
  });

  it("retries orphaned upload objects but never touches other keys", async () => {
    const runAt = new Date(Date.now() + 3 * DAY);
    const orphan = `media/2026/09/${crypto.randomUUID()}/lost.png`;
    await env.MEDIA.put(orphan, PNG);
    // Not an upload key (legacy file layout): left alone.
    const legacy = "media/legacy-reel.mp3";
    await env.MEDIA.put(legacy, MP3);
    const outside = `other/${crypto.randomUUID()}.png`;
    await env.MEDIA.put(outside, PNG);
    // Referenced by an external (legacy) asset URL: left alone.
    const referencedKey = `media/2026/08/${crypto.randomUUID()}/kept.mp3`;
    await env.MEDIA.put(referencedKey, MP3);
    await env.DB.prepare(
      "INSERT INTO media_assets (id, kind, source, state, external_url, provider, filename, created_at, updated_at) " +
        "VALUES (?, 'audio', 'external', 'ready', ?, 'direct', 'kept.mp3', ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        `https://media.kamelkyp.com/${referencedKey}`,
        now.toISOString(),
        now.toISOString(),
      )
      .run();

    await cleanupPendingUploads(env.DB, env.MEDIA, runAt);
    expect(await env.MEDIA.head(orphan)).toBeNull();
    expect(await env.MEDIA.head(legacy)).not.toBeNull();
    expect(await env.MEDIA.head(outside)).not.toBeNull();
    expect(await env.MEDIA.head(referencedKey)).not.toBeNull();
  });

  it("keeps young orphans (an upload may still be finishing) and works without a bucket", async () => {
    const young = `media/2026/09/${crypto.randomUUID()}/young.png`;
    await env.MEDIA.put(young, PNG);
    await cleanupPendingUploads(env.DB, env.MEDIA, new Date());
    expect(await env.MEDIA.head(young)).not.toBeNull();

    const runAt = new Date(Date.now() + 3 * DAY);
    const stale = await insertUploadRow({
      state: "pending",
      createdAt: new Date(runAt.getTime() - 2 * DAY),
    });
    expect(
      await cleanupPendingUploads(env.DB, undefined, runAt),
    ).toBeGreaterThanOrEqual(1);
    expect(await exists(stale.id)).toBe(false);
  });
});

describe("upload API routes", () => {
  function contextFor(testEnv: Env) {
    const context = createCloudflareContextProvider(
      testEnv,
      {} as ExecutionContext,
      { nonce: "n", requestId: "r" },
    );
    context.set(ownerContext, owner);
    return context;
  }

  async function csrf(testEnv: Env) {
    return createCsrfToken({
      subject: owner.subject,
      secret: testEnv.CSRF_SECRET,
      now: new Date(),
    });
  }

  function args(request: Request, testEnv: Env, params = {}) {
    return {
      request,
      params,
      context: contextFor(testEnv),
    } as unknown as ActionFunctionArgs;
  }

  it("answers 503 uploads_not_configured when the base URL is missing", async () => {
    const testEnv = createTestEnv({ DB: env.DB, MEDIA: env.MEDIA });
    const response = (await declareAction(
      args(
        new Request("https://kamelkyp.com/api/studio/media", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://kamelkyp.com",
            [STUDIO_CSRF_HEADER]: await csrf(testEnv),
          },
          body: JSON.stringify({
            filename: "a.png",
            mimeType: "image/png",
            sizeBytes: 10,
          }),
        }),
        testEnv,
      ),
    )) as Response;
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      code: "uploads_not_configured",
    });
  });

  it("declares, streams and returns the asset summary end to end", async () => {
    const testEnv = createTestEnv({
      DB: env.DB,
      MEDIA: env.MEDIA,
      MEDIA_PUBLIC_BASE_URL: BASE,
    });
    const token = await csrf(testEnv);
    const declared = (await declareAction(
      args(
        new Request("https://kamelkyp.com/api/studio/media", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://kamelkyp.com",
            [STUDIO_CSRF_HEADER]: token,
          },
          body: JSON.stringify({
            filename: "reel.png",
            mimeType: "image/png",
            sizeBytes: PNG.length,
          }),
        }),
        testEnv,
      ),
    )) as Response;
    expect(declared.status).toBe(201);
    const { assetId, uploadUrl } = (await declared.json()) as {
      assetId: string;
      uploadUrl: string;
    };
    expect(uploadUrl).toBe(`/api/studio/media/${assetId}/content`);

    const stored = (await contentAction(
      args(
        new Request(`https://kamelkyp.com${uploadUrl}`, {
          method: "PUT",
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(PNG.length),
            Origin: "https://kamelkyp.com",
            [STUDIO_CSRF_HEADER]: token,
          },
          body: PNG,
        }),
        testEnv,
        { id: assetId },
      ),
    )) as Response;
    expect(stored.status).toBe(200);
    const body = (await stored.json()) as {
      asset: { id: string; url: string; state: string; sizeBytes: number };
    };
    expect(body.asset).toMatchObject({
      id: assetId,
      state: "ready",
      sizeBytes: PNG.length,
    });
    expect(body.asset.url).toBe(
      `${BASE}/media/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, "0")}/${assetId}/reel.png`,
    );
  });

  it("maps refused uploads to JSON errors", async () => {
    const testEnv = createTestEnv({
      DB: env.DB,
      MEDIA: env.MEDIA,
      MEDIA_PUBLIC_BASE_URL: BASE,
    });
    const response = (await contentAction(
      args(
        new Request("https://kamelkyp.com/api/studio/media/nope/content", {
          method: "PUT",
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(PNG.length),
            Origin: "https://kamelkyp.com",
            [STUDIO_CSRF_HEADER]: await csrf(testEnv),
          },
          body: PNG,
        }),
        testEnv,
        { id: uniqueId("nope") },
      ),
    )) as Response;
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found" });
  });
});

// ---- Library, usage, metadata, delete safety ---------------------------------

type Result = {
  data: Record<string, unknown> & { ok?: boolean; code?: string };
  init: ResponseInit | null;
};

function form(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}

const libraryEnv = () =>
  createTestEnv({ DB: env.DB, MEDIA: env.MEDIA, MEDIA_PUBLIC_BASE_URL: BASE });

async function insertAsset(
  input: {
    kind?: "image" | "audio" | "video" | "document";
    filename?: string;
    alt?: { zh: string; en: string };
    title?: { zh: string; en: string };
    r2?: boolean;
    createdAt?: string;
    archived?: boolean;
  } = {},
) {
  const id = crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const filename = input.filename ?? `${id}.jpg`;
  const r2 = input.r2 ?? false;
  const key = r2 ? `media/2026/09/${id}/${filename}` : null;
  await env.DB.prepare(
    "INSERT INTO media_assets (id, kind, source, state, storage_key, external_url, provider, filename, " +
      "title_i18n, alt_i18n, created_at, updated_at, archived_at) VALUES (?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      input.kind ?? "image",
      r2 ? "r2" : "external",
      key,
      r2 ? null : `https://images.example.com/${id}/${filename}`,
      r2 ? "r2" : "direct",
      filename,
      JSON.stringify(input.title ?? { zh: "", en: "" }),
      JSON.stringify(input.alt ?? { zh: "替代", en: "Alt" }),
      createdAt,
      createdAt,
      input.archived ? createdAt : null,
    )
    .run();
  if (key) await env.MEDIA.put(key, PNG);
  return { id, key };
}

async function trackUsing(
  assets: { audioPreviewId?: string; artworkId?: string },
  publish: boolean,
) {
  const meta = await createEntity(
    env.DB,
    "music",
    { title: { zh: "訊號", en: "Signal" } },
    { now },
  );
  const content = MusicDraftSchema.parse({
    title: { zh: "訊號", en: "Signal" },
    artist: { zh: "Kamel", en: "Kamel" },
    audioPreviewId: assets.audioPreviewId ?? null,
    artworkId: assets.artworkId ?? null,
  });
  await saveEntity(env.DB, "music", meta.id, 0, content, now);
  if (publish) {
    const outcome = await publishEntity(env.DB, "music", meta.id, 1, now);
    expect(outcome.ok).toBe(true);
  }
  return meta.id;
}

describe("media library listing", () => {
  it("searches filename, title and alt text, newest first, with usage counts", async () => {
    const tag = uniqueId("lib").toLowerCase();
    const older = await insertAsset({
      filename: `${tag}-older.jpg`,
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const newer = await insertAsset({
      title: { zh: "", en: `Title ${tag}` },
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    const audio = await insertAsset({
      kind: "audio",
      filename: `${tag}.mp3`,
      alt: { zh: "", en: "" },
      createdAt: "2026-09-03T00:00:00.000Z",
    });
    await trackUsing({ audioPreviewId: audio.id }, false);

    const all = await listLibrary(env.DB, { q: tag });
    expect(all.items.map((row) => row.asset.id)).toEqual([
      audio.id,
      newer.id,
      older.id,
    ]);
    const audioRow = all.items[0];
    expect(audioRow?.usageCount).toBe(1);
    expect(audioRow?.publishedUsageCount).toBe(0);

    expect(
      (await listLibrary(env.DB, { q: tag, kind: "audio" })).items.map(
        (row) => row.asset.id,
      ),
    ).toEqual([audio.id]);
    expect(
      (await listLibrary(env.DB, { q: tag, usage: "used" })).items.map(
        (row) => row.asset.id,
      ),
    ).toEqual([audio.id]);
    expect(
      (await listLibrary(env.DB, { q: tag, usage: "unused" })).items.map(
        (row) => row.asset.id,
      ),
    ).toEqual([newer.id, older.id]);
  });

  it("filters images missing alt text and pages with a cursor", async () => {
    const tag = uniqueId("alt").toLowerCase();
    const missing = await insertAsset({
      filename: `${tag}-a.jpg`,
      alt: { zh: "有", en: "  " },
    });
    await insertAsset({ filename: `${tag}-b.jpg` });
    await insertAsset({
      kind: "audio",
      filename: `${tag}-c.mp3`,
      alt: { zh: "", en: "" },
    });
    expect(
      (await listLibrary(env.DB, { q: tag, missingAlt: true })).items.map(
        (row) => row.asset.id,
      ),
    ).toEqual([missing.id]);

    const first = await listLibrary(env.DB, { q: tag, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.next).not.toBeNull();
    const second = await listLibrary(env.DB, {
      q: tag,
      limit: 2,
      cursor: first.next ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
  });

  it("shows archived assets only in the archived view", async () => {
    const tag = uniqueId("arch").toLowerCase();
    const archived = await insertAsset({
      filename: `${tag}.jpg`,
      archived: true,
    });
    expect((await listLibrary(env.DB, { q: tag })).items).toHaveLength(0);
    expect(
      (await listLibrary(env.DB, { q: tag, archived: true })).items.map(
        (row) => row.asset.id,
      ),
    ).toEqual([archived.id]);
  });
});

describe("asset detail and usages", () => {
  it("lists every usage with the entry label, status and scope", async () => {
    const audio = await insertAsset({ kind: "audio", filename: "reel.mp3" });
    const trackId = await trackUsing({ audioPreviewId: audio.id }, true);
    await env.DB.prepare(
      "INSERT INTO media_usages (asset_id, entity_type, entity_id, field, scope) VALUES (?, 'site_settings', 'site', 'ogImageId', 'published')",
    )
      .bind(audio.id)
      .run();

    const detail = await getAssetWithUsages(env.DB, audio.id);
    expect(detail?.asset.id).toBe(audio.id);
    expect(detail?.usages).toEqual(
      expect.arrayContaining([
        {
          entityType: "music",
          entityId: trackId,
          field: "audioPreviewId",
          scope: "published",
          label: "訊號",
          status: "published",
        },
        {
          entityType: "music",
          entityId: trackId,
          field: "audioPreviewId",
          scope: "working",
          label: "訊號",
          status: "published",
        },
        {
          entityType: "site_settings",
          entityId: "site",
          field: "ogImageId",
          scope: "published",
          label: "Site settings",
          status: null,
        },
      ]),
    );
    expect(await getAssetWithUsages(env.DB, "missing")).toBeNull();
  });

  it("updates title, alt, caption, credit, focal point, tags and preview range", async () => {
    const image = await insertAsset({ alt: { zh: "", en: "" } });
    const updated = await updateAssetMetadata(
      env.DB,
      image.id,
      {
        title: { zh: "封面", en: "Cover" },
        alt: { zh: "錄音室", en: "The studio" },
        caption: { zh: "說明", en: "Caption" },
        credit: "Photo: Kamel",
        focalX: 0.25,
        focalY: 0.8,
        tags: ["studio", "cover", "studio"],
        previewStartSeconds: 5,
        previewEndSeconds: 35,
      },
      now,
    );
    expect(updated).toMatchObject({
      title: { zh: "封面", en: "Cover" },
      alt: { zh: "錄音室", en: "The studio" },
      caption: { zh: "說明", en: "Caption" },
      credit: "Photo: Kamel",
      focalX: 0.25,
      focalY: 0.8,
      tags: ["studio", "cover"],
      previewStartSeconds: 5,
      previewEndSeconds: 35,
    });
  });

  it("refuses personal names in public text and invalid ranges", async () => {
    const image = await insertAsset();
    const brand = await rejection(
      updateAssetMetadata(
        env.DB,
        image.id,
        { alt: { zh: "肖像", en: "Portrait of Kevin" } },
        now,
      ),
    );
    expect(brand).toMatchObject({ code: "invalid_content" });
    const range = await rejection(
      updateAssetMetadata(
        env.DB,
        image.id,
        { previewStartSeconds: 30, previewEndSeconds: 10 },
        now,
      ),
    );
    expect(range).toMatchObject({ code: "invalid_content" });
    const focal = await rejection(
      updateAssetMetadata(env.DB, image.id, { focalX: 2 }, now),
    );
    expect(focal).toMatchObject({ code: "invalid_content" });
  });
});

describe("delete safety", () => {
  it("refuses while published content uses the asset", async () => {
    const audio = await insertAsset({ kind: "audio", r2: true });
    await trackUsing({ audioPreviewId: audio.id }, true);
    const error = await rejection(
      deleteAsset(env.DB, env.MEDIA, audio.id, {
        acknowledgeDraftUsages: true,
      }),
    );
    expect(error).toMatchObject({ code: "media_asset_in_published_use" });
    expect(await getAssetWithUsages(env.DB, audio.id)).not.toBeNull();
    expect(await env.MEDIA.head(audio.key ?? "")).not.toBeNull();
  });

  it("asks before deleting an asset drafts use, then clears their references", async () => {
    const art = await insertAsset({ r2: true });
    const trackId = await trackUsing({ artworkId: art.id }, false);
    const warning = await rejection(
      deleteAsset(env.DB, env.MEDIA, art.id, { acknowledgeDraftUsages: false }),
    );
    expect(warning).toBeInstanceOf(DraftUsageError);
    expect((warning as DraftUsageError).usages).toEqual([
      expect.objectContaining({
        entityType: "music",
        entityId: trackId,
        field: "artworkId",
        scope: "working",
      }),
    ]);

    await deleteAsset(env.DB, env.MEDIA, art.id, {
      acknowledgeDraftUsages: true,
    });
    expect(await getAssetWithUsages(env.DB, art.id)).toBeNull();
    expect(await env.MEDIA.head(art.key ?? "")).toBeNull();
    const track = await getEntity(env.DB, "music", trackId);
    expect(track?.content.artworkId).toBeNull();
  });

  it("deletes an unused asset at once", async () => {
    const unused = await insertAsset({ r2: true });
    await deleteAsset(env.DB, env.MEDIA, unused.id, {
      acknowledgeDraftUsages: false,
    });
    expect(await getAssetWithUsages(env.DB, unused.id)).toBeNull();
    expect(await env.MEDIA.head(unused.key ?? "")).toBeNull();
  });
});

describe("media library actions", () => {
  it("registers an external URL and rebuilds the usage index", async () => {
    const registered = (await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({
        url: "https://www.youtube.com/watch?v=abc123",
        "title.zh": "影片",
        "title.en": "Video",
      }),
      intent: "register-url",
      now,
    })) as unknown as Result;
    expect(registered.data).toMatchObject({
      ok: true,
      asset: { kind: "video", filename: expect.any(String) },
    });

    const rebuilt = (await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({}),
      intent: "rebuild-usages",
      now,
    })) as unknown as Result;
    expect(rebuilt.data).toMatchObject({
      ok: true,
      assets: expect.any(Number),
      usages: expect.any(Number),
    });
  });

  it("answers delete refusals and unknown intents with codes", async () => {
    const art = await insertAsset();
    await trackUsing({ artworkId: art.id }, false);
    const refused = (await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({ id: art.id }),
      intent: "delete",
      now,
    })) as unknown as Result;
    expect(refused.init?.status).toBe(409);
    expect(refused.data).toMatchObject({
      ok: false,
      code: "media_asset_in_draft_use",
    });

    const accepted = (await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({ id: art.id, "acknowledgeDraftUsages:bool": "true" }),
      intent: "delete",
      now,
    })) as unknown as Result;
    expect(accepted.data).toMatchObject({ ok: true, deleted: art.id });

    const unknown = (await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({}),
      intent: "explode",
      now,
    })) as unknown as Result;
    expect(unknown.init?.status).toBe(422);
  });

  it("archives and restores assets", async () => {
    const asset = await insertAsset();
    await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({ id: asset.id }),
      intent: "archive",
      now,
    });
    expect(
      (await getAssetWithUsages(env.DB, asset.id))?.asset.archivedAt,
    ).not.toBeNull();
    await handleMediaLibraryAction({
      db: env.DB,
      env: libraryEnv(),
      formData: form({ id: asset.id }),
      intent: "restore",
      now,
    });
    expect(
      (await getAssetWithUsages(env.DB, asset.id))?.asset.archivedAt,
    ).toBeNull();
  });

  it("loads the library with upload availability and the analysis status", async () => {
    const data = await loadMediaLibrary({
      request: new Request("https://kamelkyp.com/studio/media?kind=image"),
      db: env.DB,
      env: createTestEnv({
        DB: env.DB,
        MEDIA: env.MEDIA,
        MEDIA_PUBLIC_BASE_URL: BASE,
        MEDIA_CORS_HOSTS: "media.example.test,raw.githubusercontent.com",
      }),
    });
    expect(data.filters.kind).toBe("image");
    expect(data.items.every((item) => item.summary.kind === "image")).toBe(
      true,
    );
    expect(data.uploads).toEqual({ enabled: true, host: "media.example.test" });
    expect(data.analysis).toEqual({
      host: "media.example.test",
      enabled: true,
      corsHosts: ["media.example.test", "raw.githubusercontent.com"],
    });

    const off = await loadMediaLibrary({
      request: new Request("https://kamelkyp.com/studio/media"),
      db: env.DB,
      env: createTestEnv({ DB: env.DB }),
    });
    expect(off.uploads).toEqual({ enabled: false, host: null });
    expect(off.analysis.enabled).toBe(false);
  });
});
