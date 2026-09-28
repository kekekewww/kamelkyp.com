// Vitest strips CSS modules (even `?raw`) in this config, so read the files directly.
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCorsAudioHost } from "../../app/lib/motion/audio-level";
import { DUR, EASE, STAGGER, STAGGER_LINE } from "../../app/lib/motion/tokens";

const style = (file: string): string =>
  readFileSync(new URL(`../../app/styles/${file}`, import.meta.url), "utf8");

const css = style("tokens.css");
const globalCss = style("global.css");
const layoutCss = style("layout.css");
const componentsCss = style("components.css");
const motionCss = style("motion.css");
const mediaCss = style("media.css");

function cssValue(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`missing ${name}`);
  return match[1].trim();
}

describe("motion tokens", () => {
  it("mirror the CSS custom properties", () => {
    expect(cssValue("--dur-1")).toBe(`${DUR.d1}ms`);
    expect(cssValue("--dur-2")).toBe(`${DUR.d2}ms`);
    expect(cssValue("--dur-3")).toBe(`${DUR.d3}ms`);
    expect(cssValue("--dur-4")).toBe(`${DUR.d4}ms`);
    expect(cssValue("--dur-5")).toBe(`${DUR.d5}ms`);
    expect(cssValue("--stagger")).toBe(`${STAGGER}ms`);
    expect(cssValue("--stagger-line")).toBe(`${STAGGER_LINE}ms`);
    expect(cssValue("--ease-out-quart")).toBe(EASE.outQuart);
    expect(cssValue("--ease-out-expo")).toBe(EASE.outExpo);
    expect(cssValue("--ease-weighted")).toBe(EASE.weighted);
    expect(cssValue("--ease-in-out-quint")).toBe(EASE.inOutQuint);
    expect(cssValue("--ease-in-quart")).toBe(EASE.inQuart);
  });

  it("never declares an infinite animation in public CSS", () => {
    for (const source of [
      css,
      globalCss,
      layoutCss,
      componentsCss,
      motionCss,
      mediaCss,
    ]) {
      expect(source).not.toMatch(/\binfinite\b/);
    }
  });
});

describe("audio analyser CORS gate", () => {
  const origin = "https://kamelkyp.com";
  const configured = ["raw.githubusercontent.com"];

  it("allows same-origin and the configured CORS hosts only", () => {
    expect(isCorsAudioHost("/audio/reel.mp3", configured, origin)).toBe(true);
    expect(
      isCorsAudioHost(
        "https://raw.githubusercontent.com/a/b/main/reel.mp3",
        configured,
        origin,
      ),
    ).toBe(true);
    expect(
      isCorsAudioHost(
        "https://media.kamelkyp.com/reel.mp3",
        configured,
        origin,
      ),
    ).toBe(false);
    expect(
      isCorsAudioHost(
        "http://raw.githubusercontent.com/x.mp3",
        configured,
        origin,
      ),
    ).toBe(false);
    expect(isCorsAudioHost("not a url", configured, null)).toBe(false);
  });

  it("follows the media configuration: adding a host enables analysis there", () => {
    const withBucket = new Set([
      "cdn.example.test",
      "raw.githubusercontent.com",
    ]);
    expect(
      isCorsAudioHost("https://CDN.example.test/a.mp3", withBucket, origin),
    ).toBe(true);
    expect(isCorsAudioHost("https://cdn.example.test/a.mp3", [], origin)).toBe(
      false,
    );
  });

  it("hard-codes no host in the audio plumbing or the players", () => {
    for (const file of [
      "../../app/lib/motion/audio-level.ts",
      "../../app/components/media/direct-audio-preview.tsx",
      "../../app/components/media/media-preview.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/githubusercontent|kamelkyp\.com/);
    }
  });
});
