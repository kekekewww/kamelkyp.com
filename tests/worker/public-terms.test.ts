import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { listPublishedTerms } from "../../app/lib/content/public-content.server";

describe("public legal terms", () => {
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

  it("rejects a term publication pointer with a mismatched version tuple", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO term_documents (id, kind) VALUES (?, ?)",
      ).bind("term-a", "common"),
      env.DB.prepare(
        "INSERT INTO term_documents (id, kind) VALUES (?, ?)",
      ).bind("term-b", "common"),
      env.DB.prepare(
        "INSERT INTO term_versions " +
          "(id, document_id, locale, version_number, body_json, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("term-version-b", "term-b", "zh", 1, "[]", "2026-08-14T00:00:00Z"),
    ]);

    await expect(
      env.DB.prepare(
        "INSERT INTO term_publications " +
          "(document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
      )
        .bind("term-a", "zh", "term-version-b", "2026-08-14T00:00:00Z")
        .run(),
    ).rejects.toThrow();
  });
});
