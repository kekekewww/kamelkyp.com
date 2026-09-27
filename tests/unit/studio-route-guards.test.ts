/**
 * Static guard audit (admin-architecture §3): every loader and action under
 * `/studio` and `/api/studio` must be wrapped by `withOwner` /
 * `withOwnerMutation`, so a route added by any package cannot skip the owner
 * check even if the root middleware were bypassed.
 */
import { describe, expect, it } from "vitest";
import routes from "../../app/routes";

// Source text of every Studio route module, keyed by "app/routes/…" path.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      [
        "../../app/routes/studio/**/*.{ts,tsx}",
        "../../app/routes/api/studio/**/*.{ts,tsx}",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  ).map(([path, source]) => [path.replace(/^(\.\.\/)+/, ""), source]),
);
const studioModules = Object.keys(sources).sort();

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

describe("studio route guards", () => {
  it("finds the studio route modules", () => {
    expect(studioModules.length).toBeGreaterThan(40);
  });

  it.each(studioModules.map((path) => [path]))(
    "%s wraps every loader and action",
    (file) => {
      const source = sources[file] ?? "";
      expect(source).not.toMatch(
        /export\s+(async\s+)?function\s+(loader|action|clientLoader|clientAction)\b/,
      );
      expect(source).not.toMatch(/export\s+\{[^}]*\b(loader|action)\b[^}]*\}/);
      for (const match of source.matchAll(
        /export\s+const\s+(loader|action)\s*=\s*([A-Za-z]+)\(/g,
      )) {
        const [, kind, wrapper] = match;
        expect(wrapper, `${kind} in ${file}`).toBe(
          kind === "loader" ? "withOwner" : "withOwnerMutation",
        );
      }
      const declared =
        source.match(/export\s+const\s+(loader|action)\b/g) ?? [];
      const wrapped =
        source.match(
          /export\s+const\s+(loader|action)\s*=\s*withOwner(Mutation)?\(/g,
        ) ?? [];
      expect(wrapped.length).toBe(declared.length);
    },
  );

  it("every studio page module has a guarded loader", () => {
    const pages = studioModules.filter((path) => path.endsWith(".tsx"));
    for (const path of pages) {
      if (path === "app/routes/studio/shell.tsx") continue;
      expect(sources[path], path).toMatch(
        /export\s+const\s+loader\s*=\s*withOwner\(/,
      );
    }
  });

  it("puts the owner middleware on the studio root", () => {
    const source = sources["app/routes/studio/root.tsx"];
    expect(source).toMatch(
      /export\s+const\s+middleware\s*=\s*\[\s*studioMiddleware\s*\]/,
    );
  });

  it("registers every studio route under the guarded root", () => {
    const flat = flatten(routes as RouteEntry[]);
    const studioFiles = flat.filter(([, file]) =>
      file.startsWith("routes/studio/"),
    );
    expect(studioFiles.length).toBeGreaterThan(35);
    for (const [path, file] of studioFiles) {
      expect(path.startsWith("/studio"), `${file} at ${path}`).toBe(true);
    }
    const root = (routes as RouteEntry[]).find(
      (entry) => entry.path === "studio",
    );
    expect(root?.file).toBe("routes/studio/root.tsx");
    const apiFiles = flat.filter(([, file]) =>
      file.startsWith("routes/api/studio/"),
    );
    expect(apiFiles.map(([path]) => path).sort()).toEqual([
      "/api/studio/media",
      "/api/studio/media-register",
      "/api/studio/media-search",
      "/api/studio/media/:id/content",
      "/api/studio/session",
      "/api/studio/slug-check",
    ]);
  });

  it("keeps the legacy /admin panels routed until the integration flip", () => {
    const flat = flatten(routes as RouteEntry[]);
    expect(flat.some(([path]) => path === "/admin")).toBe(true);
    expect(
      flat.some(([, file]) => file === "routes/admin-legacy-redirect.ts"),
    ).toBe(false);
  });
});
