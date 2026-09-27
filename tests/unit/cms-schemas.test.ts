import { describe, expect, it } from "vitest";
import {
  BrandSettingsSchema,
  DEFAULT_BRAND_SETTINGS,
  parseBrandSettings,
} from "../../app/lib/cms/schemas/brand-settings";
import { MusicDraftSchema } from "../../app/lib/cms/schemas/music";
import {
  ProjectDraftSchema,
  ProjectSnapshotSchema,
  projectContentToColumns,
} from "../../app/lib/cms/schemas/project";
import { RecognitionDraftSchema } from "../../app/lib/cms/schemas/recognition";
import {
  ServiceDraftSchema,
  ServiceSnapshotSchema,
  serviceContentToColumns,
} from "../../app/lib/cms/schemas/service";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  SiteSettingsSchema,
} from "../../app/lib/cms/schemas/site-settings";
import { WritingDraftSchema } from "../../app/lib/cms/schemas/writing";

const empty = { zh: "", en: "" };

describe("project schemas", () => {
  it("fills every field from an empty draft", () => {
    const content = ProjectDraftSchema.parse({});
    expect(content.title).toEqual(empty);
    expect(content.listed).toBe(true);
    expect(content.categoryIds).toEqual([]);
    expect(content.story.reflection).toEqual(empty);
    expect(content.body).toEqual({ zh: [], en: [] });
    expect(content.coverImageId).toBeNull();
  });

  it("refuses only structurally unsafe drafts", () => {
    expect(
      ProjectDraftSchema.safeParse({ title: { zh: "x".repeat(201), en: "" } })
        .success,
    ).toBe(false);
    expect(ProjectDraftSchema.safeParse({ year: 1989 }).success).toBe(false);
    expect(ProjectDraftSchema.safeParse({ slug: "Bad Slug" }).success).toBe(
      false,
    );
    expect(ProjectDraftSchema.safeParse({ year: null, slug: "" }).success).toBe(
      true,
    );
  });

  it("keeps the primary category first in the category list", () => {
    const content = ProjectDraftSchema.parse({
      primaryCategoryId: "term-b",
      categoryIds: ["term-a", "term-b", "term-a"],
      coverImageId: "",
    });
    expect(content.categoryIds).toEqual(["term-b", "term-a"]);
    expect(content.coverImageId).toBeNull();
  });

  it("maps content to columns and back through the snapshot shape", () => {
    const content = ProjectDraftSchema.parse({
      slug: "signal-garden",
      year: 2026,
      primaryCategoryId: "term-a",
      categoryIds: ["term-a"],
      title: { zh: "訊號花園", en: "Signal Garden" },
      gallery: [{ assetId: "img-1", caption: { zh: "圖", en: "Image" } }],
      links: [{ label: { zh: "網站", en: "Site" }, url: "https://x.example" }],
      credits: [{ role: { zh: "混音", en: "Mix" }, name: "Kamel" }],
      tools: ["D1"],
    });
    const columns = projectContentToColumns(content);
    expect(JSON.parse(String(columns.gallery_json))).toEqual([
      { assetId: "img-1", caption_i18n: { zh: "圖", en: "Image" } },
    ]);
    const snapshot = {
      schema_version: 1,
      core: {
        slug: columns.slug,
        listed: columns.listed,
        year: columns.year,
        primary_category_id: columns.primary_category_id,
        categories: [[0, "term-a"]],
        title_i18n: JSON.parse(String(columns.title_i18n)),
        role_i18n: JSON.parse(String(columns.role_i18n)),
        short_description_i18n: JSON.parse(
          String(columns.short_description_i18n),
        ),
        description_i18n: JSON.parse(String(columns.description_i18n)),
        tools: JSON.parse(String(columns.tools_json)),
        technologies: JSON.parse(String(columns.technologies_json)),
      },
      media: {
        cover_image_id: null,
        cover_video_id: null,
        gallery: JSON.parse(String(columns.gallery_json)),
        social_image_id: null,
      },
      story: Object.fromEntries(
        [
          "context",
          "problem",
          "approach",
          "process",
          "architecture",
          "result",
          "reflection",
        ].map((key) => [
          `${key}_i18n`,
          JSON.parse(String(columns[`${key}_i18n`])),
        ]),
      ),
      extra: {
        links: JSON.parse(String(columns.links_json)),
        credits: JSON.parse(String(columns.credits_json)),
        body_i18n: JSON.parse(String(columns.body_i18n)),
      },
      seo: {
        title_i18n: JSON.parse(String(columns.seo_title_i18n)),
        description_i18n: JSON.parse(String(columns.seo_description_i18n)),
      },
    };
    expect(ProjectSnapshotSchema.parse(snapshot)).toEqual(content);
  });

  it("drops invalid legacy blocks instead of rejecting the snapshot", () => {
    const parsed = ProjectSnapshotSchema.safeParse({
      schema_version: 1,
      core: {
        slug: "legacy",
        listed: 1,
        year: 2025,
        primary_category_id: null,
        categories: [],
        title_i18n: { zh: "舊", en: "" },
      },
      media: {},
      story: {},
      extra: {
        body_i18n: {
          zh: [{ type: "paragraph", text: "ok" }, { type: "unknown" }],
          en: [],
        },
      },
      seo: {},
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.body.zh).toEqual([{ type: "paragraph", text: "ok" }]);
  });
});

describe("service schemas", () => {
  it("stores deliverables and FAQ as localized JSON", () => {
    const content = ServiceDraftSchema.parse({
      slug: "web",
      priceMode: "custom_quote",
      deliverables: [{ zh: "網站", en: "Site" }],
      faq: [
        {
          question: { zh: "多久？", en: "How long?" },
          answer: { zh: "兩週", en: "Two weeks" },
        },
      ],
    });
    const columns = serviceContentToColumns(content);
    expect(JSON.parse(String(columns.faq_json))).toEqual([
      {
        question_i18n: { zh: "多久？", en: "How long?" },
        answer_i18n: { zh: "兩週", en: "Two weeks" },
      },
    ]);
    expect(columns).not.toHaveProperty("commission_service_id");
    expect(
      ServiceSnapshotSchema.parse({
        schema_version: 1,
        core: {
          slug: "web",
          group_term_id: null,
          commission_service_id: null,
          name_i18n: empty,
          short_description_i18n: empty,
          description_i18n: empty,
          price_mode: "custom_quote",
          price_amount: null,
          currency: null,
          inquiry_subject_i18n: empty,
        },
        details: {
          turnaround_i18n: empty,
          revisions_i18n: empty,
          deliverables: [{ zh: "網站", en: "Site" }],
          requirements: [],
          process: [],
          faq: JSON.parse(String(columns.faq_json)),
        },
      }),
    ).toEqual(content);
  });

  it("rejects unknown price modes and currencies", () => {
    expect(ServiceDraftSchema.safeParse({ priceMode: "free" }).success).toBe(
      false,
    );
    expect(ServiceDraftSchema.safeParse({ currency: "EUR" }).success).toBe(
      false,
    );
  });
});

describe("other entry schemas", () => {
  it("defaults writing to an internal platform", () => {
    const content = WritingDraftSchema.parse({ externalUrl: "" });
    expect(content.platform).toBe("internal");
    expect(content.externalUrl).toBeNull();
    expect(WritingDraftSchema.safeParse({ platform: "tiktok" }).success).toBe(
      false,
    );
  });

  it("rejects malformed dates and preview ranges", () => {
    expect(RecognitionDraftSchema.safeParse({ date: "2026-9-1" }).success).toBe(
      false,
    );
    expect(
      MusicDraftSchema.safeParse({
        previewStartSeconds: 30,
        previewEndSeconds: 10,
      }).success,
    ).toBe(false);
  });
});

describe("settings documents", () => {
  it("defaults the brand to Kamel with empty text", () => {
    expect(DEFAULT_BRAND_SETTINGS.brandName).toBe("Kamel");
    expect(DEFAULT_BRAND_SETTINGS.contactEmail).toBe("");
    expect(parseBrandSettings("not json")).toEqual(DEFAULT_BRAND_SETTINGS);
    expect(parseBrandSettings({ brandName: "Kamel" }).roles).toEqual([]);
  });

  it("validates brand CTAs, names and emails on save", () => {
    const valid = { ...DEFAULT_BRAND_SETTINGS, brandName: "Kamel" };
    expect(BrandSettingsSchema.safeParse(valid).success).toBe(true);
    expect(
      BrandSettingsSchema.safeParse({ ...valid, brandName: "" }).success,
    ).toBe(false);
    expect(
      BrandSettingsSchema.safeParse({
        ...valid,
        primaryCta: { label: empty, href: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      BrandSettingsSchema.safeParse({
        ...valid,
        primaryCta: { label: empty, href: "//evil.example" },
      }).success,
    ).toBe(false);
    expect(
      BrandSettingsSchema.safeParse({ ...valid, contactEmail: "nope" }).success,
    ).toBe(false);
  });

  it("keeps homepage counts in range and fills missing keys", () => {
    expect(DEFAULT_SITE_SETTINGS.homepage.featuredProjectCount).toBe(4);
    expect(
      SiteSettingsSchema.safeParse({
        ...DEFAULT_SITE_SETTINGS,
        homepage: {
          ...DEFAULT_SITE_SETTINGS.homepage,
          featuredProjectCount: 0,
        },
      }).success,
    ).toBe(false);
    const parsed = parseSiteSettings({ schemaVersion: 1 });
    expect(parsed.homepage.sections.showreel).toBe(true);
    expect(parsed.navigation.items.map((item) => item.key)).toEqual([
      "work",
      "services",
      "about",
      "writing",
    ]);
  });
});
