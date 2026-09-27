import { describe, expect, it } from "vitest";
import {
  acceptAttribute,
  canonicalMimeType,
  checkUploadDeclaration,
  matchesSignature,
  SIGNATURE_BYTES,
  UPLOAD_RULES,
  uploadKindForMime,
} from "../../app/lib/cms/media/signatures";

const MB = 1024 * 1024;

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      for (const char of value) out.push(char.charCodeAt(0));
    } else {
      out.push(value);
    }
  }
  while (out.length < SIGNATURE_BYTES) out.push(0);
  return new Uint8Array(out);
}

describe("upload allowlist", () => {
  it("lists exactly the documented MIME types and limits per kind", () => {
    expect(UPLOAD_RULES.image.mimeTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
    ]);
    expect(UPLOAD_RULES.audio.mimeTypes).toEqual([
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/aac",
      "audio/mp4",
      "audio/ogg",
      "audio/flac",
    ]);
    expect(UPLOAD_RULES.video.mimeTypes).toEqual(["video/mp4", "video/webm"]);
    expect(UPLOAD_RULES.document.mimeTypes).toEqual(["application/pdf"]);
    expect(UPLOAD_RULES.image.maxBytes).toBe(20 * MB);
    expect(UPLOAD_RULES.audio.maxBytes).toBe(95 * MB);
    expect(UPLOAD_RULES.video.maxBytes).toBe(95 * MB);
    expect(UPLOAD_RULES.document.maxBytes).toBe(20 * MB);
  });

  it("maps MIME types to kinds and refuses SVG, HTML and unknown types", () => {
    expect(uploadKindForMime("image/png")).toBe("image");
    expect(uploadKindForMime("audio/flac")).toBe("audio");
    expect(uploadKindForMime("video/webm")).toBe("video");
    expect(uploadKindForMime("application/pdf")).toBe("document");
    expect(uploadKindForMime("IMAGE/JPEG; charset=binary")).toBe("image");
    expect(uploadKindForMime("image/svg+xml")).toBeNull();
    expect(uploadKindForMime("text/html")).toBeNull();
    expect(uploadKindForMime("application/octet-stream")).toBeNull();
    expect(uploadKindForMime("")).toBeNull();
  });

  it("canonicalizes browser aliases and falls back to the extension", () => {
    expect(canonicalMimeType("audio/x-m4a", "take.m4a")).toBe("audio/mp4");
    expect(canonicalMimeType("audio/mp3", "a.mp3")).toBe("audio/mpeg");
    expect(canonicalMimeType("audio/x-flac", "a.flac")).toBe("audio/flac");
    expect(canonicalMimeType("audio/wave", "a.wav")).toBe("audio/wav");
    expect(canonicalMimeType("image/jpg", "a.jpg")).toBe("image/jpeg");
    expect(canonicalMimeType("", "Mix v2.FLAC")).toBe("audio/flac");
    expect(canonicalMimeType("", "cover.webp")).toBe("image/webp");
    expect(canonicalMimeType("", "notes.txt")).toBe("");
    expect(canonicalMimeType("image/svg+xml", "logo.svg")).toBe(
      "image/svg+xml",
    );
  });

  it("builds an accept attribute for one kind or for all kinds", () => {
    expect(acceptAttribute("image")).toBe(
      "image/jpeg,image/png,image/webp,image/avif,image/gif,.jpg,.jpeg,.png,.webp,.avif,.gif",
    );
    expect(acceptAttribute()).toContain("application/pdf");
    expect(acceptAttribute()).toContain(".m4a");
    expect(acceptAttribute("embed")).toBe(acceptAttribute());
  });
});

