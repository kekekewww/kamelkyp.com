/**
 * Studio footer model (wp3 spec §4.6, §4.8, §6.1): address normalization and
 * rules, save issues, legacy row pairing and group kinds.
 */
import { describe, expect, it } from "vitest";
import {
  type FooterGroupDraft,
  type FooterLinkRow,
  footerGroupIssues,
  footerGroupKind,
  footerUrlProblem,
  normalizeFooterUrl,
  pairFooterLinkRows,
} from "../../app/lib/cms/schemas/footer";

const text = (zh: string, en = zh) => ({ zh, en });

function draft(overrides: Partial<FooterGroupDraft> = {}): FooterGroupDraft {
  return {
    label: text("作品與資源", "Work & Resources"),
    links: [
      {
        label: text("GitHub"),
        url: "https://github.com/kamel-fixture",
        enabled: true,
      },
    ],
    ...overrides,
  };
}

function link(label: { zh: string; en: string }, url = "https://example.com") {
  return { label, url, enabled: true };
}

describe("normalizeFooterUrl", () => {
  it("completes bare hosts and emails and strips the locale segment", () => {
    expect(normalizeFooterUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizeFooterUrl("hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(normalizeFooterUrl("/zh/works")).toBe("/works");
    expect(normalizeFooterUrl("/en/services/software#a")).toBe(
      "/services/software#a",
    );
    expect(normalizeFooterUrl("/en")).toBe("/");
    expect(normalizeFooterUrl("/zh")).toBe("/");
    expect(normalizeFooterUrl("  /works  ")).toBe("/works");
    expect(normalizeFooterUrl("/english")).toBe("/english");
    expect(normalizeFooterUrl("http://x.example")).toBe("http://x.example");
  });
});

describe("footerUrlProblem", () => {
  it.each([
    ["", "Enter an address."],
    ["http://x.example", "Use an https:// address"],
    ["https://user:secret@example.com", "Remove the user name and password"],
    ["//x.example", "Link to a public page of the site."],
    ["/\\x.example", "Link to a public page of the site."],
    ["/a b", "Link to a public page of the site."],
    ["mailto:nobody", "Use an https:// address"],
    [`https://example.com/${"a".repeat(2049)}`, "This address is too long."],
    ["/studio", "Link to a public page of the site."],
    ["/studio/settings/footer", "Link to a public page of the site."],
    ["/api/studio/session", "Link to a public page of the site."],
    ["/admin", "Link to a public page of the site."],
    ["/admin?x=1", "Link to a public page of the site."],
    ["javascript:alert(1)", "Use an https:// address"],
  ])("refuses %s", (url, message) => {
    expect(footerUrlProblem(url)).toContain(message);
  });

  it.each([
    "/works",
    "/",
    "/services/software#contact",
    "/studios-page",
    "https://example.com",
    "mailto:a@b.co",
  ])("accepts %s", (url) => {
    expect(footerUrlProblem(url)).toBeNull();
  });
});

describe("footerGroupIssues", () => {
  it("accepts a valid group and a long valid link list", () => {
    expect(footerGroupIssues(draft(), "custom")).toEqual([]);
    expect(
      footerGroupIssues(
        draft({
          links: Array.from({ length: 8 }, (_, index) =>
            link(
              text(`連結 ${index}`, `Link ${index}`),
              `https://e.com/${index}`,
            ),
          ),
        }),
        "custom",
      ),
    ).toEqual([]);
  });

  it("requires the group label in both locales, under 60 characters", () => {
    expect(
      footerGroupIssues(draft({ label: text("作品", "") }), "custom"),
    ).toEqual([
      expect.objectContaining({
        field: "label",
        locale: "en",
        code: "required_locale",
        severity: "error",
        message: "Label is required in EN.",
      }),
    ]);
    expect(
      footerGroupIssues(
        draft({ label: text("作品", "x".repeat(61)) }),
        "custom",
      ),
    ).toEqual([expect.objectContaining({ field: "label", code: "too_long" })]);
  });

  it("checks every link's labels and address", () => {
    const issues = footerGroupIssues(
      draft({ links: [link(text("", "GitHub"), "http://x.example")] }),
      "custom",
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "links.0.label",
          locale: "zh",
          code: "required_locale",
        }),
        expect.objectContaining({ field: "links.0.url", code: "invalid_url" }),
      ]),
    );
  });

  it.each(["From NT$4,000", "US$260.00", "1,000 元", "TWD 900", "$40 an hour"])(
    "refuses the price figure %s",
    (value) => {
      const issues = footerGroupIssues(
        draft({ links: [link(text(value, "Rates"))] }),
        "custom",
      );
      expect(issues).toEqual([
        expect.objectContaining({
          field: "links.0.label",
          locale: "zh",
          code: "price_forbidden",
          message: "Footer links never show prices. Remove the amount.",
        }),
      ]);
    },
  );

  it.each([
    "Sample: x",
    "Sample paragraph: x",
    "示意內容：x",
    "示意：x",
    "Placeholder for x",
    "TODO_CONTENT",
  ])("refuses the sample marker %s", (value) => {
    const issues = footerGroupIssues(
      draft({ label: text(value, "Work") }),
      "custom",
    );
    expect(issues).toEqual([
      expect.objectContaining({
        field: "label",
        locale: "zh",
        code: "todo_content",
        message: "Sample text cannot appear on the public site.",
      }),
    ]);
  });

  it("allows a label that only starts like a marker", () => {
    expect(
      footerGroupIssues(
        draft({ label: text("音色", "Sample packs") }),
        "custom",
      ),
    ).toEqual([]);
  });

  it("caps a group at 50 links", () => {
    const issues = footerGroupIssues(
      draft({
        links: Array.from({ length: 51 }, (_, index) =>
          link(text(`連結${index}`, `Link ${index}`)),
        ),
      }),
      "custom",
    );
    expect(issues).toEqual([
      expect.objectContaining({
        field: "links",
        code: "invalid_value",
        message: "At most 50 links in a group.",
      }),
    ]);
  });

  it("checks only the label of a built-in group", () => {
    expect(
      footerGroupIssues(
        { label: text("導覽", "Navigate"), links: undefined },
        "navigate",
      ),
    ).toEqual([]);
  });
});

