import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createDraft,
  getAdminContentVersion,
  publishDraft,
  saveDraft,
  unpublishContent,
} from "../../app/lib/admin/content-service.server";
import {
  createDraftVersion,
  getPublishedContent,
  publishVersion,
} from "../../app/lib/db/content-repository.server";

async function seedPublishedHome(locale: "zh" | "en", title: string) {
  const draft = await createDraftVersion(env.DB, {
    entryId: "home",
    kind: "page",
    slug: "home",
    locale,
    title,
    summary: null,
    body: [{ type: "paragraph", text: title }],
  });
  await publishVersion(env.DB, draft.versionId, "2026-08-19T00:00:00Z");
  return draft.versionId;
}

describe("versioned admin publication", () => {
  it("keeps drafts private and switches the publication pointer atomically", async () => {
    const v1 = await seedPublishedHome("zh", "首頁 v1");
    const v2 = await createDraft({
      db: env.DB,
      entryId: "home",
      locale: "zh",
      baseVersionId: v1,
    });
    const saved = await saveDraft({
      db: env.DB,
      versionId: v2.id,
      expectedRevision: 0,
      blocks: [{ type: "paragraph", text: "首頁 v2" }],
      seo: {
        title: "首頁 v2",
        summary: "新版首頁",
        seoTitle: "Kamel v2",
        seoDescription: "新版",
        socialImageUrl: null,
      },
    });
    expect(saved.revision).toBe(1);
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title).toBe(
      "首頁 v1",
    );
    expect((await getAdminContentVersion(env.DB, v2.id)).body).toEqual([
      { type: "paragraph", text: "首頁 v2" },
    ]);

    await publishDraft({ db: env.DB, versionId: v2.id, now: new Date("2026-08-19T01:00:00Z") });
    await publishDraft({ db: env.DB, versionId: v2.id, now: new Date("2026-08-19T01:00:00Z") });
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title).toBe(
      "首頁 v2",
    );

    const v3 = await createDraft({ db: env.DB, entryId: "home", locale: "zh", baseVersionId: v2.id });
    expect(v3.versionNumber).toBe(3);
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.versionId).toBe(v2.id);

    await expect(
      env.DB.prepare("UPDATE content_versions SET title = 'mutated' WHERE id = ?")
        .bind(v2.id)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("DELETE FROM content_versions WHERE id = ?").bind(v2.id).run(),
    ).rejects.toThrow();

    await unpublishContent({ db: env.DB, entryId: "home", locale: "zh" });
    expect(await getPublishedContent(env.DB, "page", "home", "zh")).toBeNull();
    expect(await getAdminContentVersion(env.DB, v1)).toBeTruthy();
    expect(await getAdminContentVersion(env.DB, v2.id)).toBeTruthy();
    expect(await getAdminContentVersion(env.DB, v3.id)).toBeTruthy();
  });

  it("keeps locale pointers independent and rejects stale draft saves", async () => {
    await seedPublishedHome("zh", "中文");
    const enV1 = await seedPublishedHome("en", "English");
    const enV2 = await createDraft({ db: env.DB, entryId: "home", locale: "en", baseVersionId: enV1 });
    await saveDraft({
      db: env.DB,
      versionId: enV2.id,
      expectedRevision: 0,
      blocks: [{ type: "paragraph", text: "English v2" }],
      seo: { title: "English v2", summary: null, seoTitle: null, seoDescription: null, socialImageUrl: null },
    });
    await expect(
      saveDraft({
        db: env.DB,
        versionId: enV2.id,
        expectedRevision: 0,
        blocks: [{ type: "paragraph", text: "stale" }],
        seo: { title: "stale", summary: null, seoTitle: null, seoDescription: null, socialImageUrl: null },
      }),
    ).rejects.toThrow("stale_revision");
    await publishDraft({ db: env.DB, versionId: enV2.id, now: new Date("2026-08-19T02:00:00Z") });
    expect((await getPublishedContent(env.DB, "page", "home", "zh"))?.title).toBe("中文");
    expect((await getPublishedContent(env.DB, "page", "home", "en"))?.title).toBe("English v2");
  });
});
