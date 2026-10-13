/**
 * Route coverage of the indexing policy (WP4 §4.1, §6.1): every public page
 * under `/:lang` is classified (sitemap, service page, detail, noindex or
 * redirect), every public route module exports its own `meta`, the robots and
 * sitemap routes are dynamic (no shadowing file in `public/`), and no new SEO
 * source carries a string literal the admin retirement audit would reject.
 */
// @ts-expect-error Node types are not installed; Vitest runs these tests in Node.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITEMAP_STATIC_PATHS } from "../../app/lib/seo/sitemap";
import {
  commissionServicePath,
  SERVICE_CATALOG,
} from "../../app/lib/services/catalog";
import routes from "../../app/routes";

type RouteEntry = { path?: string; file: string; children?: RouteEntry[] };

function flatten(entries: RouteEntry[], prefix = ""): Array<[string, string]> {
  return entries.flatMap((entry) => {
    const path = entry.path ? `${prefix}/${entry.path}` : prefix;
    return [
      [path, entry.file] as [string, string],
      ...flatten(entry.children ?? [], path),
    ];
  });
}

const config = routes as RouteEntry[];
const lang = config.find((entry) => entry.path === ":lang");
/** Locale-less child paths of `/:lang` ("" is the home index). */
const publicPaths = flatten(lang?.children ?? []).map(([path]) => path);

const SERVICE_PAGES = SERVICE_CATALOG.map((service) =>
  commissionServicePath(service.id),
);
const DETAIL = ["/works/:slug", "/writing/:slug"];
const NOINDEX = [
  "/commission/success",
  "/commission/:category",
  "/commission/:category/:service",
];
const REDIRECT = ["/other", "/other/:slug"];

const CLASSES: Record<string, readonly string[]> = {
  sitemap: SITEMAP_STATIC_PATHS,
  service: SERVICE_PAGES,
  detail: DETAIL,
  noindex: NOINDEX,
  redirect: REDIRECT,
};

function rawSources(modules: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(modules).map(([path, source]) => [
      path.replace(/^(\.\.\/)+/, ""),
      source,
    ]),
  );
}

