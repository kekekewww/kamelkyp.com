/**
 * Retired /admin (wp5 §4.3, §4.5, §6.1): which module answers each former
 * admin URL (the real route config through React Router's own matcher), and
 * where it lands in the Studio. React Router matches routes
 * case-insensitively, so every helper must map `/ADMIN/Works` like
 * `/admin/works`.
 */
import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import {
  legacyEntryTarget,
  legacyVersionId,
  staticLegacyAdminTarget,
} from "../../app/lib/cms/studio/legacy-admin";
import routes from "../../app/routes";

const at = (path: string) => new URL(path, "https://kamelkyp.com");

type RouteEntry = {
  id?: string;
  path?: string;
  index?: boolean;
  file: string;
  children?: RouteEntry[];
};

const config = routes as RouteEntry[];
const REDIRECT = "routes/admin-legacy-redirect.ts";

/** The files React Router would render for `path`, outermost first. */
function matchedFiles(path: string): string[] {
  const matches = matchRoutes(config as unknown as RouteObject[], path) ?? [];
  return matches.map((match) => (match.route as unknown as RouteEntry).file);
}

function allEntries(entries: RouteEntry[]): RouteEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...allEntries(entry.children ?? []),
  ]);
}

// Pending wp3 (Studio → Footer): the legacy footer link editor stays live
// until the Studio screen that replaces it is merged; its retirement is the
// last, separate commit of this package.
const LEGACY_FOOTER_PANEL = "routes/admin/links.tsx";

