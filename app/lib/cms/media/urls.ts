/**
 * Media URL helpers (client-safe, content-architecture §4.5–4.6). Every public
 * URL of an R2 asset is computed from the configured base URL at render time,
 * so moving hosts is a config change; nothing stores or hard-codes a host.
 */
import type { MediaItem } from "../../media/media-schema";
import { parseMediaUrl } from "../../media/parse-media-url";
import { localize } from "../localized";
import type { MediaAsset } from "../schemas/media-asset";
import type { Locale } from "../types";

/** Serializable media configuration (loader data / React context). */
export interface MediaConfig {
  /** `https://media.kamelkyp.com`, no trailing slash; null = not configured. */
  publicBaseUrl: string | null;
  /** R2 binding and base URL both present. */
  uploadsEnabled: boolean;
  /** Hosts whose audio may be routed through Web Audio (CORS configured). */
  corsHosts: string[];
  /** Hosts treated as our R2 origin (base URL host + legacy host). */
  r2Hosts: string[];
  /** `/cdn-cgi/image/` responsive variants on the media zone. */
  imageTransformations: boolean;
}

export const LEGACY_R2_HOST = "media.kamelkyp.com";

/**
 * Safe default when no config is provided: exactly today's behaviour
 * (legacy R2 host, GitHub raw as the only CORS audio host, no uploads).
 */
export const DEFAULT_MEDIA_CONFIG: MediaConfig = Object.freeze({
  publicBaseUrl: null,
  uploadsEnabled: false,
  corsHosts: ["raw.githubusercontent.com"],
  r2Hosts: [LEGACY_R2_HOST],
  imageTransformations: false,
}) as MediaConfig;

type UrlAsset = Pick<MediaAsset, "source" | "storageKey" | "externalUrl">;

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Public URL of an asset, or null when an R2 asset has no base URL. */
export function assetUrl(asset: UrlAsset, config: MediaConfig): string | null {
  if (asset.source === "external") return asset.externalUrl;
  if (!asset.storageKey || !config.publicBaseUrl) return null;
  return `${config.publicBaseUrl}/${encodeKey(asset.storageKey)}`;
}

export interface ImageSources {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

export const DEFAULT_IMAGE_WIDTHS = [480, 960, 1440, 1920] as const;

/**
 * `src`/`srcset` for an image. With transformations on and an R2 asset, widths
 * above the original are dropped and each variant is a `/cdn-cgi/image/` URL
 * on the media host; otherwise the original URL with its dimensions.
 */
export function imageSources(
  asset: UrlAsset & Pick<MediaAsset, "width" | "height">,
  config: MediaConfig,
  options: {
    widths?: readonly number[];
    sizes?: string;
    quality?: number;
  } = {},
): ImageSources | null {
  const original = assetUrl(asset, config);
  if (!original) return null;
  const dimensions = {
    ...(asset.width ? { width: asset.width } : {}),
    ...(asset.height ? { height: asset.height } : {}),
  };
  if (
    !config.imageTransformations ||
    asset.source !== "r2" ||
    !asset.storageKey ||
    !config.publicBaseUrl
  ) {
    return { src: original, ...dimensions };
  }
  const quality = options.quality ?? 82;
  const widths = (options.widths ?? DEFAULT_IMAGE_WIDTHS).filter(
    (width) => !asset.width || width <= asset.width,
  );
  if (widths.length === 0) return { src: original, ...dimensions };
  const variant = (width: number) =>
    `${config.publicBaseUrl}/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=scale-down/${encodeKey(asset.storageKey ?? "")}`;
  const largest = widths[widths.length - 1] ?? widths[0] ?? 960;
  return {
    src: variant(largest),
    srcSet: widths.map((width) => `${variant(width)} ${width}w`).join(", "),
    ...(options.sizes ? { sizes: options.sizes } : {}),
    ...dimensions,
  };
}

/** Focal point → `focal-x-50 focal-y-25` classes (CSS maps to object-position). */
export function focalClasses(
  asset: Pick<MediaAsset, "focalX" | "focalY">,
): string {
  const quantize = (value: number | null) =>
    value === null ? 50 : Math.round(Math.min(1, Math.max(0, value)) * 4) * 25;
  return `focal-x-${quantize(asset.focalX)} focal-y-${quantize(asset.focalY)}`;
}

export function r2HostSet(config: MediaConfig): ReadonlySet<string> {
  return new Set(config.r2Hosts.map((host) => host.toLowerCase()));
}

/**
 * An audio/video/embed asset as the existing player `MediaItem`, or null when
 * it has no playable URL (validated with the existing `parseMediaUrl`).
 */
export function toPlayableMedia(
  asset: MediaAsset,
  config: MediaConfig,
  locale: Locale,
  override: {
    title?: string;
    startSeconds?: number | null;
    endSeconds?: number | null;
  } = {},
): MediaItem | null {
  const url = assetUrl(asset, config);
  if (!url) return null;
  const startSeconds =
    override.startSeconds !== undefined
      ? override.startSeconds
      : asset.previewStartSeconds;
  const endSeconds =
    override.endSeconds !== undefined
      ? override.endSeconds
      : asset.previewEndSeconds;
  let parsed: ReturnType<typeof parseMediaUrl>;
  try {
    parsed = parseMediaUrl(url, {
      startSeconds,
      endSeconds,
      r2Hosts: r2HostSet(config),
    });
  } catch {
    return null;
  }
  const title =
    override.title || localize(asset.title, locale) || asset.filename;
  return {
    id: asset.id,
    kind: parsed.kind,
    url: parsed.canonicalUrl,
    title: title.slice(0, 200) || asset.id,
    startSeconds,
    endSeconds,
  };
}
