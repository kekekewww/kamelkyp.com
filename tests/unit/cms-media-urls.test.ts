import { describe, expect, it } from "vitest";
import { readMediaConfig } from "../../app/lib/cms/media/config.server";
import {
  assetUrl,
  DEFAULT_MEDIA_CONFIG,
  focalClasses,
  imageSources,
  type MediaConfig,
  toPlayableMedia,
} from "../../app/lib/cms/media/urls";
import type { MediaAsset } from "../../app/lib/cms/schemas/media-asset";

const config: MediaConfig = {
  publicBaseUrl: "https://cdn.example.com",
  uploadsEnabled: true,
  corsHosts: ["cdn.example.com"],
  r2Hosts: ["cdn.example.com", "media.kamelkyp.com"],
  imageTransformations: true,
};

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    kind: "image",
    source: "r2",
    state: "ready",
    storageKey: "media/2026/09/abc/cover image.jpg",
    externalUrl: null,
    provider: "r2",
    filename: "cover image.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    width: 1600,
    height: 900,
    durationMs: null,
    title: { zh: "封面", en: "Cover" },
    alt: { zh: "", en: "" },
    caption: { zh: "", en: "" },
    credit: null,
    focalX: null,
    focalY: null,
    previewStartSeconds: null,
    previewEndSeconds: null,
    tags: [],
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

describe("media configuration", () => {
  it("derives hosts and upload availability from the environment", () => {
    expect(
      readMediaConfig({
        MEDIA: {} as R2Bucket,
        MEDIA_PUBLIC_BASE_URL: "https://cdn.example.com/",
        MEDIA_CORS_HOSTS:
          "cdn.example.com, raw.githubusercontent.com, bad host",
        IMAGE_TRANSFORMATIONS: "on",
      }),
    ).toEqual({
      publicBaseUrl: "https://cdn.example.com",
      uploadsEnabled: true,
      corsHosts: ["cdn.example.com", "raw.githubusercontent.com"],
      r2Hosts: ["cdn.example.com", "media.kamelkyp.com"],
      imageTransformations: true,
    });
  });

  it("fails safe without a binding or with an insecure base URL", () => {
    const off = readMediaConfig({
      MEDIA_PUBLIC_BASE_URL: "http://cdn.example.com",
    });
    expect(off.publicBaseUrl).toBeNull();
    expect(off.uploadsEnabled).toBe(false);
    expect(off.corsHosts).toEqual(DEFAULT_MEDIA_CONFIG.corsHosts);
    expect(off.r2Hosts).toEqual(["media.kamelkyp.com"]);
    expect(off.imageTransformations).toBe(false);
  });
});

describe("asset URLs", () => {
  it("computes R2 URLs from the configured base and never stores a host", () => {
    expect(assetUrl(asset(), config)).toBe(
      "https://cdn.example.com/media/2026/09/abc/cover%20image.jpg",
    );
    expect(assetUrl(asset(), { ...config, publicBaseUrl: null })).toBeNull();
    expect(
      assetUrl(
        asset({
          source: "external",
          storageKey: null,
          externalUrl: "https://x.example/a.png",
        }),
        config,
      ),
    ).toBe("https://x.example/a.png");
  });

  it("builds a srcset without upscaling when transformations are on", () => {
    const sources = imageSources(asset(), config);
    expect(sources?.srcSet?.split(", ")).toEqual([
      "https://cdn.example.com/cdn-cgi/image/width=480,quality=82,format=auto,fit=scale-down/media/2026/09/abc/cover%20image.jpg 480w",
      "https://cdn.example.com/cdn-cgi/image/width=960,quality=82,format=auto,fit=scale-down/media/2026/09/abc/cover%20image.jpg 960w",
      "https://cdn.example.com/cdn-cgi/image/width=1440,quality=82,format=auto,fit=scale-down/media/2026/09/abc/cover%20image.jpg 1440w",
    ]);
    expect(sources).toMatchObject({ width: 1600, height: 900 });
    expect(
      imageSources(asset(), { ...config, imageTransformations: false }),
    ).toEqual({
      src: "https://cdn.example.com/media/2026/09/abc/cover%20image.jpg",
      width: 1600,
      height: 900,
    });
  });

  it("quantizes focal points into CSS classes", () => {
    expect(focalClasses(asset({ focalX: 0.1, focalY: 0.9 }))).toBe(
      "focal-x-0 focal-y-100",
    );
    expect(focalClasses(asset())).toBe("focal-x-50 focal-y-50");
  });

  it("turns audio and video assets into player items", () => {
    const audio = toPlayableMedia(
      asset({
        kind: "audio",
        storageKey: "media/reel.wav",
        previewStartSeconds: 5,
        previewEndSeconds: 20,
      }),
      config,
      "en",
    );
    expect(audio).toEqual({
      id: "asset-1",
      kind: "cloudflare_r2_audio",
      url: "https://cdn.example.com/media/reel.wav",
      title: "Cover",
      startSeconds: 5,
      endSeconds: 20,
    });
    const video = toPlayableMedia(
      asset({
        kind: "video",
        source: "external",
        provider: "youtube",
        storageKey: null,
        externalUrl: "https://youtu.be/abc123",
      }),
      config,
      "zh",
      { title: "Showreel" },
    );
    expect(video).toMatchObject({
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=abc123",
      title: "Showreel",
    });
  });
});
