/**
 * Media assets (content-schema §2.8). Client-safe types and row mapping.
 */
import { parseLocalizedText } from "../localized";
import type { EntryStatus, LocalizedText, UsageEntityType } from "../types";

export const MEDIA_KINDS = [
  "image",
  "audio",
  "video",
  "document",
  "embed",
  "link",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_PROVIDERS = [
  "r2",
  "youtube",
  "google_drive",
  "github_raw",
  "direct",
  "external_link",
] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  source: "r2" | "external";
  state: "pending" | "ready" | "failed";
  storageKey: string | null;
  externalUrl: string | null;
  provider: MediaProvider;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  title: LocalizedText;
  alt: LocalizedText;
  caption: LocalizedText;
  credit: string | null;
  focalX: number | null;
  focalY: number | null;
  previewStartSeconds: number | null;
  previewEndSeconds: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type MediaUsage = {
  entityType: UsageEntityType;
  entityId: string;
  field: string;
  scope: "working" | "published";
  label: string;
  status: EntryStatus | null;
};

export interface MediaAssetRow {
  id: string;
  kind: MediaKind;
  source: "r2" | "external";
  state: "pending" | "ready" | "failed";
  storage_key: string | null;
  external_url: string | null;
  provider: MediaProvider;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  title_i18n: string;
  alt_i18n: string;
  caption_i18n: string;
  credit: string | null;
  focal_x: number | null;
  focal_y: number | null;
  preview_start_seconds: number | null;
  preview_end_seconds: number | null;
  tags_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function parseTags(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function mediaAssetFromRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    state: row.state,
    storageKey: row.storage_key,
    externalUrl: row.external_url,
    provider: row.provider,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    title: parseLocalizedText(row.title_i18n),
    alt: parseLocalizedText(row.alt_i18n),
    caption: parseLocalizedText(row.caption_i18n),
    credit: row.credit,
    focalX: row.focal_x,
    focalY: row.focal_y,
    previewStartSeconds: row.preview_start_seconds,
    previewEndSeconds: row.preview_end_seconds,
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/** Which asset kinds each entity field accepts. */
export const IMAGE_KINDS: readonly MediaKind[] = ["image"];
export const AUDIO_KINDS: readonly MediaKind[] = ["audio"];
export const VIDEO_KINDS: readonly MediaKind[] = ["video", "embed"];