describe("legacy /admin routes", () => {
  it.each([
    "/admin",
    "/admin/",
    "/admin/content",
    "/admin/content/v-1/edit",
    "/admin/content/v-1/preview",
    "/admin/services",
    "/admin/services/",
    "/admin/terms",
    "/admin/works",
    "/admin/posts",
    "/admin/posts/v-1/edit",
    "/admin/cases",
    "/admin/cases/status",
    "/admin/cases/student-discount",
    "/admin/cases/cleanup",
    "/admin/unknown",
    "/admin/a/b/c",
    "/ADMIN/Works",
    "/Admin/Cases",
  ])("%s reaches the owner-gated redirect", (path) => {
    expect(matchedFiles(path)).toEqual([REDIRECT]);
  });

  it("keeps the legacy footer link editor until Studio → Footer lands", () => {
    expect(matchedFiles("/admin/links").at(-1)).toBe(LEGACY_FOOTER_PANEL);
  });

  it("never sends the paths that collide with public children to the public layout", () => {
    // A lone admin/* splat ranks below :lang/<child>, so these three would
    // render the public 404 (wp5 §3.5 defect 1).
    for (const path of ["/admin/services", "/admin/terms", "/admin/works"]) {
      expect(matchedFiles(path), path).not.toContain(
        "routes/public/layout.tsx",
      );
    }
  });

  it("leaves the public and Studio routes where they were", () => {
    expect(matchedFiles("/zh/works").at(-1)).toBe(
      "routes/public/works-index.tsx",
    );
    expect(matchedFiles("/en/services").at(-1)).toBe(
      "routes/public/services-index.tsx",
    );
    expect(matchedFiles("/en/terms").at(-1)).toBe("routes/public/terms.tsx");
    expect(matchedFiles("/studio").at(-1)).toBe("routes/studio/home.tsx");
    expect(matchedFiles("/studio/commissions").at(-1)).toBe(
      "routes/studio/commissions/list.tsx",
    );
  });

  it("pins the residual: never-legacy public children under /admin", () => {
    // wp5 §9 R6. A change that closes the residual updates this on purpose.
    expect(matchedFiles("/admin/about")[0]).toBe("routes/public/layout.tsx");
    expect(matchedFiles("/admin/works/x")[0]).toBe("routes/public/layout.tsx");
  });

  it("registers no legacy admin module and no ambiguous route id", () => {
    const entries = allEntries(config);
    const legacy = entries
      .map((entry) => entry.file)
      .filter((file) => file.startsWith("routes/admin/"));
    expect(legacy.sort()).toEqual([
      "routes/admin/layout.tsx",
      LEGACY_FOOTER_PANEL,
    ]);
    const ids = entries.flatMap((entry) => (entry.id ? [entry.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    // Without an explicit id, React Router derives it from the file.
    const implicit = entries
      .filter((entry) => !entry.id)
      .map((entry) => entry.file);
    expect(new Set(implicit).size).toBe(implicit.length);
    expect(ids.filter((id) => id.startsWith("legacy-admin"))).toContain(
      "legacy-admin-splat",
    );
  });
});

describe("staticLegacyAdminTarget", () => {
  it.each([
    ["/admin", "/studio"],
    ["/admin/content", "/studio"],
    ["/admin/works", "/studio/projects"],
    ["/admin/posts", "/studio/writing"],
    ["/admin/services", "/studio/services/pricing"],
    ["/admin/terms", "/studio/services/terms"],
    ["/admin/links", "/studio/settings/footer"],
    ["/admin/cases", "/studio/commissions"],
    ["/admin/cases/status", "/studio/commissions"],
    ["/admin/cases/student-discount", "/studio/commissions"],
    ["/admin/cases/cleanup", "/studio/commissions"],
  ])("%s → %s (with and without a trailing slash)", (path, target) => {
    expect(staticLegacyAdminTarget(at(path))).toBe(target);
    expect(staticLegacyAdminTarget(at(`${path}/`))).toBe(target);
  });

  it("forwards the case list query to the Studio inbox only", () => {
    expect(
      staticLegacyAdminTarget(
        at("/admin/cases?service=full_mix&status=paused"),
      ),
    ).toBe("/studio/commissions?service=full_mix&status=paused");
    expect(staticLegacyAdminTarget(at("/admin/cases/status?status=x"))).toBe(
      "/studio/commissions?status=x",
    );
    expect(staticLegacyAdminTarget(at("/admin/works?x=1"))).toBe(
      "/studio/projects",
    );
    expect(staticLegacyAdminTarget(at("/admin?next=/studio"))).toBe("/studio");
  });

  it("maps mixed-case paths like the lower-case ones", () => {
    expect(staticLegacyAdminTarget(at("/ADMIN/WORKS"))).toBe(
      "/studio/projects",
    );
    expect(staticLegacyAdminTarget(at("/ADMIN/Works"))).toBe(
      "/studio/projects",
    );
    expect(staticLegacyAdminTarget(at("/Admin/Cases?status=paused"))).toBe(
      "/studio/commissions?status=paused",
    );
    expect(staticLegacyAdminTarget(at("/Admin"))).toBe("/studio");
  });

  it("knows no other path", () => {
    expect(staticLegacyAdminTarget(at("/admin/nope"))).toBeNull();
    expect(staticLegacyAdminTarget(at("/admin/works/x"))).toBeNull();
    expect(staticLegacyAdminTarget(at("/admin/cases/other"))).toBeNull();
    expect(staticLegacyAdminTarget(at("/administrator"))).toBeNull();
    expect(staticLegacyAdminTarget(at("/studio"))).toBeNull();
  });
});

describe("legacyVersionId", () => {
  it("reads the version id of the three editor and preview paths", () => {
    expect(legacyVersionId("/admin/content/v-1/edit")).toBe("v-1");
    expect(legacyVersionId("/admin/content/v-1/preview")).toBe("v-1");
    expect(legacyVersionId("/admin/posts/v-2/edit")).toBe("v-2");
    expect(legacyVersionId("/admin/posts/v-2/edit/")).toBe("v-2");
    expect(legacyVersionId("/ADMIN/Content/v-1/EDIT")).toBe("v-1");
  });

  it("is undefined for every other path", () => {
    expect(legacyVersionId("/admin/posts/x/preview")).toBeUndefined();
    expect(legacyVersionId("/admin/content")).toBeUndefined();
    expect(legacyVersionId("/admin/content/v-1")).toBeUndefined();
    expect(legacyVersionId("/admin/content/a/b/edit")).toBeUndefined();
    expect(legacyVersionId("/admin/works")).toBeUndefined();
  });

  it("decodes the id and refuses malformed or overlong ones", () => {
    expect(legacyVersionId("/admin/content/v%201%2Fx/edit")).toBe("v 1/x");
    expect(legacyVersionId("/admin/content/%E0%A4%A/edit")).toBeNull();
    expect(legacyVersionId(`/admin/content/${"a".repeat(128)}/edit`)).toBe(
      "a".repeat(128),
    );
    expect(
      legacyVersionId(`/admin/content/${"a".repeat(129)}/edit`),
    ).toBeNull();
  });
});

describe("legacyEntryTarget", () => {
  const row = (
    kind: string,
    slug: string,
    project_id: string | null = null,
    writing_id: string | null = null,
  ) => ({ kind, slug, project_id, writing_id });

  it("opens the Studio row a legacy entry was imported into", () => {
    expect(legacyEntryTarget(row("work", "w", "legacy-work-1"))).toBe(
      "/studio/projects/legacy-work-1",
    );
    expect(legacyEntryTarget(row("post", "p", null, "writing-1"))).toBe(
      "/studio/writing/writing-1",
    );
  });

  it("falls back to the list when the entry has no Studio row", () => {
    expect(legacyEntryTarget(row("work", "w"))).toBe("/studio/projects");
    expect(legacyEntryTarget(row("post", "p"))).toBe("/studio/writing");
  });

  it("sends the home page to Homepage and every other page home", () => {
    expect(legacyEntryTarget(row("page", "home"))).toBe("/studio/homepage");
    expect(legacyEntryTarget(row("page", "about"))).toBe("/studio");
    expect(legacyEntryTarget(row("other", "x"))).toBe("/studio");
    expect(legacyEntryTarget(null)).toBe("/studio");
  });

  it("encodes ids with reserved characters", () => {
    expect(legacyEntryTarget(row("work", "w", "a/b?c#d"))).toBe(
      "/studio/projects/a%2Fb%3Fc%23d",
    );
    expect(legacyEntryTarget(row("post", "p", null, "x y"))).toBe(
      "/studio/writing/x%20y",
    );
  });
});
