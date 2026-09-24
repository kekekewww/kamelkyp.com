import { describe, expect, it } from "vitest";
import { findBrandViolations } from "../../app/lib/cms/brand-guard.server";
import { MusicDraftSchema } from "../../app/lib/cms/schemas/music";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { RecognitionDraftSchema } from "../../app/lib/cms/schemas/recognition";
import { ServiceDraftSchema } from "../../app/lib/cms/schemas/service";
import { WritingDraftSchema } from "../../app/lib/cms/schemas/writing";
import {
  type AssetSummary,
  hasBlockingIssues,
  validateForPublish,
} from "../../app/lib/cms/validation";

const text = (zh: string, en = zh) => ({ zh, en });

function completeProject() {
  return ProjectDraftSchema.parse({
    slug: "signal-garden",
    year: 2026,
    primaryCategoryId: "term-a",
    categoryIds: ["term-a"],
    title: text("訊號花園", "Signal Garden"),
    shortDescription: text("摘要", "Summary"),
  });
}

function codes(issues: { code: string; field: string; locale?: string }[]) {
  return issues.map(
    (issue) =>
      `${issue.code}:${issue.field}${issue.locale ? `:${issue.locale}` : ""}`,
  );
}

describe("publish validation", () => {
  it("lists every missing required project field per locale", () => {
    const issues = validateForPublish("project", ProjectDraftSchema.parse({}), {
      todoContent: false,
    });
    expect(hasBlockingIssues(issues)).toBe(true);
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        "required_locale:title:zh",
        "required_locale:title:en",
        "required:slug",
        "required:year",
        "required:primaryCategoryId",
        "required_locale:shortDescription:zh",
      ]),
    );
  });

  it("accepts a complete project and warns about one-locale optional text", () => {
    const content = completeProject();
    content.story.reflection = text("心得", "");
    const issues = validateForPublish("project", content, {
      todoContent: false,
    });
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "one_locale_only",
        field: "story.reflection",
        severity: "warning",
      }),
    ]);
  });

  it("blocks TODO_CONTENT rows, taken slugs, brand names and oversized snapshots", () => {
    const issues = validateForPublish("project", completeProject(), {
      todoContent: true,
      slugAvailable: false,
      brandViolations: [{ field: "title", locale: "en", term: "Kevin" }],
      snapshotBytes: 1_600_000,
    });
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        "todo_content:todoContent",
        "slug_taken:slug",
        "brand_name:title:en",
        "snapshot_too_large:snapshot",
      ]),
    );
  });

  it("checks referenced assets for existence, kind and alt text", () => {
    const content = completeProject();
    content.coverImageId = "img-no-alt";
    content.coverVideoId = "img-as-video";
    content.gallery = [{ assetId: "gone", caption: text("", "") }];
    const assets = new Map<string, AssetSummary>([
      [
        "img-no-alt",
        {
          id: "img-no-alt",
          kind: "image",
          state: "ready",
          alt: text("圖", ""),
        },
      ],
      [
        "img-as-video",
        {
          id: "img-as-video",
          kind: "image",
          state: "ready",
          alt: text("圖", "Image"),
        },
      ],
    ]);
    const issues = validateForPublish("project", content, {
      todoContent: false,
      assets,
    });
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        "alt_required:coverImageId:en",
        "wrong_asset_kind:coverVideoId",
        "missing_asset:gallery.0.assetId",
      ]),
    );
  });

  it("applies the writing content-or-link rule by platform", () => {
    const base = {
      slug: "notes",
      date: "2026-09-01",
      title: text("筆記", "Notes"),
    };
    const internal = WritingDraftSchema.parse({
      ...base,
      platform: "internal",
    });
    expect(
      codes(validateForPublish("writing", internal, { todoContent: false })),
    ).toEqual(
      expect.arrayContaining([
        "required_locale:content:zh",
        "required_locale:content:en",
      ]),
    );

    const external = WritingDraftSchema.parse({
      ...base,
      platform: "threads",
      externalUrl: "http://threads.example/post",
    });
    expect(
      codes(validateForPublish("writing", external, { todoContent: false })),
    ).toContain("invalid_url:externalUrl");

    const other = WritingDraftSchema.parse({
      ...base,
      platform: "other",
      externalUrl: "https://example.com/post",
    });
    expect(
      codes(validateForPublish("writing", other, { todoContent: false })),
    ).toContain("required:platformLabel");

    const linkOut = WritingDraftSchema.parse({
      ...base,
      platform: "medium",
      externalUrl: "https://medium.com/@kamel/notes",
    });
    expect(
      hasBlockingIssues(
        validateForPublish("writing", linkOut, { todoContent: false }),
      ),
    ).toBe(false);
  });

  it("enforces service price modes and protects commission rows", () => {
    const base = {
      slug: "web",
      groupTermId: "term-group",
      name: text("網站", "Web"),
      description: text("說明", "Description"),
    };
    const fixed = ServiceDraftSchema.parse({ ...base, priceMode: "fixed" });
    expect(
      codes(validateForPublish("service", fixed, { todoContent: false })),
    ).toContain("price_required:priceAmount");

    const quote = ServiceDraftSchema.parse({
      ...base,
      priceMode: "custom_quote",
    });
    expect(
      hasBlockingIssues(
        validateForPublish("service", quote, { todoContent: false }),
      ),
    ).toBe(false);

    const commission = ServiceDraftSchema.parse({
      ...base,
      priceMode: "starting_from",
      priceAmount: 5000,
      currency: "TWD",
    });
    expect(
      codes(
        validateForPublish("service", commission, {
          todoContent: false,
          commissionLinked: true,
        }),
      ),
    ).toContain("price_forbidden:priceAmount");
  });

  it("requires a playable source for music and a showreel-capable one", () => {
    const track = MusicDraftSchema.parse({
      title: text("曲", "Track"),
      artist: text("Kamel"),
      spotifyUrl: "https://open.spotify.com/track/1",
    });
    expect(
      hasBlockingIssues(
        validateForPublish("music", track, { todoContent: false }),
      ),
    ).toBe(false);
    expect(
      codes(
        validateForPublish("music", track, {
          todoContent: false,
          isShowreel: true,
        }),
      ),
    ).toContain("required:audioPreviewId");
    const wrongHost = MusicDraftSchema.parse({
      title: text("曲", "Track"),
      artist: text("Kamel"),
      youtubeUrl: "https://example.com/watch?v=1",
    });
    expect(
      codes(validateForPublish("music", wrongHost, { todoContent: false })),
    ).toContain("invalid_url:youtubeUrl");
  });

  it("requires year, type and event for recognition", () => {
    const issues = validateForPublish(
      "recognition",
      RecognitionDraftSchema.parse({}),
      { todoContent: false },
    );
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        "required:year",
        "required:typeTermId",
        "required_locale:event:zh",
      ]),
    );
  });
});

describe("brand guard", () => {
  it("finds personal-name variants in any public text", () => {
    expect(
      findBrandViolations({
        title: { zh: "楊子賢的作品", en: "A work by Kevin Yang" },
        credits: [{ role: { zh: "", en: "" }, name: "kevin" }],
        tools: ["Kevinson Synth", "Yin-Yang"],
      }),
    ).toEqual([
      { field: "title", locale: "zh", term: "楊子賢" },
      { field: "title", locale: "en", term: "Kevin Yang" },
      { field: "credits.0.name", term: "Kevin" },
      { field: "tools.1", term: "Yang" },
    ]);
  });

  it("skips exempt fields", () => {
    expect(
      findBrandViolations(
        { contactEmail: "kevinyaungputra@gmail.com", brandName: "Kamel" },
        { exempt: ["contactEmail"] },
      ),
    ).toEqual([]);
  });
});
