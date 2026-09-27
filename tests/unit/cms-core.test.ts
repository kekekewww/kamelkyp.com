import { describe, expect, it } from "vitest";
import { formDataToObject, readIntent } from "../../app/lib/cms/forms";
import {
  emptyText,
  filledLocales,
  isComplete,
  localize,
  parseLocalizedText,
} from "../../app/lib/cms/localized";
import {
  fallbackSlug,
  isValidSlug,
  nextCopySlug,
  slugify,
} from "../../app/lib/cms/slug";
import { parseFormattedText } from "../../app/lib/cms/text-format";

describe("slugs", () => {
  it("slugifies English titles into lowercase hyphenated slugs", () => {
    expect(slugify("Signal Garden: A Study")).toBe("signal-garden-a-study");
    expect(slugify("  Café — Déjà Vu!  ")).toBe("cafe-deja-vu");
    expect(slugify("---")).toBe("");
    expect(slugify("音樂")).toBe("");
  });

  it("caps slugs at 96 characters without a trailing hyphen", () => {
    const slug = slugify(`${"word ".repeat(40)}end`);
    expect(slug.length).toBeLessThanOrEqual(96);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("validates the database slug rules", () => {
    expect(isValidSlug("signal-garden")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("-bad")).toBe(false);
    expect(isValidSlug("bad-")).toBe(false);
    expect(isValidSlug("Bad")).toBe(false);
    expect(isValidSlug("a".repeat(97))).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("builds fallback and copy slugs", () => {
    expect(fallbackSlug("project", () => 0.5)).toMatch(/^project-[a-z0-9]{6}$/);
    expect(nextCopySlug("demo", new Set())).toBe("demo-copy");
    expect(nextCopySlug("demo", new Set(["demo-copy"]))).toBe("demo-copy-2");
    expect(nextCopySlug("demo", new Set(["demo-copy", "demo-copy-2"]))).toBe(
      "demo-copy-3",
    );
  });
});

describe("localized text", () => {
  it("treats whitespace-only values as empty", () => {
    expect(isComplete({ zh: "標題", en: "Title" })).toBe(true);
    expect(isComplete({ zh: "標題", en: "   " })).toBe(false);
    expect(filledLocales({ zh: "標題", en: "" })).toEqual(["zh"]);
    expect(filledLocales(emptyText())).toEqual([]);
  });

  it("localizes without cross-locale fallback", () => {
    expect(localize({ zh: "標題", en: "" }, "en")).toBe("");
    expect(localize({ zh: "標題", en: "Title" }, "zh")).toBe("標題");
  });

  it("parses stored JSON defensively", () => {
    expect(parseLocalizedText('{"zh":"a","en":"b"}')).toEqual({
      zh: "a",
      en: "b",
    });
    expect(parseLocalizedText("not json")).toEqual({ zh: "", en: "" });
    expect(parseLocalizedText('{"zh":1}')).toEqual({ zh: "", en: "" });
  });
});

describe("formatted text", () => {
  it("splits paragraphs on blank lines and groups dash lines into lists", () => {
    expect(
      parseFormattedText(
        "First paragraph\nstill first.\n\n- one\n- two\n\nLast.",
      ),
    ).toEqual([
      { type: "paragraph", text: "First paragraph\nstill first." },
      { type: "list", items: ["one", "two"] },
      { type: "paragraph", text: "Last." },
    ]);
  });

  it("returns nothing for empty text and ignores CRLF", () => {
    expect(parseFormattedText("   \n\n ")).toEqual([]);
    expect(parseFormattedText("a\r\n\r\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ]);
  });

  it("splits a list that directly follows a paragraph line", () => {
    expect(parseFormattedText("Intro\n- a\n- b")).toEqual([
      { type: "paragraph", text: "Intro" },
      { type: "list", items: ["a", "b"] },
    ]);
  });
});

describe("form parsing", () => {
  it("nests dotted names, arrays and typed suffixes", () => {
    const form = new FormData();
    form.set("intent", "save");
    form.set("title.zh", "標題");
    form.set("title.en", "Title");
    form.set("gallery.1.assetId", "b");
    form.set("gallery.0.assetId", "a");
    form.set("year:number", "2026");
    form.set("sortOrder:number", "");
    form.append("listed:bool", "false");
    form.append("listed:bool", "on");
    form.set("tools:json", '["TypeScript","D1"]');

    expect(formDataToObject(form)).toEqual({
      intent: "save",
      title: { zh: "標題", en: "Title" },
      gallery: [{ assetId: "a" }, { assetId: "b" }],
      year: 2026,
      sortOrder: null,
      listed: true,
      tools: ["TypeScript", "D1"],
    });
    expect(readIntent(form)).toBe("save");
  });

  it("drops the CSRF token and rejects prototype keys and bad JSON", () => {
    const form = new FormData();
    form.set("csrfToken", "secret");
    form.set("__proto__.polluted", "yes");
    form.set("tags:json", "{not json");
    const parsed = formDataToObject(form);
    expect(parsed).toEqual({ tags: null });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(readIntent(form)).toBeNull();
  });
});
