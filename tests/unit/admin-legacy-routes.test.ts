/**
 * Retired /admin (wp5 §4.3, §4.5, §6.1): where each former admin URL lands in
 * the Studio. React Router matches routes case-insensitively, so every
 * helper must map `/ADMIN/Works` like `/admin/works`.
 */
import { describe, expect, it } from "vitest";
import {
  legacyEntryTarget,
  legacyVersionId,
  staticLegacyAdminTarget,
} from "../../app/lib/cms/studio/legacy-admin";

const at = (path: string) => new URL(path, "https://kamelkyp.com");

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