// Source text of the public route modules and of the new SEO modules.
const publicRouteSources = rawSources(
  import.meta.glob<string>("../../app/routes/public/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
const seoSources = rawSources(
  import.meta.glob<string>(
    [
      "../../app/lib/seo/*.ts",
      "../../app/routes/robots.ts",
      "../../app/routes/sitemap.ts",
      "../../app/lib/cms/public/sitemap.server.ts",
    ],
    { query: "?raw", import: "default", eager: true },
  ),
);

const studioHintSources = rawSources(
  import.meta.glob<string>(
    [
      "../../app/components/studio/settings/site-form.tsx",
      "../../app/components/studio/projects/editor-sections.tsx",
      "../../app/components/studio/writing/writing-editor.tsx",
    ],
    { query: "?raw", import: "default", eager: true },
  ),
);

/** WP5's admin retirement audit regex (WP5 spec §6.1, plan §2.6). */
const ADMIN_LITERAL = /["'`]\/admin(?:[/?"'`]|$)/m;

describe("public route classes (indexing policy)", () => {
  it("finds the public routes", () => {
    expect(lang?.file).toBe("routes/public/layout.tsx");
    expect(publicPaths.length).toBeGreaterThan(20);
  });

  it("puts every /:lang child path in exactly one class", () => {
    for (const path of publicPaths) {
      const classes = Object.entries(CLASSES)
        .filter(([, paths]) => paths.includes(path))
        .map(([name]) => name);
      expect(classes, `/:lang${path}`).toHaveLength(1);
    }
  });

  it("has a route for every classified path", () => {
    for (const [name, paths] of Object.entries(CLASSES)) {
      for (const path of paths) {
        expect(publicPaths, `${name} ${path}`).toContain(path);
      }
    }
  });

  it("matches the commission service pages to the catalog", () => {
    expect(SERVICE_PAGES).toHaveLength(4);
    expect(
      publicPaths.filter((path) => SERVICE_PAGES.includes(path)).sort(),
    ).toEqual([...SERVICE_PAGES].sort());
  });
});

describe("robots.txt and sitemap.xml routes", () => {
  it("are top-level resource routes right after the health route", () => {
    const top = config.map((entry) => [entry.path, entry.file]);
    const health = top.findIndex(([path]) => path === "health");
    expect(top.slice(health, health + 3)).toEqual([
      ["health", "routes/health.ts"],
      ["robots.txt", "routes/robots.ts"],
      ["sitemap.xml", "routes/sitemap.ts"],
    ]);
  });

  it("are never shadowed by a static file in public/", () => {
    expect(existsSync("public/robots.txt")).toBe(false);
    expect(existsSync("public/sitemap.xml")).toBe(false);
  });
});

describe("public route meta coverage", () => {
  const modules = Object.keys(publicRouteSources).sort();

  it("reads the public route modules", () => {
    expect(modules).toContain("app/routes/public/commission-success.tsx");
    expect(modules.length).toBeGreaterThan(18);
  });

  it("gives every public page its own meta (none inherits the home head)", () => {
    for (const path of modules) {
      if (
        path === "app/routes/public/layout.tsx" ||
        path === "app/routes/public/home.tsx"
      ) {
        continue;
      }
      expect(publicRouteSources[path], path).toMatch(/export const meta\b/);
    }
  });

  it("keeps the commission workflow pages noindex", () => {
    for (const name of [
      "commission-category",
      "commission-service",
      "commission-success",
    ]) {
      const path = `app/routes/public/${name}.tsx`;
      expect(publicRouteSources[path], path).toMatch(/noindex:\s*true/);
    }
  });

  it("builds every page head from the router location", () => {
    for (const [path, source] of Object.entries(publicRouteSources)) {
      if (!source.includes("pageMeta(")) continue;
      expect(source, path).toMatch(
        /pageMeta\(\s*\{\s*matches,\s*location\s*\}/,
      );
    }
  });
});

describe("admin retirement audit compatibility", () => {
  it("scans the new SEO modules", () => {
    expect(Object.keys(seoSources)).toEqual(
      expect.arrayContaining([
        "app/lib/seo/brand-assets.ts",
        "app/lib/seo/origin.server.ts",
        "app/lib/seo/robots.ts",
        "app/lib/seo/sitemap.ts",
        "app/lib/seo/urls.ts",
        "app/lib/cms/public/sitemap.server.ts",
        "app/routes/robots.ts",
        "app/routes/sitemap.ts",
      ]),
    );
  });

  it("has no string literal (or comment) starting with the retired admin path", () => {
    for (const [path, source] of Object.entries(seoSources)) {
      expect(source, path).not.toMatch(ADMIN_LITERAL);
    }
  });

  it("still detects a quoted admin path (the regex is live)", () => {
    expect('const path = "/admin";').toMatch(ADMIN_LITERAL);
    expect("'/admin/cases'").toMatch(ADMIN_LITERAL);
    expect('"Disallow: /admin"').not.toMatch(ADMIN_LITERAL);
  });
});

describe("Studio hints (WP4 §4.12)", () => {
  const hint = (file: string, text: string) =>
    expect(studioHintSources[`app/components/studio/${file}`]).toContain(
      `hint="${text}"`,
    );

  it("states the share image fallbacks", () => {
    hint(
      "settings/site-form.tsx",
      "Shown when the homepage is shared, and by pages without their own image when no default social image is set. 1200 × 630 works best. When empty, the homepage uses the default social image, then the built-in Kamel image.",
    );
    hint(
      "settings/site-form.tsx",
      "Used by pages that have no image of their own. When empty, the OpenGraph image is used, then the built-in Kamel image.",
    );
  });

  it("states what unlisting does to the sitemap and search", () => {
    hint(
      "projects/editor-sections.tsx",
      "Unlisted projects stay reachable by their URL but are left out of /works, the homepage and the sitemap, and ask search engines not to index them. Takes effect when you publish.",
    );
    hint(
      "writing/writing-editor.tsx",
      "Unlisted articles stay reachable by their URL but are left out of lists, the homepage and the sitemap, and ask search engines not to index them. Takes effect when you publish.",
    );
  });
});
