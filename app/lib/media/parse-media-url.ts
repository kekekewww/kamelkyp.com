import type { MediaKind } from "./media-schema";

export interface ParsedMediaUrl {
  kind: MediaKind;
  canonicalUrl: string;
  embedUrl: string | null;
  provider: "youtube" | "google_drive" | "direct" | "external";
}

export interface ParseMediaUrlOptions {
  startSeconds: number | null;
  endSeconds: number | null;
  r2Hosts: ReadonlySet<string>;
}

const AUDIO_EXTENSION = /\.(wav|mp3|m4a|aac|ogg|flac)$/i;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const EXTERNAL_ONLY_HOST_SUFFIXES = ["dropbox.com", "mediafire.com"];

function assertRange(start: number | null, end: number | null) {
  const invalidStart =
    start !== null && (!Number.isInteger(start) || start < 0);
  const invalidEnd = end !== null && (!Number.isInteger(end) || end < 0);
  if (
    invalidStart ||
    invalidEnd ||
    (start !== null && end !== null && end <= start)
  ) {
    throw new Error("invalid_preview_range");
  }
}

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  if (
    url.pathname.startsWith("/shorts/") ||
    url.pathname.startsWith("/embed/")
  ) {
    return url.pathname.split("/")[2] ?? null;
  }
  return null;
}

function driveId(url: URL): string | null {
  if (!new Set(["drive.google.com", "docs.google.com"]).has(url.hostname)) {
    return null;
  }
  const fileMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  return fileMatch?.[1] ?? url.searchParams.get("id");
}

function parseHttpsUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("https_required");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("https_required");
  }
  url.hostname = url.hostname.toLowerCase();
  return url;
}

export function parseMediaUrl(
  input: string,
  options: ParseMediaUrlOptions,
): ParsedMediaUrl {
  assertRange(options.startSeconds, options.endSeconds);
  const url = parseHttpsUrl(input);

  const videoId = youtubeId(url);
  if (videoId && SAFE_ID.test(videoId) && videoId.length <= 20) {
    const params = new URLSearchParams();
    if (options.startSeconds !== null) {
      params.set("start", String(options.startSeconds));
    }
    if (options.endSeconds !== null) {
      params.set("end", String(options.endSeconds));
    }
    params.set("autoplay", "0");
    return {
      kind: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${params}`,
      provider: "youtube",
    };
  }

  const googleDriveId = driveId(url);
  if (googleDriveId && SAFE_ID.test(googleDriveId)) {
    return {
      kind: "google_drive",
      canonicalUrl: url.toString(),
      embedUrl: `https://drive.google.com/file/d/${googleDriveId}/preview`,
      provider: "google_drive",
    };
  }

  if (
    url.hostname === "raw.githubusercontent.com" &&
    AUDIO_EXTENSION.test(url.pathname)
  ) {
    return {
      kind: "github_raw_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  const approvedR2Hosts = new Set(
    [...options.r2Hosts].map((hostname) => hostname.toLowerCase()),
  );
  if (approvedR2Hosts.has(url.hostname) && AUDIO_EXTENSION.test(url.pathname)) {
    return {
      kind: "cloudflare_r2_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  if (
    EXTERNAL_ONLY_HOST_SUFFIXES.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  ) {
    return {
      kind: "external_link",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "external",
    };
  }

  if (AUDIO_EXTENSION.test(url.pathname)) {
    return {
      kind: "direct_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  return {
    kind: "external_link",
    canonicalUrl: url.toString(),
    embedUrl: null,
    provider: "external",
  };
}
