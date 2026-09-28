import { describe, expect, it, vi } from "vitest";
import {
  extractMediaMetadata,
  type MetadataProbes,
} from "../../app/lib/cms/media/metadata.client";

const file = (name: string, type: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe("client-side metadata extraction", () => {
  it("reads image dimensions through the image probe", async () => {
    const probes: MetadataProbes = {
      image: vi.fn(async () => ({ width: 1600, height: 900 })),
      media: vi.fn(),
    };
    await expect(
      extractMediaMetadata(file("a.png", "image/png"), "image", probes),
    ).resolves.toEqual({ width: 1600, height: 900 });
    expect(probes.media).not.toHaveBeenCalled();
  });

  it("reads audio duration in milliseconds and ignores dimensions", async () => {
    const probes: MetadataProbes = {
      image: vi.fn(),
      media: vi.fn(async () => ({
        duration: 183.4567,
        videoWidth: 0,
        videoHeight: 0,
      })),
    };
    await expect(
      extractMediaMetadata(file("a.mp3", "audio/mpeg"), "audio", probes),
    ).resolves.toEqual({ durationMs: 183_457 });
    expect(probes.media).toHaveBeenCalledWith(expect.any(File), "audio");
  });

  it("reads video duration and frame size", async () => {
    const probes: MetadataProbes = {
      image: vi.fn(),
      media: vi.fn(async () => ({
        duration: 12,
        videoWidth: 1920,
        videoHeight: 1080,
      })),
    };
    await expect(
      extractMediaMetadata(file("a.mp4", "video/mp4"), "video", probes),
    ).resolves.toEqual({ durationMs: 12_000, width: 1920, height: 1080 });
  });

  it("drops unusable values (infinite duration, zero sizes)", async () => {
    const probes: MetadataProbes = {
      image: vi.fn(async () => ({ width: 0, height: 10 })),
      media: vi.fn(async () => ({
        duration: Number.POSITIVE_INFINITY,
        videoWidth: 0,
        videoHeight: 0,
      })),
    };
    await expect(
      extractMediaMetadata(file("a.webm", "video/webm"), "video", probes),
    ).resolves.toEqual({});
    await expect(
      extractMediaMetadata(file("a.gif", "image/gif"), "image", probes),
    ).resolves.toEqual({});
  });

  it("never fails the upload when probing fails or hangs", async () => {
    const failing: MetadataProbes = {
      image: vi.fn(async () => {
        throw new Error("decode failed");
      }),
      media: vi.fn(() => new Promise<never>(() => {})),
    };
    await expect(
      extractMediaMetadata(file("a.avif", "image/avif"), "image", failing),
    ).resolves.toEqual({});
    await expect(
      extractMediaMetadata(file("a.flac", "audio/flac"), "audio", failing, 20),
    ).resolves.toEqual({});
  });

  it("has nothing to read for documents", async () => {
    const probes: MetadataProbes = { image: vi.fn(), media: vi.fn() };
    await expect(
      extractMediaMetadata(
        file("a.pdf", "application/pdf"),
        "document",
        probes,
      ),
    ).resolves.toEqual({});
    expect(probes.image).not.toHaveBeenCalled();
    expect(probes.media).not.toHaveBeenCalled();
  });
});
