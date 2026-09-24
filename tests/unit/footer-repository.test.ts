import { describe, expect, it } from "vitest";
import { getDefaultFooterGroups } from "../../app/lib/content/footer-repository.server";

describe("footer structure (code defaults)", () => {
  it("provides the site-structure groups; contact is filled from brand settings", () => {
    const groups = getDefaultFooterGroups("zh");

    expect(groups.map((group) => group.id)).toEqual([
      "navigate",
      "services",
      "work_resources",
      "contact",
      "legal",
    ]);
    // The contact address is not code: it comes from brand.contactEmail.
    expect(groups.find((group) => group.id === "contact")?.links).toEqual([]);
    expect(groups.flatMap((group) => group.links)).toHaveLength(11);
  });

  it("localizes navigation and keeps only safe destinations", () => {
    const groups = getDefaultFooterGroups("en");
    const links = groups.flatMap((group) => group.links);

    expect(groups[0]?.label).toBe("Navigate");
    expect(groups.find((group) => group.id === "contact")?.label).toBe(
      "Contact",
    );
    expect(
      links.every(
        (link) =>
          link.url.startsWith("/") ||
          link.url.startsWith("https://") ||
          link.url.startsWith("mailto:"),
      ),
    ).toBe(true);
  });

  it("carries no personal address and no repository link", () => {
    const serialized = JSON.stringify([
      ...getDefaultFooterGroups("zh"),
      ...getDefaultFooterGroups("en"),
    ]);
    expect(serialized).not.toMatch(/mailto:|gmail|kamelkyp\.com"/);
  });
});
