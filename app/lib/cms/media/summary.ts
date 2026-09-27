/**
 * Compact asset description for Studio pickers and fields (client-safe).
 * Editor loaders send summaries of the assets a record references; the
 * picker search API returns the same shape.
 */
import type { MediaAsset, MediaKind } from "../schemas/media-asset";
import type { LocalizedText } from "../types";
import { assetUrl, type MediaConfig } from "./urls";

export interface MediaSummary {
  id: string;
  kind: MediaKind;
  filename: string;
  /** Public URL (null for an R2 asset without a configured base URL). */
  url: string | null;
  alt: LocalizedText;
  title?: LocalizedText;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  state?: MediaAsset["state"];
}

export function toMediaSummary(
  asset: MediaAsset,
  config: MediaConfig,
): MediaSummary {
  return {
    id: asset.id,
    kind: asset.kind,
    filename: asset.filename,
    url: assetUrl(asset, config),
    alt: asset.alt,
    title: asset.title,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    durationMs: asset.durationMs,
    width: asset.width,
    height: asset.height,
    state: asset.state,
  };
}

export function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || ms < 0) return null;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
