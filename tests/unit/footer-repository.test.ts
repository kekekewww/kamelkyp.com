import { describe, expect, it } from "vitest";
import { getDefaultFooterGroups } from "../../app/lib/content/footer-repository.server";

describe("footer repository", () => {
  it("provides five expandable groups without truncating their links", () => {
    const groups = getDefaultFooterGroups("zh");

    expect(groups).toHaveLength(5);
    expect(groups.map((group) => group.id)).toEqual([
      "navigate",
      "services",
      "work_resources",
      "contact",
      "legal",
    ]);
    expect(groups.flatMap((group) => group.links)).toHaveLength(11);
  });

  it("localizes navigation while retaining safe contact destinations", () => {
    const groups = getDefaultFooterGroups("en");
    const links = groups.flatMap((group) => group.links);

    expect(groups[0]?.label).toBe("Navigate");
    expect(links.some((link) => link.url === "mailto:kevinyaungputra@gmail.com"))
      .toBe(true);
    expect(
      links.every(
        (link) =>
          link.url.startsWith("/") ||
          link.url.startsWith("https://") ||
          link.url.startsWith("mailto:"),
      ),
    ).toBe(true);
  });
});
