import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  listPublishedContent,
  listPublishedTerms,
} from "../../app/lib/content/public-content.server";
import {
  createDraftVersion,
  publishVersion,
} from "../../app/lib/db/content-repository.server";

async function publishContent(input: {
  entryId: string;
  kind: "work" | "post";
  locale: "zh" | "en";
  title: string;
}) {
  const draft = await createDraftVersion(env.DB, {
    ...input,
    slug: input.entryId,
    summary: `${input.title} summary`,
    body: [{ type: "paragraph", text: input.title }],
  });
  await publishVersion(env.DB, draft.versionId, "2026-08-19T00:00:00Z");
}

describe("public content listings", () => {
  it("parses published legal clauses using the term schema", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) VALUES ('common-zh-v1', 'common', 'zh', 1, ?, '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z')",
      ).bind(
        JSON.stringify([
          { key: "deposit", title: "訂金", text: "確認後支付 50%。" },
        ]),
      ),
      env.DB.prepare(
        "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES ('common', 'zh', 'common-zh-v1', '2026-08-19T00:00:00Z')",
      ),
    ]);

    const terms = await listPublishedTerms(env.DB, "zh", "terms");

    expect(terms).toHaveLength(1);
    expect(terms[0]?.clauses).toEqual([
      { key: "deposit", title: "訂金", text: "確認後支付 50%。" },
    ]);
  });

  it("does not fall back from missing English content to Chinese", async () => {
    await publishContent({
      entryId: "zh-only-post",
      kind: "post",
      locale: "zh",
      title: "只有中文",
    });

    const items = await listPublishedContent(env.DB, "post", "en");
    expect(items.some((item) => item.entryId === "zh-only-post")).toBe(false);
  });

  it("returns only listed, published entries for the requested locale", async () => {
    await publishContent({
      entryId: "listed-work",
      kind: "work",
      locale: "zh",
      title: "公開作品",
    });
    await publishContent({
      entryId: "hidden-work",
      kind: "work",
      locale: "zh",
      title: "隱藏作品",
    });
    await env.DB.prepare(
      "UPDATE content_entries SET is_listed = 0 WHERE id = ?",
    )
      .bind("hidden-work")
      .run();
    await createDraftVersion(env.DB, {
      entryId: "draft-work",
      kind: "work",
      slug: "draft-work",
      locale: "zh",
      title: "草稿作品",
      summary: null,
      body: [{ type: "paragraph", text: "draft" }],
    });

    const items = await listPublishedContent(env.DB, "work", "zh");
    expect(items.map((item) => item.entryId)).toContain("listed-work");
    expect(items.map((item) => item.entryId)).not.toContain("hidden-work");
    expect(items.map((item) => item.entryId)).not.toContain("draft-work");
    expect(items.every((item) => item.locale === "zh")).toBe(true);
  });
});
