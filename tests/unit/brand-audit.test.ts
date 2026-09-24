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

// Source text of every app and Worker module, keyed by repository path.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      [
        "../../app/**/*.{ts,tsx,js,css,json,svg}",
        "../../workers/**/*.{ts,tsx,js}",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  ).map(([path, source]) => [path.replace(/^(\.\.\/)+/, ""), source]),
);

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
  });

  it("finds no personal-name variant in app or Worker sources", () => {
    expect(scan()).toEqual([]);
  });

  it("detects a planted variant (the scanner is live)", () => {
    const planted = ["Kevin Yang", "楊子賢", "kevinyaungputra@example.com"];
    for (const value of planted) {
      expect(DENY.some((term) => term.pattern.test(value))).toBe(true);
    }
    expect(DENY.some((term) => term.pattern.test("Kamel"))).toBe(false);
  });
});
