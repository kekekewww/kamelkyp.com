import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND_SETTINGS } from "../../app/lib/cms/schemas/brand-settings";
import {
  getBrandSettings,
  getSiteSettings,
} from "../../app/lib/cms/settings.server";
import {
  archiveTerm,
  createTerm,
  deleteTerm,
  getTerm,
  listTerms,
  reorderTerms,
  updateTerm,
} from "../../app/lib/cms/taxonomy.server";
import { insertProject } from "../helpers/cms";

describe("settings reads", () => {
  it("returns the seeded brand and site documents with their revisions", async () => {
    const brand = await getBrandSettings(env.DB);
    expect(brand.revision).toBe(0);
    expect(brand.value.brandName).toBe("Kamel");
    expect(brand.value.heroStatement.en).toBe(
      "Building systems, sound, and interactive experiences.",
    );
    expect(brand.value.capabilities[1]?.categoryIds).toEqual([
      "term-project_category-ai",
      "term-project_category-research",
    ]);
    const site = await getSiteSettings(env.DB);
    expect(site.value.siteTitle.en).toBe(
      "Kamel — Sound, Software & Interactive Work",
    );
    expect(site.value.serviceAreas.map((area) => area.key)).toEqual([
      "mixing",
      "song_transition",
      "software",
    ]);
    expect(site.value.softwarePage.engagementModels).toHaveLength(2);
  });

  it("falls back per key when a stored value is invalid", async () => {
    await env.DB.prepare(
      "UPDATE settings SET data_json = json_set(data_json, '$.roles', 'broken') WHERE key = 'brand'",
    ).run();
    const brand = await getBrandSettings(env.DB);
    expect(brand.value.roles).toEqual([]);
    expect(brand.value.brandName).toBe("Kamel");
  });

  it("returns Kamel defaults when the rows are missing", async () => {
    await env.DB.prepare("DELETE FROM settings").run();
    const brand = await getBrandSettings(env.DB);
    expect(brand).toEqual({ value: DEFAULT_BRAND_SETTINGS, revision: 0 });
    const site = await getSiteSettings(env.DB);
    expect(site.value.homepage.featuredProjectCount).toBe(4);
  });
});

describe("taxonomy", () => {
  it("lists seeded terms in order", async () => {
    const terms = await listTerms(env.DB, "project_category");
    expect(terms.map((term) => term.slug)).toEqual([
      "software",
      "ai",
      "interactive",
      "creative-technology",
      "music",
      "mixing",
      "research",
    ]);
    expect(terms[0]?.label).toEqual({ zh: "軟體", en: "Software" });
  });

  it("creates, updates, reorders, archives and deletes terms", async () => {
    const term = await createTerm(env.DB, "writing_category", {
      label: { zh: "筆記", en: "Field Notes" },
    });
    expect(term).toMatchObject({
      vocabulary: "writing_category",
      slug: "field-notes",
      archivedAt: null,
    });
    const second = await createTerm(env.DB, "writing_category", {
      label: { zh: "筆記二", en: "Field Notes" },
    });
    expect(second.slug).toBe("field-notes-2");

    const updated = await updateTerm(env.DB, term.id, {
      label: { zh: "田野筆記", en: "Field Notes" },
    });
    expect(updated.label.zh).toBe("田野筆記");

    await reorderTerms(env.DB, "writing_category", [second.id, term.id]);
    expect(
      (await listTerms(env.DB, "writing_category")).map((item) => item.id),
    ).toEqual([second.id, term.id]);

    await archiveTerm(env.DB, second.id);
    expect(
      (await listTerms(env.DB, "writing_category")).map((item) => item.id),
    ).toEqual([term.id]);
    expect(
      await listTerms(env.DB, "writing_category", { includeArchived: true }),
    ).toHaveLength(2);

    await deleteTerm(env.DB, second.id);
    expect(await getTerm(env.DB, second.id)).toBeNull();
  });

  it("refuses to delete a term that is still used", async () => {
    const term = await createTerm(env.DB, "project_category", {
      label: { zh: "聲音設計", en: "Sound Design" },
    });
    await insertProject(env.DB, { categoryId: term.id });
    await expect(deleteTerm(env.DB, term.id)).rejects.toMatchObject({
      code: "term_in_use",
    });
    await expect(
      deleteTerm(env.DB, "term-project_category-software"),
    ).rejects.toMatchObject({ code: "term_in_use" });
  });

  it("validates labels and service-group areas", async () => {
    await expect(
      createTerm(env.DB, "recognition_type", { label: { zh: "", en: "X" } }),
    ).rejects.toMatchObject({ code: "invalid_content" });
    await expect(
      createTerm(env.DB, "service_group", {
        label: { zh: "錄音", en: "Recording" },
      }),
    ).rejects.toMatchObject({ code: "invalid_content" });
    const group = await createTerm(env.DB, "service_group", {
      label: { zh: "錄音", en: "Recording" },
      data: { area: "mixing" },
    });
    expect(group.data).toEqual({ area: "mixing" });
  });
});
