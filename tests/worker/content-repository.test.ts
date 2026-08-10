import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createDraftVersion,
  getPublishedContent,
  publishVersion,
} from "../../app/lib/db/content-repository.server";

function draftInput(entryId: string, title: string) {
  return {
    entryId,
    kind: "page" as const,
    slug: entryId,
    locale: "zh" as const,
    title,
    summary: null,
    body: [{ type: "paragraph", text: title }],
  };
}

describe("content publication", () => {
  it("keeps the previous publication live until the draft is published", async () => {
    const first = await createDraftVersion(
      env.DB,
      draftInput("home", "第一版"),
    );
    await publishVersion(env.DB, first.versionId, "2026-08-10T00:00:00Z");

    const second = await createDraftVersion(
      env.DB,
      draftInput("home", "第二版草稿"),
    );

    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第一版");

    await publishVersion(env.DB, second.versionId, "2026-08-11T00:00:00Z");
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title)
      .toBe("第二版草稿");
  });

  it("assigns unique sequential draft numbers to concurrent drafts", async () => {
    const [first, second] = await Promise.all([
      createDraftVersion(env.DB, draftInput("parallel-drafts", "first")),
      createDraftVersion(env.DB, draftInput("parallel-drafts", "second")),
    ]);

    expect(first.versionId).not.toBe(second.versionId);
    const rows = await env.DB
      .prepare(
        "SELECT version_number FROM content_versions " +
          "WHERE entry_id = ? AND locale = ? ORDER BY version_number",
      )
      .bind("parallel-drafts", "zh")
      .all<{ version_number: number }>();

    expect(rows.results.map((row) => row.version_number)).toEqual([1, 2]);
  });

  it("publishes a draft only once when concurrent callers race", async () => {
    const draft = await createDraftVersion(
      env.DB,
      draftInput("parallel-publication", "only once"),
    );
    const times = ["2026-08-12T00:00:00Z", "2026-08-13T00:00:00Z"];

    const results = await Promise.allSettled(
      times.map((publishedAt) =>
        publishVersion(env.DB, draft.versionId, publishedAt),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const pointer = await env.DB
      .prepare(
        "SELECT p.published_at AS pointer_published_at, " +
          "v.published_at AS version_published_at " +
          "FROM content_publications p " +
          "JOIN content_versions v ON v.id = p.version_id " +
          "WHERE p.entry_id = ? AND p.locale = ?",
      )
      .bind("parallel-publication", "zh")
      .first<{
        pointer_published_at: string;
        version_published_at: string;
      }>();

    expect(pointer?.pointer_published_at).toBe(pointer?.version_published_at);
    expect(times).toContain(pointer?.pointer_published_at);
  });

  it(
    "rejects a content publication pointer with a mismatched version tuple",
    async () => {
      await createDraftVersion(env.DB, draftInput("content-a", "A"));
      const other = await createDraftVersion(
        env.DB,
        draftInput("content-b", "B"),
      );

      await expect(
        env.DB
          .prepare(
            "INSERT INTO content_publications " +
              "(entry_id, locale, version_id, published_at) VALUES (?, ?, ?, ?)",
          )
          .bind("content-a", "zh", other.versionId, "2026-08-14T00:00:00Z")
          .run(),
      ).rejects.toThrow();
    },
  );

  it(
    "rejects a term publication pointer with a mismatched version tuple",
    async () => {
      await env.DB.batch([
        env.DB
          .prepare("INSERT INTO term_documents (id, kind) VALUES (?, ?)")
          .bind("term-a", "common"),
        env.DB
          .prepare("INSERT INTO term_documents (id, kind) VALUES (?, ?)")
          .bind("term-b", "common"),
        env.DB
          .prepare(
            "INSERT INTO term_versions " +
              "(id, document_id, locale, version_number, body_json, created_at) " +
              "VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            "term-version-b",
            "term-b",
            "zh",
            1,
            "[]",
            "2026-08-14T00:00:00Z",
          ),
      ]);

      await expect(
        env.DB
          .prepare(
            "INSERT INTO term_publications " +
              "(document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
          )
          .bind("term-a", "zh", "term-version-b", "2026-08-14T00:00:00Z")
          .run(),
      ).rejects.toThrow();
    },
  );
});
