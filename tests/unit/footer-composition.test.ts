/**
 * Public footer composition (wp3 spec §4.4, §6.1): the pure composer that
 * builds every footer the site shows (live, Studio preview, D1 fallback).
 */
import { describe, expect, it } from "vitest";
import {
  composeFooterGroups,
  type FooterGroupRecord,
  type FooterSources,
  footerHref,
  isSafeFooterUrl,
} from "../../app/lib/cms/public/footer";
import type { Locale } from "../../app/lib/cms/types";

const DEFAULT_NAVIGATION = [
  { key: "work", visible: true },
  { key: "services", visible: true },
  { key: "about", visible: true },
  { key: "writing", visible: true },
] as const;

function sources(
  locale: Locale,
  overrides: Partial<Omit<FooterSources, "locale">> = {},
): FooterSources {
  return {
    locale,
    groups: [],
    navigation: DEFAULT_NAVIGATION,
    serviceAreas: [],
    socialLinks: [],
    contactEmail: "",
    ...overrides,
  };
}

function record(
  overrides: Partial<FooterGroupRecord> & Pick<FooterGroupRecord, "id">,
): FooterGroupRecord {
  return {
    key: overrides.id,
    sortOrder: 30,
    enabled: true,
    label: "",
    links: [],
    ...overrides,
  };
}

const workResources = (
  overrides: Partial<FooterGroupRecord> = {},
): FooterGroupRecord =>
  record({
    id: "c1",
    key: "work_resources",
    sortOrder: 30,
    label: "Work & Resources",
    links: [
      { id: "gh", label: "GitHub", url: "https://github.com/kamel-fixture" },
    ],
    ...overrides,
  });

describe("composeFooterGroups", () => {
  it("falls back to the code structure when there are no rows", () => {
    const groups = composeFooterGroups(sources("zh"));
    expect(groups.map((group) => group.id)).toEqual([
      "navigate",
      "services",
      "legal",
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      "導覽",
      "服務",
      "條款與網站",
    ]);
    const links = groups.flatMap((group) => group.links);
    expect(links).toHaveLength(10);
    expect(links.every((link) => link.url.startsWith("/zh/"))).toBe(true);
    const serialized = JSON.stringify(groups);
    expect(serialized).not.toContain("mailto:");
    expect(serialized).not.toContain("github.com");
  });

  it("keeps stored positions and fills missing built-in groups at the ends", () => {
    const groups = composeFooterGroups(
      sources("en", {
        groups: [
          record({ id: "seed-footer-legal", key: "legal", sortOrder: 5 }),
          workResources({ sortOrder: 30 }),
        ],
        contactEmail: "hello@example.com",
      }),
    );
    expect(groups.map((group) => group.id)).toEqual([
      "navigate",
      "services",
      "legal",
      "c1",
      "contact",
    ]);
  });

  it("omits hidden groups but never Legal", () => {
    const groups = composeFooterGroups(
      sources("en", {
        groups: [
          record({
            id: "seed-footer-services",
            key: "services",
            sortOrder: 20,
            enabled: false,
          }),
          workResources({ enabled: false }),
          record({
            id: "seed-footer-legal",
            key: "legal",
            sortOrder: 60,
            enabled: false,
          }),
        ],
      }),
    );
    expect(groups.map((group) => group.id)).toEqual(["navigate", "legal"]);
  });

  it("follows the header navigation order and visibility", () => {
    const groups = composeFooterGroups(
      sources("zh", {
        navigation: [
          { key: "about", visible: true },
          { key: "work", visible: false },
          { key: "writing", visible: true },
          { key: "services", visible: true },
        ],
      }),
    );
    const navigate = groups.find((group) => group.id === "navigate");
    expect(navigate?.links.map((link) => link.label)).toEqual([
      "關於",
      "文章",
      "服務",
    ]);
    expect(navigate?.links.map((link) => link.url)).toEqual([
      "/zh/about",
      "/zh/writing",
      "/zh/services",
    ]);
  });

  it("names service links from the service areas, then Start a project", () => {
    const groups = composeFooterGroups(
      sources("en", {
        serviceAreas: [
          { key: "software", name: { zh: "", en: "  " } },
          {
            key: "mixing",
            name: { zh: "混音與母帶", en: "Mixing & Mastering" },
          },
        ],
      }),
    );
    const services = groups.find((group) => group.id === "services");
    expect(services?.links).toEqual([
      { id: "mixing", label: "Mixing & Mastering", url: "/en/mixing" },
      {
        id: "transition",
        label: "Song Transition",
        url: "/en/song-transition",
      },
      {
        id: "software",
        label: "Software & Interactive",
        url: "/en/services/software",
      },
      { id: "commission", label: "Start a project", url: "/en/commission" },
    ]);
  });

  it("uses a stored built-in label and falls back to the default when empty", () => {
    const groups = composeFooterGroups(
      sources("en", {
        groups: [
          record({
            id: "seed-footer-navigate",
            key: "navigate",
            sortOrder: 10,
            label: "Site",
          }),
          record({
            id: "seed-footer-services",
            key: "services",
            sortOrder: 20,
            label: "   ",
          }),
        ],
      }),
    );
    expect(groups.slice(0, 2).map((group) => group.label)).toEqual([
      "Site",
      "Services",
    ]);
  });

  it("omits a custom group without a label in this locale", () => {
    const groups = composeFooterGroups(
      sources("en", { groups: [workResources({ label: "" })] }),
    );
    expect(groups.map((group) => group.id)).not.toContain("c1");
  });

  it("localizes internal links and drops unsafe addresses", () => {
    const groups = composeFooterGroups(
      sources("en", {
        groups: [
          workResources({
            links: [
              { id: "a", label: "Works", url: "/works" },
              { id: "b", label: "About", url: "/zh/about" },
              { id: "c", label: "Site", url: "https://example.com" },
              { id: "d", label: "Mail", url: "mailto:hello@example.com" },
              { id: "e", label: "Script", url: "javascript:alert(1)" },
              { id: "f", label: "Proto", url: "//evil.example" },
              { id: "g", label: "Slash", url: "/\\evil.example" },
              { id: "h", label: "Space", url: "/a b" },
              { id: "i", label: "Plain", url: "http://plain.example" },
              {
                id: "j",
                label: "Verbatim",
                url: "https://example.com/Path?q=1#x",
              },
            ],
          }),
        ],
      }),
    );
    const custom = groups.find((group) => group.id === "c1");
    expect(custom?.links.map((link) => [link.id, link.url])).toEqual([
      ["a", "/en/works"],
      ["b", "/zh/about"],
      ["c", "https://example.com"],
      ["d", "mailto:hello@example.com"],
      ["j", "https://example.com/Path?q=1#x"],
    ]);
  });

  it("shows Find Me only with social links and only when not hidden", () => {
    const social = [
      { id: "s-ig", label: "Instagram", url: "https://instagram.com/kamel" },
    ];
    expect(
      composeFooterGroups(sources("en")).map((group) => group.id),
    ).not.toContain("find_me");
    const shown = composeFooterGroups(sources("en", { socialLinks: social }));
    expect(shown.find((group) => group.id === "find_me")).toEqual({
      id: "find_me",
      label: "Find Me",
      links: social,
    });
    const hidden = composeFooterGroups(
      sources("en", {
        socialLinks: social,
        groups: [
          record({
            id: "seed-footer-find-me",
            key: "find_me",
            sortOrder: 40,
            enabled: false,
          }),
        ],
      }),
    );
    expect(hidden.map((group) => group.id)).not.toContain("find_me");
  });

  it("adds Contact only for a brand email", () => {
    expect(
      composeFooterGroups(sources("en", { contactEmail: "  " })).map(
        (group) => group.id,
      ),
    ).not.toContain("contact");
    const groups = composeFooterGroups(
      sources("zh", { contactEmail: "hello@example.com" }),
    );
    expect(groups.find((group) => group.id === "contact")).toEqual({
      id: "contact",
      label: "聯絡",
      links: [
        {
          id: "email",
          label: "hello@example.com",
          url: "mailto:hello@example.com",
        },
      ],
    });
  });

  it("carries no price and no address in the defaults", () => {
    const serialized = JSON.stringify([
      composeFooterGroups(sources("zh")),
      composeFooterGroups(sources("en")),
    ]);
    expect(serialized).not.toMatch(/NT\$|US\$/);
    expect(serialized).not.toContain("mailto:");
  });

  it("omits sample-marked custom groups and links", () => {
    const groups = composeFooterGroups(
      sources("zh", {
        groups: [
          workResources({ id: "sample-group", label: "Sample: x" }),
          workResources({
            id: "c2",
            label: "作品與資源",
            links: [
              { id: "x", label: "示意：x", url: "https://example.com/x" },
              { id: "y", label: "GitHub", url: "https://example.com/y" },
            ],
          }),
        ],
      }),
    );
    expect(groups.map((group) => group.id)).not.toContain("sample-group");
    expect(
      groups.find((group) => group.id === "c2")?.links.map((link) => link.id),
    ).toEqual(["y"]);
  });

  it("keeps today's link ids", () => {
    const groups = composeFooterGroups(sources("en"));
    expect(
      groups
        .find((group) => group.id === "navigate")
        ?.links.map((link) => link.id),
    ).toEqual(["works", "services-overview", "about", "writing"]);
    expect(
      groups
        .find((group) => group.id === "services")
        ?.links.map((link) => link.id),
    ).toEqual(["mixing", "transition", "software", "commission"]);
  });
});

