/**
 * Static "nothing legacy left" audit for the retired /admin (wp5 §6.1):
 * no legacy admin module, stylesheet, guard or class name in `app/`, no
 * Studio UI copy about the legacy admin, and no `/admin` string literal
 * outside the files that answer or refuse those URLs on purpose.
 */
import { describe, expect, it } from "vitest";
import { STUDIO_NAV } from "../../app/components/studio/shell/nav";

// Raw source of every app module and stylesheet, keyed by "app/…" path.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../app/**/*.{ts,tsx,css}", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, source]) => [path.replace(/^(\.\.\/)+/, ""), source]),
);
const files = Object.keys(sources).sort();

// Pending wp3: Studio → Footer is still the stub panel, which links to the
// retired legacy editor. The exemption holds only while a route renders the
// stub; once none does, the stub must be deleted (wp5 §4.7, last case).
const FOOTER_ROUTE = "app/routes/studio/settings/footer.tsx";
const STUB_PANEL = "app/components/studio/shell/stub-panel.tsx";
const stubImporters = files.filter(
  (file) => file !== STUB_PANEL && /shell\/stub-panel["']/.test(sources[file]),
);
const FOOTER_STUB = new Set(
  stubImporters.includes(FOOTER_ROUTE) ? [FOOTER_ROUTE, STUB_PANEL] : [],
);

const exempt = (file: string) => FOOTER_STUB.has(file);

/** Files that answer or refuse the legacy URLs on purpose (plan §2.6). */
const ADMIN_LITERAL_ALLOWLIST = new Set([
  "app/routes.ts",
  "app/routes/admin-legacy-redirect.ts",
  "app/lib/cms/studio/legacy-admin.ts",
  "app/lib/security/headers.server.ts",
  // wp3: RESERVED_PATH_PREFIXES refuses footer links into private surfaces.
  "app/lib/cms/schemas/footer.ts",
]);

/** A string literal that starts with the retired path (WP4 mirrors it). */
const ADMIN_LITERAL = /["'`]\/admin(?:[/?"'`]|$)/m;

/**
 * Source without comments: JSDoc in this repo quotes paths in backtick code
 * spans, which are not string literals. `https://` and `"//"` survive.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("admin retirement audit", () => {
  it("reads the app sources", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("app/routes/admin-legacy-redirect.ts");
  });

  it("keeps no legacy admin module or stylesheet", () => {
    const retired = [
      /^app\/routes\/admin\//,
      /^app\/components\/admin\//,
      /^app\/styles\/admin\.css$/,
      /^app\/lib\/admin\/(block-form|content-service|media-content-service)/,
      /^app\/lib\/db\//,
      /^app\/lib\/media\/media-repository\.server\.ts$/,
      /^app\/lib\/auth\/admin\.server\.ts$/,
    ];
    const left = files.filter(
      (file) => !exempt(file) && retired.some((pattern) => pattern.test(file)),
    );
    expect(left).toEqual([]);
  });

  it("names no legacy admin module, stylesheet or guard", () => {
    const names = [
      /admin\.css/,
      /components\/admin\//,
      /auth\/admin\.server/,
      /\brequireAdmin/,
    ];
    for (const file of files) {
      if (exempt(file)) continue;
      for (const name of names) {
        expect(sources[file], `${file} ${name}`).not.toMatch(name);
      }
    }
  });

  it("has no Studio copy about the legacy admin", () => {
    for (const file of files) {
      if (!/^app\/(routes|components)\/studio\//.test(file)) continue;
      if (exempt(file)) continue;
      expect(withoutComments(sources[file]), file).not.toMatch(/legacy admin/i);
    }
  });

  it("starts no string literal with the retired path outside the allowlist", () => {
    const hits = files.filter(
      (file) =>
        !ADMIN_LITERAL_ALLOWLIST.has(file) &&
        !exempt(file) &&
        ADMIN_LITERAL.test(withoutComments(sources[file])),
    );
    expect(hits).toEqual([]);
  });

  it("still detects a quoted admin path (the regex is live)", () => {
    expect('const path = "/admin";').toMatch(ADMIN_LITERAL);
    expect("href={`/admin/cases`}").toMatch(ADMIN_LITERAL);
    expect('"Disallow: /admin"').not.toMatch(ADMIN_LITERAL);
    expect(withoutComments("// see `/admin/cases`\nconst a = 1;")).not.toMatch(
      ADMIN_LITERAL,
    );
    expect(withoutComments('const url = "https://x.example/admin";')).toContain(
      "https://x.example/admin",
    );
  });

  it("uses no admin-* class name", () => {
    const value = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
    for (const file of files) {
      if (!file.endsWith(".tsx") || exempt(file)) continue;
      for (const match of sources[file].matchAll(value)) {
        const tokens = (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/);
        expect(
          tokens.filter((token) => token.startsWith("admin-")),
          file,
        ).toEqual([]);
      }
    }
  });

  it("links no Studio navigation item to the retired path", () => {
    const targets = STUDIO_NAV.flatMap((group) =>
      group.items.map((item) => item.to),
    );
    expect(targets.length).toBeGreaterThan(10);
    expect(targets.filter((to) => to.startsWith("/admin"))).toEqual([]);
  });

  it("deletes the stub panel once no Studio route renders it", () => {
    // Today only Studio → Footer may still render it (pending wp3).
    expect(
      stubImporters.filter((file) => !file.startsWith("app/routes/studio/")),
    ).toEqual([]);
    expect(stubImporters.filter((file) => file !== FOOTER_ROUTE)).toEqual([]);
    if (stubImporters.length === 0) expect(files).not.toContain(STUB_PANEL);
  });
});
