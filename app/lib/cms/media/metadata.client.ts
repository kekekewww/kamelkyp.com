/**
 * Client-side metadata for an upload (content-architecture §4.4): images via
 * `createImageBitmap(file)`, audio/video via a media element on a `blob:`
 * URL reading `duration`, `videoWidth`, `videoHeight`. The values are
 * advisory (the Worker clamps them) and probing never blocks an upload: a
 * failure or a slow decoder simply yields no value.
 *
 * Browser-only (`.client`): call from event handlers and effects.
 */
import type { UploadKind } from "./signatures";

export interface ExtractedMetadata {
  width?: number;
  height?: number;
  durationMs?: number;
}

type MediaProbeResult = {
  duration: number;
  videoWidth: number;
  videoHeight: number;
};

export interface MetadataProbes {
  image: (file: Blob) => Promise<{ width: number; height: number }>;
  media: (file: Blob, kind: "audio" | "video") => Promise<MediaProbeResult>;
}

async function probeImage(file: Blob) {
  if (typeof createImageBitmap !== "function") {
    throw new Error("image_probe_unavailable");
  }
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function probeMedia(
  file: Blob,
  kind: "audio" | "video",
): Promise<MediaProbeResult> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = () => {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      resolve({
        duration: element.duration,
        videoWidth: kind === "video" ? video.videoWidth : 0,
        videoHeight: kind === "video" ? video.videoHeight : 0,
      });
      done();
    };
    element.onerror = () => {
      reject(new Error("media_probe_failed"));
      done();
    };
    element.src = url;
  });
}

export const browserProbes: MetadataProbes = {
  image: probeImage,
  media: probeMedia,
};

function positiveInt(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function extractMediaMetadata(
  file: File,
  kind: UploadKind,
  probes: MetadataProbes = browserProbes,
  timeoutMs = 8000,
): Promise<ExtractedMetadata> {
  try {
    if (kind === "image") {
      const size = await withTimeout(probes.image(file), timeoutMs);
      const width = positiveInt(size.width);
      const height = positiveInt(size.height);
      return width && height ? { width, height } : {};
    }
    if (kind === "audio" || kind === "video") {
      const media = await withTimeout(probes.media(file, kind), timeoutMs);
      const result: ExtractedMetadata = {};
      const durationMs = positiveInt(media.duration * 1000);
      if (durationMs) result.durationMs = durationMs;
      if (kind === "video") {
        const width = positiveInt(media.videoWidth);
        const height = positiveInt(media.videoHeight);
        if (width && height) Object.assign(result, { width, height });
      }
      return result;
    }
  } catch {
    // Advisory only: upload without it.
  }
  return {};
}
