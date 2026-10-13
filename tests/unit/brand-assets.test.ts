/**
 * Static brand assets in `public/` (WP4 §4.10, §6.1): generated once by
 * `scripts/generate-brand-assets.mjs` and committed. The tests check file
 * structure (signatures, sizes, the manifest), never pixel bytes, so a
 * Chromium update that changes the encoding does not break them (risk K8).
 */
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OG_IMAGE,
  SITE_ICON_PATHS,
} from "../../app/lib/seo/brand-assets";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Copied from tests/unit/brand-audit.test.ts (the public deny list). */
const DENY: readonly RegExp[] = [
  /楊子賢/,
  /子賢/,
  /kevinyaungputra/i,
  /\bkevin\s+yang\b/i,
  /yaung/i,
  /\bkevin\b/i,
  /\byang\b/i,
];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

function file(path: string): Uint8Array {
  return new Uint8Array(readFileSync(`public${path}`));
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}

function startsWithPng(bytes: Uint8Array, offset = 0): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[offset + index] === byte);
}

/** IHDR width and height (bytes 16–23) of a PNG. */
function pngSize(bytes: Uint8Array): [number, number] {
  return [u32(bytes, 16), u32(bytes, 20)];
}

const PNGS: ReadonlyArray<[string, number, number]> = [
  [DEFAULT_OG_IMAGE.path, DEFAULT_OG_IMAGE.width, DEFAULT_OG_IMAGE.height],
  [SITE_ICON_PATHS.icon32, 32, 32],
  [SITE_ICON_PATHS.appleTouch, 180, 180],
  ["/icons/icon-192.png", 192, 192],
  ["/icons/icon-512.png", 512, 512],
  ["/icons/icon-maskable-512.png", 512, 512],
];

describe("brand PNGs", () => {
  it.each(PNGS)("%s is a %ix%i PNG", (path, width, height) => {
    const bytes = file(path);
    expect(startsWithPng(bytes)).toBe(true);
    expect(pngSize(bytes)).toEqual([width, height]);
  });

  it("keeps the default share card 1200 × 630 and small", () => {
    expect([DEFAULT_OG_IMAGE.width, DEFAULT_OG_IMAGE.height]).toEqual([
      1200, 630,
    ]);
    expect(DEFAULT_OG_IMAGE.type).toBe("image/png");
    expect(file(DEFAULT_OG_IMAGE.path).byteLength).toBeLessThanOrEqual(
      500 * 1024,
    );
  });

  it.each(PNGS)("%s is opaque (no alpha channel)", (path) => {
    // IHDR colour type (byte 25): 2 = truecolour without alpha.
    expect(file(path)[25]).toBe(2);
  });
});

describe("favicon.ico", () => {
  it("wraps one 32 × 32 PNG", () => {
    const bytes = file("/favicon.ico");
    expect([...bytes.slice(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
    // ICONDIRENTRY: width, height (0 means 256), then size and data offset.
    expect([bytes[6], bytes[7]]).toEqual([32, 32]);
    const size = u32le(bytes, 6 + 8);
    const offset = u32le(bytes, 6 + 12);
    expect(offset).toBe(22);
    expect(offset + size).toBe(bytes.byteLength);
    expect(startsWithPng(bytes, offset)).toBe(true);
    expect(pngSize(bytes.slice(offset))).toEqual([32, 32]);
  });
});

describe("web app manifest", () => {
  const text = new TextDecoder().decode(file(SITE_ICON_PATHS.manifest));
  const manifest = JSON.parse(text) as {
    name: string;
    short_name: string;
    theme_color: string;
    background_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  } & Record<string, unknown>;

  it("names only Kamel and has no description", () => {
    expect(manifest.name).toBe("Kamel");
    expect(manifest.short_name).toBe("Kamel");
    expect(manifest).not.toHaveProperty("description");
    for (const pattern of DENY) expect(text).not.toMatch(pattern);
    expect(text).not.toMatch(EMAIL);
  });

  it("uses the background token and the document theme-color", () => {
    const tokens = new TextDecoder().decode(
      new Uint8Array(readFileSync("app/styles/tokens.css")),
    );
    const bg = tokens.match(/--color-bg:\s*(#[0-9a-f]{6})/i)?.[1];
    const root = new TextDecoder().decode(
      new Uint8Array(readFileSync("app/root.tsx")),
    );
    const theme = root.match(
      /name="theme-color" content="(#[0-9a-fA-F]{6})"/,
    )?.[1];
    expect(bg).toBeTruthy();
    for (const value of [manifest.theme_color, manifest.background_color]) {
      expect(value.toLowerCase()).toBe(bg?.toLowerCase());
      expect(value.toLowerCase()).toBe(theme?.toLowerCase());
    }
  });

  it("points every icon at an existing PNG of its declared size", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`), icon.src).toBe(true);
      expect(icon.type).toBe("image/png");
      const [width, height] = pngSize(file(icon.src));
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
    expect(
      manifest.icons.filter((icon) => icon.purpose === "maskable"),
    ).toHaveLength(1);
  });
});
