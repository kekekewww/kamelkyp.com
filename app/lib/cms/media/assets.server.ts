/**
 * Media asset store (content-schema §5.2): lookups, picker search and
 * external URL registration. Uploads (R2) live in `upload.server.ts` (P2).
 */
import { parseMediaUrl } from "../../media/parse-media-url";
import { CmsError } from "../db/errors";
import { emptyText } from "../localized";
import {
  type MediaAsset,
  type MediaAssetRow,
  type MediaKind,
  type MediaProvider,
  mediaAssetFromRow,
} from "../schemas/media-asset";
import type { LocalizedText } from "../types";
import { type MediaConfig, r2HostSet } from "./urls";

const COLUMNS =
  "id, kind, source, state, storage_key, external_url, provider, filename, mime_type, " +
  "size_bytes, width, height, duration_ms, title_i18n, alt_i18n, caption_i18n, credit, " +
  "focal_x, focal_y, preview_start_seconds, preview_end_seconds, tags_json, " +
  "created_at, updated_at, archived_at";

export async function getAsset(
  db: D1Database,
  id: string,
): Promise<MediaAsset | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM media_assets WHERE id = ?`)
    .bind(id)
    .first<MediaAssetRow>();
  return row ? mediaAssetFromRow(row) : null;
}

/** Batched lookup (one statement, any number of ids). */
export async function getAssets(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, MediaAsset>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM media_assets WHERE id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(unique))
    .all<MediaAssetRow>();
  return new Map(
    rows.results.map((row) => [row.id, mediaAssetFromRow(row)] as const),
  );
}

function encodeCursor(asset: { createdAt: string; id: string }): string {
  return encodeURIComponent(`${asset.createdAt}|${asset.id}`);
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [createdAt, id] = decodeURIComponent(cursor).split("|");
  return createdAt && id ? { createdAt, id } : null;
}

/** Picker search: ready, non-archived assets, newest first. */
export async function searchAssets(
  db: D1Database,
  query: { text?: string; kind?: MediaKind; limit: number; cursor?: string },
): Promise<{ items: MediaAsset[]; next: string | null }> {
  const limit = Math.min(Math.max(query.limit, 1), 50);
  const cursor = decodeCursor(query.cursor);
  const text = query.text?.trim().toLowerCase() || null;
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM media_assets
       WHERE state = 'ready' AND archived_at IS NULL
         AND (?1 IS NULL OR kind = ?1)
         AND (?2 IS NULL OR instr(lower(filename || ' ' || title_i18n || ' ' || alt_i18n || ' ' || COALESCE(credit, '')), ?2) > 0)
         AND (?3 IS NULL OR created_at < ?3 OR (created_at = ?3 AND id < ?4))
       ORDER BY created_at DESC, id DESC
       LIMIT ?5`,
    )
    .bind(
      query.kind ?? null,
      text,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      limit + 1,
    )
    .all<MediaAssetRow>();
  const items = rows.results.slice(0, limit).map(mediaAssetFromRow);
  const last = items[items.length - 1];
  return {
    items,
    next: rows.results.length > limit && last ? encodeCursor(last) : null,
  };
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|gif)$/i;
const VIDEO_EXTENSION = /\.(mp4|webm)$/i;
const PDF_EXTENSION = /\.pdf$/i;

/** Kind and provider for an external URL (existing `parseMediaUrl` allowlist). */
export function classifyExternalUrl(
  url: string,
  config: MediaConfig,
): { kind: MediaKind; provider: MediaProvider; canonicalUrl: string } {
  let parsed: ReturnType<typeof parseMediaUrl>;
  try {
    parsed = parseMediaUrl(url, {
      startSeconds: null,
      endSeconds: null,
      r2Hosts: r2HostSet(config),
    });
  } catch {
    throw new CmsError("invalid_content", {
      issues: [
        {
          field: "url",
          code: "invalid_url",
          message: "Use an https:// address.",
        },
      ],
    });
  }
  switch (parsed.kind) {
    case "youtube":
      return {
        kind: "video",
        provider: "youtube",
        canonicalUrl: parsed.canonicalUrl,
      };
    case "google_drive":
      return {
        kind: "embed",
        provider: "google_drive",
        canonicalUrl: parsed.canonicalUrl,
      };
    case "github_raw_audio":
      return {
        kind: "audio",
        provider: "github_raw",
        canonicalUrl: parsed.canonicalUrl,
      };
    case "direct_audio":
    case "cloudflare_r2_audio":
      return {
        kind: "audio",
        provider: "direct",
        canonicalUrl: parsed.canonicalUrl,
      };
    case "external_link": {
      const pathname = new URL(parsed.canonicalUrl).pathname;
      const dropboxLike = /(^|\.)(dropbox|mediafire)\.com$/.test(
        new URL(parsed.canonicalUrl).hostname,
      );
      if (!dropboxLike && IMAGE_EXTENSION.test(pathname)) {
        return {
          kind: "image",
          provider: "direct",
          canonicalUrl: parsed.canonicalUrl,
        };
      }
      if (!dropboxLike && VIDEO_EXTENSION.test(pathname)) {
        return {
          kind: "video",
          provider: "direct",
          canonicalUrl: parsed.canonicalUrl,
        };
      }
      if (!dropboxLike && PDF_EXTENSION.test(pathname)) {
        return {
          kind: "document",
          provider: "direct",
          canonicalUrl: parsed.canonicalUrl,
        };
      }
      return {
        kind: "link",
        provider: "external_link",
        canonicalUrl: parsed.canonicalUrl,
      };
    }
  }
}

function filenameFromUrl(url: string): string {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).pop();
  let name = parsed.hostname;
  if (last) {
    try {
      name = decodeURIComponent(last);
    } catch {
      name = last;
    }
  }
  return name.slice(0, 255) || "external-media";
}

/** Registers an external URL as a ready asset (returns the existing one if already registered). */
export async function registerExternalAsset(
  db: D1Database,
  input: { url: string; title?: LocalizedText; alt?: LocalizedText },
  config: MediaConfig,
  now: Date = new Date(),
): Promise<MediaAsset> {
  const { kind, provider, canonicalUrl } = classifyExternalUrl(
    input.url.trim(),
    config,
  );
  const existing = await db
    .prepare(
      `SELECT ${COLUMNS} FROM media_assets WHERE external_url = ? AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
    )
    .bind(canonicalUrl)
    .first<MediaAssetRow>();
  if (existing) return mediaAssetFromRow(existing);

  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  await db
    .prepare(
      "INSERT INTO media_assets (id, kind, source, state, external_url, provider, filename, " +
        "title_i18n, alt_i18n, created_at, updated_at) VALUES (?, ?, 'external', 'ready', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      kind,
      canonicalUrl,
      provider,
      filenameFromUrl(canonicalUrl),
      JSON.stringify(input.title ?? emptyText()),
      JSON.stringify(input.alt ?? emptyText()),
      timestamp,
      timestamp,
    )
    .run();
  const created = await getAsset(db, id);
  if (!created) throw new CmsError("not_found");
  return created;
}