describe("pairFooterLinkRows", () => {
  const row = (
    id: string,
    locale: "zh" | "en",
    label: string,
    sortOrder: number,
    overrides: Partial<FooterLinkRow> = {},
  ): FooterLinkRow => ({
    id,
    locale,
    label,
    url: "https://example.com/a",
    sortOrder,
    enabled: true,
    ...overrides,
  });

  it("pairs zh and en rows by position, in position order", () => {
    const links = pairFooterLinkRows([
      row("b-en", "en", "Second", 10),
      row("a-zh", "zh", "第一", 0),
      row("b-zh", "zh", "第二", 10),
      row("a-en", "en", "First", 0),
    ]);
    expect(links.map((item) => [item.key, item.label, item.notes])).toEqual([
      ["a-zh", { zh: "第一", en: "First" }, []],
      ["b-zh", { zh: "第二", en: "Second" }, []],
    ]);
  });

  it("keeps a one-locale row as its own link with a note", () => {
    const [only] = pairFooterLinkRows([row("x-zh", "zh", "只有中文", 0)]);
    expect(only?.label).toEqual({ zh: "只有中文", en: "" });
    expect(only?.notes).toEqual(["EN label missing; add it before saving."]);
  });

  it("keeps the ZH address and flag when the pair disagrees", () => {
    const [pair] = pairFooterLinkRows([
      row("x-zh", "zh", "甲", 0, { url: "https://example.com/zh" }),
      row("x-en", "en", "A", 0, {
        url: "https://example.com/en",
        enabled: false,
      }),
    ]);
    expect(pair?.url).toBe("https://example.com/zh");
    expect(pair?.enabled).toBe(true);
    expect(pair?.notes).toEqual([
      "ZH and EN pointed to different addresses; saving keeps the ZH address.",
      "Shown in one language only; saving applies one setting to both.",
    ]);
  });

  it("turns two zh rows at one position into two links", () => {
    const links = pairFooterLinkRows([
      row("x1", "zh", "一", 0),
      row("x2", "zh", "二", 0),
    ]);
    expect(links.map((item) => item.key)).toEqual(["x1", "x2"]);
  });
});

describe("footerGroupKind", () => {
  it("names built-in, legacy and custom keys", () => {
    for (const key of ["navigate", "services", "find_me", "contact", "legal"]) {
      expect(footerGroupKind(key)).toBe(key);
    }
    expect(footerGroupKind("social")).toBe("social");
    expect(footerGroupKind("work_resources")).toBe("custom");
    expect(footerGroupKind("custom-1234")).toBe("custom");
  });
});