describe("upload declaration", () => {
  it("accepts an allowed type within its limit", () => {
    expect(
      checkUploadDeclaration({ mimeType: "audio/mpeg", sizeBytes: 90 * MB }),
    ).toEqual({ ok: true, kind: "audio", mimeType: "audio/mpeg" });
  });

  it("refuses unknown types with 415 and oversized files with 413", () => {
    expect(
      checkUploadDeclaration({ mimeType: "image/svg+xml", sizeBytes: 10 }),
    ).toMatchObject({ ok: false, code: "unsupported_media_type", status: 415 });
    expect(
      checkUploadDeclaration({
        mimeType: "image/png",
        sizeBytes: 20 * MB + 1,
      }),
    ).toMatchObject({
      ok: false,
      code: "file_too_large",
      status: 413,
      maxBytes: 20 * MB,
    });
    expect(
      checkUploadDeclaration({ mimeType: "video/mp4", sizeBytes: 96 * MB }),
    ).toMatchObject({ ok: false, code: "file_too_large", maxBytes: 95 * MB });
  });

  it("refuses empty files and non-integer sizes", () => {
    expect(
      checkUploadDeclaration({ mimeType: "image/png", sizeBytes: 0 }),
    ).toMatchObject({ ok: false, code: "empty_file", status: 422 });
    expect(
      checkUploadDeclaration({ mimeType: "image/png", sizeBytes: 1.5 }),
    ).toMatchObject({ ok: false, code: "empty_file" });
  });

  it("restricts to the kind the field expects when one is given", () => {
    expect(
      checkUploadDeclaration(
        { mimeType: "audio/mpeg", sizeBytes: 100 },
        "image",
      ),
    ).toMatchObject({ ok: false, code: "unsupported_media_type" });
  });
});

describe("file signatures", () => {
  const table: Array<[string, Uint8Array]> = [
    ["image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)],
    ["image/gif", bytes("GIF89a")],
    ["image/webp", bytes("RIFF", 1, 2, 3, 4, "WEBP")],
    ["image/avif", bytes(0, 0, 0, 0x1c, "ftypavif")],
    ["audio/wav", bytes("RIFF", 1, 2, 3, 4, "WAVE")],
    ["audio/x-wav", bytes("RIFF", 1, 2, 3, 4, "WAVE")],
    ["audio/mp4", bytes(0, 0, 0, 0x20, "ftypM4A ")],
    ["video/mp4", bytes(0, 0, 0, 0x18, "ftypisom")],
    ["video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3)],
    ["audio/flac", bytes("fLaC")],
    ["audio/ogg", bytes("OggS")],
    ["audio/mpeg", bytes("ID3", 4, 0)],
    ["audio/mpeg", bytes(0xff, 0xfb, 0x90)],
    ["audio/mpeg", bytes(0xff, 0xf3)],
    ["audio/aac", bytes(0xff, 0xf1, 0x50)],
    ["application/pdf", bytes("%PDF-1.7")],
  ];

  it.each(table)("accepts a real %s header", (mime, header) => {
    expect(matchesSignature(mime, header)).toBe(true);
  });

  it("refuses mismatched headers", () => {
    expect(matchesSignature("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(
      matchesSignature("image/webp", bytes("RIFF", 1, 2, 3, 4, "WAVE")),
    ).toBe(false);
    expect(
      matchesSignature("audio/wav", bytes("RIFF", 1, 2, 3, 4, "WEBP")),
    ).toBe(false);
    expect(matchesSignature("application/pdf", bytes("<html>"))).toBe(false);
    expect(matchesSignature("audio/mpeg", bytes("<svg"))).toBe(false);
    expect(matchesSignature("audio/mpeg", bytes(0xff, 0x00))).toBe(false);
    expect(matchesSignature("video/mp4", bytes("RIFF"))).toBe(false);
  });

  it("refuses types outside the allowlist and headers that are too short", () => {
    expect(matchesSignature("image/svg+xml", bytes("<svg"))).toBe(false);
    expect(matchesSignature("image/png", new Uint8Array([0x89, 0x50]))).toBe(
      false,
    );
  });
});
