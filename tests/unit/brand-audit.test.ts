// Vitest strips CSS modules (even `?raw`) in this config, so stylesheets are
// read from disk (as in motion-tokens.test.ts).
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Brand audit (content-architecture §6.5): the only public identity is
 * "Kamel". No application or Worker source may carry a personal-name variant;
 * the deny list itself lives in the server-only brand guard, which is the one
 * exempt file. Settings and content come from D1 and are guarded on publish.
 */
const EXEMPT = new Set(["app/lib/cms/brand-guard.server.ts"]);

const DENY: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "楊子賢", pattern: /楊子賢/ },
  { label: "子賢", pattern: /子賢/ },
  { label: "kevinyaungputra", pattern: /kevinyaungputra/i },
  { label: "Kevin Yang", pattern: /\bkevin\s+yang\b/i },
  { label: "Yaung", pattern: /yaung/i },
  { label: "Kevin", pattern: /\bkevin\b/i },
  { label: "Yang", pattern: /\byang\b/i },
];

const repoPath = (path: string) => path.replace(/^(\.\.\/)+/, "");

/** File text read from disk, for sources Vitest would blank (CSS). */
function readText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

// Source text of every app and Worker module and stylesheet, keyed by
// repository path. Only the keys of the CSS glob are used (nothing is
// imported); the stylesheet text comes from disk.
const sources: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(
      import.meta.glob<string>(
        [
          "../../app/**/*.{ts,tsx,js,json,svg}",
          "../../workers/**/*.{ts,tsx,js}",
        ],
        { query: "?raw", import: "default", eager: true },
      ),
    ).map(([path, source]) => [repoPath(path), source]),
  ),
  ...Object.fromEntries(
    Object.keys(import.meta.glob("../../app/**/*.css")).map((path) => [
      repoPath(path),
      readText(path),
    ]),
  ),
};

function scan(): string[] {
  const hits: string[] = [];
  for (const [path, source] of Object.entries(sources)) {
    if (EXEMPT.has(path)) continue;
    source.split("\n").forEach((line, index) => {
      const term = DENY.find((entry) => entry.pattern.test(line));
      if (term) hits.push(`${path}:${index + 1} ${term.label}`);
    });
  }
  return hits.sort();
}

describe("brand audit", () => {
  it("reads the app and Worker sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(Object.keys(sources)).toContain("app/routes/public/home.tsx");
    expect(Object.keys(sources)).toContain("workers/app.ts");
    // Stylesheets are really read: a blanked CSS source would scan nothing.
    expect(sources["app/styles/global.css"]?.length).toBeGreaterThan(1000);
  });

  it("finds no personal-name variant in app or Worker sources", () => {
    expect(scan()).toEqual([]);
  });

  it("no stylesheet keeps a real-name hook", () => {
    const hooks = Object.entries(sources)
      .filter(([path]) => path.endsWith(".css"))
      .flatMap(([path, source]) =>
        source
          .split("\n")
          .flatMap((line, index) =>
            /real-name/.test(line) ? [`${path}:${index + 1}`] : [],
          ),
      );
    expect(hooks).toEqual([]);
  });

  it("detects a planted variant (the scanner is live)", () => {
    const planted = ["Kevin Yang", "楊子賢", "kevinyaungputra@example.com"];
    for (const value of planted) {
      expect(DENY.some((term) => term.pattern.test(value))).toBe(true);
    }
    expect(DENY.some((term) => term.pattern.test("Kamel"))).toBe(false);
  });
});
