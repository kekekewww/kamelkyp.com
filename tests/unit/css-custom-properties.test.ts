// Vitest strips CSS modules (even `?raw`) in this config, so stylesheets are
// read from disk (as in motion-tokens.test.ts).
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A `var(--name)` with no fallback whose property no stylesheet declares
 * computes to the property's initial value, silently: no build or lint step
 * reports it. This pins that every such read names a declared token, so a
 * retired token (the legacy aliases of tokens.css, plan C3 a) cannot be
 * used again by mistake.
 */
const stylesheets = Object.keys(import.meta.glob("../../app/**/*.css")).map(
  (path) => ({
    file: path.replace(/^(\.\.\/)+/, ""),
    css: readFileSync(new URL(path, import.meta.url), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    ),
  }),
);

describe("CSS custom properties", () => {
  it("reads the app stylesheets", () => {
    expect(stylesheets.map(({ file }) => file)).toContain(
      "app/styles/tokens.css",
    );
  });

  it("reads no property without a fallback that no stylesheet declares", () => {
    const declared = new Set(
      stylesheets.flatMap(({ css }) =>
        [...css.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)].map((m) => m[1]),
      ),
    );
    const undeclared = stylesheets.flatMap(({ file, css }) =>
      [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .filter((m) => !declared.has(m[1]))
        .map((m) => `${file}: ${m[1]}`),
    );
    expect(undeclared).toEqual([]);
  });
});
