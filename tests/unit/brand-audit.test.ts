// Vitest strips CSS modules (even `?raw`) in this config, so stylesheets are
// read from disk (as in motion-tokens.test.ts).
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Brand audit (content-architecture §6.5): the only public identity is
 * "Kamel". No application or Worker source may carry a personal-name variant;
 * the deny list itself lives in the server-only brand guard, which is the one
 * exempt file. Settings and content come from D1 and are guarded on publish.
 */
const EXEMPT = new Set(["app/lib/cms/brand-guard.server.ts"]);

type Term = { label: string; pattern: RegExp };

/** Invisible format characters that can hide inside a name. */
const INVISIBLE = /[\u{200B}-\u{200F}\u{2060}-\u{2064}\u{FEFF}]/gu;
/** Separators that can split or join a name: `KevinYang`, `kevin_yang`. */
const SEPARATORS = /[\s_\-.]/g;

/**
 * Matched against the folded line with every separator removed, so spacing,
 * `_`, `-` or `.` cannot split these.
 */
const JOINED: ReadonlyArray<Term> = [
  { label: "楊子賢", pattern: /楊子賢/ },
  { label: "子賢", pattern: /子賢/ },
  { label: "kevinyaungputra", pattern: /kevinyaungputra/ },
  { label: "Kevin Yang", pattern: /kevinyang|yangkevin/ },
  { label: "Yaung", pattern: /yaung/ },
];
/**
 * Matched as a whole word, separators read as spaces, so "Kevinson" passes.
 * "Yang" alone is a common surname: collaborator credits such as "Yang Ming"
 * are shown as written, so Yang is denied only next to Kevin (above).
 */
const WORDS: ReadonlyArray<Term> = [{ label: "Kevin", pattern: /\bkevin\b/ }];

/**
 * NFKC folds fullwidth and other compatibility forms, invisible characters
 * are dropped, and case is folded before any term is compared.
 */
function fold(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();
}

function matchTerm(line: string): string | null {
  const folded = fold(line);
  const joined = folded.replace(SEPARATORS, "");
  const spaced = folded.replace(SEPARATORS, " ");
  return (
    JOINED.find((term) => term.pattern.test(joined))?.label ??
    WORDS.find((term) => term.pattern.test(spaced))?.label ??
    null
  );
}

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

// Static public files and repository scripts (WP4), Markdown beside the code,
// the root README and the Apps Script relay (all in the content-architecture
// §6 grep scope), kept in their own map: Vite cannot `?raw`-import the
// publicDir, so they are read from disk. `docs/` stays out (§6.2: historical
// specs and plans are kept as records).
const STATIC_FILES: ReadonlyArray<{ dir: string; pattern: RegExp }> = [
  { dir: "public", pattern: /\.(webmanifest|json|svg|txt|xml)$/ },
  { dir: "scripts", pattern: /\.(mjs|md)$/ },
  { dir: "app", pattern: /\.md$/ },
  { dir: "workers", pattern: /\.md$/ },
  { dir: "integrations", pattern: /\.(gs|js|ts|json|html|md)$/ },
];
const ROOT_FILES = ["README.md"];
const staticSources: Record<string, string> = Object.fromEntries(
  [
    ...STATIC_FILES.flatMap(({ dir, pattern }) =>
      (readdirSync(dir, { recursive: true }) as string[])
        .map((name) => `${dir}/${name.replaceAll("\\", "/")}`)
        .filter((file) => pattern.test(file)),
    ),
    ...ROOT_FILES,
  ].map((file) => [file, readFileSync(file, "utf8") as string]),
);

function scan(files: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [path, source] of Object.entries(files)) {
    if (EXEMPT.has(path)) continue;
    source.split("\n").forEach((line, index) => {
      const term = matchTerm(line);
      if (term) hits.push(`${path}:${index + 1} ${term}`);
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
    expect(scan(sources)).toEqual([]);
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

  it("reads the static public files, scripts, READMEs and the Apps Script relay", () => {
    expect(Object.keys(staticSources)).toEqual(
      expect.arrayContaining([
        "public/manifest.webmanifest",
        "scripts/generate-brand-assets.mjs",
        "README.md",
        "integrations/apps-script/Code.gs",
        "integrations/apps-script/README.md",
        "integrations/apps-script/appsscript.json",
      ]),
    );
  });

  it("finds no personal-name variant in public files, scripts, READMEs or integrations", () => {
    expect(scan(staticSources)).toEqual([]);
  });

  it.each([
    ["plain", "Kevin Yang", "Kevin Yang"],
    ["CJK", "楊子賢", "楊子賢"],
    ["email", "kevinyaungputra@example.com", "kevinyaungputra"],
    ["joined", "KevinYang", "Kevin Yang"],
    ["snake case", "kevin_yang", "Kevin Yang"],
    ["dotted", "kevin.yang", "Kevin Yang"],
    ["kebab case", "kevin-yang", "Kevin Yang"],
    ["surname first", "Yang Kevin", "Kevin Yang"],
    ["spaced CJK", "楊 子 賢", "楊子賢"],
    // Escaped so no invisible or lookalike character sits in this file.
    [
      "fullwidth",
      "\u{FF2B}\u{FF45}\u{FF56}\u{FF49}\u{FF4E} \u{FF39}\u{FF41}\u{FF4E}\u{FF47}",
      "Kevin Yang",
    ],
    ["fullwidth alone", "\u{FF4B}\u{FF45}\u{FF56}\u{FF49}\u{FF4E}", "Kevin"],
    ["ideographic space", "Kevin\u{3000}Yang", "Kevin Yang"],
    ["zero-width space", "Ke\u{200B}vin", "Kevin"],
    ["zero-width joiner", "Kevin\u{200D}Yang", "Kevin Yang"],
    ["word joiner", "Kev\u{2060}in Yang", "Kevin Yang"],
    ["invisible separator", "Kevin\u{2063}Yang", "Kevin Yang"],
    ["byte-order mark", "\u{FEFF}kevin", "Kevin"],
    ["right-to-left mark", "kevin\u{200F}yaung", "Yaung"],
    ["snake-case word", "by_kevin_", "Kevin"],
  ])(
    "detects a planted variant: %s (the scanner is live)",
    (_, value, label) => {
      expect(matchTerm(value)).toBe(label);
    },
  );

  it.each([
    "Kamel",
    // Collaborator credits are shown as written; Yang alone is a surname.
    "Yang Ming",
    "yang_ming",
    "Ming Yang",
    "楊明",
    "Kevinson Synth",
  ])("allows %s", (value) => {
    expect(matchTerm(value)).toBeNull();
  });

  it("flags a planted variant in Markdown or the Apps Script relay", () => {
    expect(
      scan({
        "README.md": "Built by \u{FF2B}\u{FF45}\u{FF56}\u{FF49}\u{FF4E}",
        "integrations/apps-script/Code.gs": "// owner: kevin_yang",
        "app/notes.md": "Ke\u{200B}vin",
        "integrations/apps-script/README.md": "Credits: Yang Ming",
      }),
    ).toEqual([
      "README.md:1 Kevin",
      "app/notes.md:1 Kevin",
      "integrations/apps-script/Code.gs:1 Kevin Yang",
    ]);
  });
});