describe("footer URLs", () => {
  it("accepts site paths, https and mailto only", () => {
    expect(isSafeFooterUrl("/works")).toBe(true);
    expect(isSafeFooterUrl("https://example.com")).toBe(true);
    expect(isSafeFooterUrl("mailto:a@b.co")).toBe(true);
    for (const url of [
      "//evil.example",
      "/\\evil.example",
      "/a b",
      "/a\tb",
      "http://plain.example",
      "javascript:alert(1)",
      "",
      // Resolved against the page, these leave the locale prefix or the site.
      "/../studio",
      "/en/%2e%2e/studio",
      "/zh/./../admin",
      "https:/example.com",
      "https:example.com",
      "https:\\\\example.com",
    ]) {
      expect(isSafeFooterUrl(url), url).toBe(false);
    }
  });

  it("never links a dot-segment path out of the locale prefix", () => {
    const groups = composeFooterGroups(
      sources("en", {
        groups: [
          record({
            id: "custom-dots",
            label: "More",
            links: [
              { id: "dots", label: "Studio", url: "/../studio" },
              { id: "slash", label: "Broken", url: "https:/example.com" },
              { id: "works", label: "Works", url: "/works" },
            ],
          }),
        ],
      }),
    );
    expect(groups.find((group) => group.id === "custom-dots")?.links).toEqual([
      { id: "works", label: "Works", url: "/en/works" },
    ]);
  });

  it("localizes locale-less paths and keeps localized and absolute ones", () => {
    expect(footerHref("en", "/works")).toBe("/en/works");
    expect(footerHref("zh", "/")).toBe("/zh");
    expect(footerHref("en", "/zh/about")).toBe("/zh/about");
    expect(footerHref("en", "/en")).toBe("/en");
    expect(footerHref("en", "/english-notes")).toBe("/en/english-notes");
    expect(footerHref("en", "https://example.com")).toBe("https://example.com");
  });
});
