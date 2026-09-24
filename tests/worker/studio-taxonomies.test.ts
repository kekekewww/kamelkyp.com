import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  handleTaxonomyAction,
  loadTaxonomyScreen,
} from "../../app/lib/cms/repositories/taxonomies.server";
import { getTerm, listTerms } from "../../app/lib/cms/taxonomy.server";

const now = new Date("2026-09-25T10:00:00Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

type Result = {
  data?: Record<string, unknown>;
  init?: { status?: number } | null;
};
const body = (result: unknown) =>
  ((result as Result).data ?? {}) as Record<string, unknown>;
const status = (result: unknown) => (result as Result).init?.status ?? 200;

async function act(intent: string, fields: Record<string, string>) {
  return handleTaxonomyAction({
    db: env.DB,
    formData: form({ intent, ...fields }),
    intent,
    now,
  });
}

describe("taxonomy screen", () => {
  it("lists one vocabulary with usage counts", async () => {
    const screen = await loadTaxonomyScreen(env.DB, "service_group");
    expect(screen.vocabulary).toBe("service_group");
    const mixing = screen.terms.find(
      (term) => term.id === "term-service_group-mixing",
    );
    expect(mixing?.usage).toBeGreaterThan(0);
    expect(screen.terms.map((term) => term.slug)).toEqual(
      expect.arrayContaining([
        "mixing",
        "music-production",
        "software-development",
        "creative-technology",
        "interactive-experiences",
      ]),
    );
  });

  it("falls back to project categories for an unknown vocabulary", async () => {
    const screen = await loadTaxonomyScreen(env.DB, "nope");
    expect(screen.vocabulary).toBe("project_category");
  });
});

describe("taxonomy actions", () => {
  it("adds a category with both labels", async () => {
    const result = await act("create", {
      vocabulary: "project_category",
      "label.zh": "聲音裝置",
      "label.en": "Sound Installation",
    });
    expect(body(result).ok).toBe(true);
    const terms = await listTerms(env.DB, "project_category");
    expect(terms.map((term) => term.slug)).toContain("sound-installation");
  });

  it("requires both labels", async () => {
    const result = await act("create", {
      vocabulary: "recognition_type",
      "label.zh": "",
      "label.en": "Grant",
    });
    expect(status(result)).toBe(422);
    expect(body(result).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "label" })]),
    );
  });

  it("requires a service area for service groups", async () => {
    const missing = await act("create", {
      vocabulary: "service_group",
      "label.zh": "聲音設計",
      "label.en": "Sound Design",
    });
    expect(status(missing)).toBe(422);
    const created = await act("create", {
      vocabulary: "service_group",
      "label.zh": "聲音設計",
      "label.en": "Sound Design",
      "data.area": "software",
    });
    expect(body(created).ok).toBe(true);
    const term = await getTerm(env.DB, "term-service_group-sound-design");
    expect(term?.data).toEqual({ area: "software" });
  });

  it("renames a term and changes its slug", async () => {
    await act("create", {
      vocabulary: "writing_category",
      "label.zh": "筆記",
      "label.en": "Notes",
    });
    const result = await act("update", {
      id: "term-writing_category-notes",
      "label.zh": "工作筆記",
      "label.en": "Studio Notes",
      slug: "studio-notes",
    });
    expect(body(result).ok).toBe(true);
    const term = await getTerm(env.DB, "term-writing_category-notes");
    expect(term?.label).toEqual({ zh: "工作筆記", en: "Studio Notes" });
    expect(term?.slug).toBe("studio-notes");
  });

  it("archives and restores terms", async () => {
    await act("archive", { id: "term-recognition_type-speaking" });
    expect(
      (await getTerm(env.DB, "term-recognition_type-speaking"))?.archivedAt,
    ).toBe(now.toISOString());
    await act("restore", { id: "term-recognition_type-speaking" });
    expect(
      (await getTerm(env.DB, "term-recognition_type-speaking"))?.archivedAt,
    ).toBeNull();
  });

  it("deletes only unused terms", async () => {
    const used = await act("delete", { id: "term-service_group-mixing" });
    expect(status(used)).toBe(409);
    expect(body(used).code).toBe("term_in_use");

    await act("create", {
      vocabulary: "writing_category",
      "label.zh": "草稿",
      "label.en": "Scratch",
    });
    const unused = await act("delete", {
      id: "term-writing_category-scratch",
    });
    expect(body(unused).ok).toBe(true);
    expect(await getTerm(env.DB, "term-writing_category-scratch")).toBeNull();
  });

  it("reorders a vocabulary", async () => {
    const before = await listTerms(env.DB, "recognition_type");
    const reversed = [...before].reverse().map((term) => term.id);
    const result = await act("reorder", {
      vocabulary: "recognition_type",
      ids: JSON.stringify(reversed),
    });
    expect(body(result).ok).toBe(true);
    const after = await listTerms(env.DB, "recognition_type");
    expect(after.map((term) => term.id)).toEqual(reversed);
  });

  it("rejects unknown intents", async () => {
    const result = await act("explode", {});
    expect(status(result)).toBe(422);
  });
});
