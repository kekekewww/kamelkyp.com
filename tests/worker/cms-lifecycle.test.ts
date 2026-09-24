import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  archiveEntity,
  checkSlug,
  createEntity,
  deleteEntity,
  duplicateEntity,
  getEntity,
  getWorkingSnapshot,
  listEntityOptions,
  publishEntity,
  reorder,
  restoreEntity,
  revertToPublished,
  saveEntity,
  setFeatured,
  setShowreel,
  unpublishEntity,
  validateEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import { rebuildAllUsages } from "../../app/lib/cms/db/usage.server";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { insertExternalAsset, uniqueId } from "../helpers/cms";

const now = new Date("2026-09-24T10:00:00Z");
const later = new Date("2026-09-24T11:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });

async function completeProject(slug = uniqueId("proj")) {
  const cover = await insertExternalAsset(env.DB, { alt: "Cover" });
  const meta = await createEntity(
    env.DB,
    "project",
    { title: text("訊號", "Signal") },
    { now },
  );
  const content = ProjectDraftSchema.parse({
    slug,
    year: 2026,
    primaryCategoryId: "term-project_category-software",
    categoryIds: ["term-project_category-software", "term-project_category-ai"],
    title: text("訊號花園", "Signal Garden"),
    shortDescription: text("摘要", "Summary"),
    coverImageId: cover,
  });
  const saved = await saveEntity(env.DB, "project", meta.id, 0, content, now);
  return { id: meta.id, meta: saved, content, cover };
}

async function usages(entityId: string) {
  const rows = await env.DB.prepare(
    "SELECT asset_id, field, scope FROM media_usages WHERE entity_id = ? ORDER BY scope, field",
  )
    .bind(entityId)
    .all<{ asset_id: string; field: string; scope: string }>();
  return rows.results;
}

describe("creating and saving", () => {
  it("creates drafts at the top of the list with a slug from the English title", async () => {
    const first = await createEntity(env.DB, "project", {
      title: text("第一", "Order Test First"),
    });
    const second = await createEntity(env.DB, "project", {
      title: text("第二", "Order Test First"),
    });
    expect(first.status).toBe("draft");
    expect(first.slug).toBe("order-test-first");
    expect(second.slug).toBe("order-test-first-2");
    expect(second.sortOrder).toBeLessThan(first.sortOrder);
    expect(second.revision).toBe(0);

    const zhOnly = await createEntity(env.DB, "project", {
      title: text("只有中文", ""),
    });
    expect(zhOnly.slug).toMatch(/^project-[a-z0-9]{6}$/);
  });

  it("round-trips a saved working copy and rejects stale revisions", async () => {
    const { id, meta, content } = await completeProject();
    expect(meta.revision).toBe(1);
    const loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.content).toEqual(content);
    expect(loaded?.published).toBeNull();

    await expect(
      saveEntity(
        env.DB,
        "project",
        id,
        0,
        { ...content, title: text("舊", "Stale") },
        later,
      ),
    ).rejects.toMatchObject({ code: "stale_revision", status: 409 });
    const after = await getEntity(env.DB, "project", id);
    expect(after?.content.title).toEqual(content.title);
    expect(after?.content.categoryIds).toEqual(content.categoryIds);
  });

  it("saves drafts with nothing but a title", async () => {
    const meta = await createEntity(env.DB, "project", {
      title: text("草稿", "Just A Draft"),
    });
    const saved = await saveEntity(
      env.DB,
      "project",
      meta.id,
      0,
      ProjectDraftSchema.parse({ title: text("草稿", "Just A Draft") }),
      now,
    );
    expect(saved.revision).toBe(1);
    expect(saved.slug).toBe(meta.slug);
  });
});

describe("publishing", () => {
  it("refuses an incomplete entry and lists what is missing", async () => {
    const meta = await createEntity(env.DB, "project", {
      title: text("未完成", "Incomplete"),
    });
    const outcome = await publishEntity(env.DB, "project", meta.id, 0, now);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues.map((issue) => issue.field)).toEqual(
        expect.arrayContaining([
          "year",
          "primaryCategoryId",
          "shortDescription",
        ]),
      );
    }
    expect((await getEntity(env.DB, "project", meta.id))?.meta.status).toBe(
      "draft",
    );
    expect(
      (await validateEntity(env.DB, "project", meta.id)).some(
        (issue) => issue.field === "year",
      ),
    ).toBe(true);
  });

  it("freezes a snapshot, indexes published usage and keeps edits unpublished", async () => {
    const { id, content, cover } = await completeProject();
    const outcome = await publishEntity(env.DB, "project", id, 1, now);
    expect(outcome.ok).toBe(true);
    const published = await getEntity(env.DB, "project", id);
    expect(published?.meta).toMatchObject({
      status: "published",
      publishedSlug: content.slug,
      hasUnpublishedChanges: false,
      publishedAt: now.toISOString(),
    });
    expect(published?.published).toEqual(content);
    expect(await usages(id)).toEqual([
      { asset_id: cover, field: "coverImageId", scope: "published" },
      { asset_id: cover, field: "coverImageId", scope: "working" },
    ]);

    const edited = await saveEntity(
      env.DB,
      "project",
      id,
      1,
      { ...content, title: text("新標題", "New Title") },
      later,
    );
    expect(edited.hasUnpublishedChanges).toBe(true);
    const current = await getEntity(env.DB, "project", id);
    expect(current?.published?.title).toEqual(content.title);

    const reverted = await revertToPublished(env.DB, "project", id, 2, later);
    expect(reverted.hasUnpublishedChanges).toBe(false);
    expect((await getEntity(env.DB, "project", id))?.content.title).toEqual(
      content.title,
    );
  });

  it("keeps the old URL alive when a published slug changes", async () => {
    const oldSlug = uniqueId("old-slug");
    const { id, content } = await completeProject(oldSlug);
    await publishEntity(env.DB, "project", id, 1, now);
    const newSlug = uniqueId("new-slug");
    await saveEntity(
      env.DB,
      "project",
      id,
      1,
      { ...content, slug: newSlug },
      later,
    );
    const outcome = await publishEntity(env.DB, "project", id, 2, later);
    expect(outcome.ok).toBe(true);

    const redirect = await env.DB.prepare(
      "SELECT entity_id FROM slug_redirects WHERE entity_type = 'project' AND from_slug = ?",
    )
      .bind(oldSlug)
      .first<{ entity_id: string }>();
    expect(redirect?.entity_id).toBe(id);
    await expect(checkSlug(env.DB, "project", oldSlug)).resolves.toMatchObject({
      available: true,
      conflict: { kind: "redirect", id },
    });
    await expect(checkSlug(env.DB, "project", newSlug)).resolves.toMatchObject({
      available: false,
      conflict: { id, kind: "working" },
    });
    await expect(checkSlug(env.DB, "project", newSlug, id)).resolves.toEqual({
      available: true,
    });

    // A live URL beats a redirect: another project may take the old slug.
    const other = await completeProject(oldSlug.replace("old", "tmp"));
    await saveEntity(
      env.DB,
      "project",
      other.id,
      1,
      { ...other.content, slug: oldSlug },
      later,
    );
    const taken = await publishEntity(env.DB, "project", other.id, 2, later);
    expect(taken.ok).toBe(true);
    const gone = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM slug_redirects WHERE entity_type = 'project' AND from_slug = ?",
    )
      .bind(oldSlug)
      .first<{ n: number }>();
    expect(gone?.n).toBe(0);
  });

  it("never publishes TODO_CONTENT rows", async () => {
    const outcome = await publishEntity(
      env.DB,
      "project",
      "seed-p-001",
      0,
      now,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues[0]?.code).toBe("todo_content");
    }
  });

  it("refuses public text with a personal-name variant", async () => {
    const { id, content } = await completeProject();
    await saveEntity(
      env.DB,
      "project",
      id,
      1,
      {
        ...content,
        credits: [{ role: text("混音", "Mix"), name: "Kevin Yang" }],
      },
      now,
    );
    const outcome = await publishEntity(env.DB, "project", id, 2, now);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContainEqual(
        expect.objectContaining({
          code: "brand_name",
          field: "credits.0.name",
        }),
      );
    }
  });

  it("rejects a publish with a stale revision", async () => {
    const { id } = await completeProject();
    await expect(
      publishEntity(env.DB, "project", id, 0, now),
    ).rejects.toMatchObject({ code: "stale_revision" });
  });
});

describe("status changes", () => {
  it("unpublishes, archives, restores and duplicates", async () => {
    const { id, content } = await completeProject();
    await publishEntity(env.DB, "project", id, 1, now);
    await setFeatured(env.DB, "project", id, true);

    const unpublished = await unpublishEntity(env.DB, "project", id, later);
    expect(unpublished.status).toBe("draft");
    expect((await getEntity(env.DB, "project", id))?.published).toEqual(
      content,
    );
    expect((await usages(id)).map((row) => row.scope)).toEqual(["working"]);

    const archived = await archiveEntity(env.DB, "project", id, later);
    expect(archived).toMatchObject({
      status: "archived",
      featured: false,
      featuredOrder: null,
    });
    const restored = await restoreEntity(env.DB, "project", id, later);
    expect(restored.status).toBe("draft");

    const copy = await duplicateEntity(env.DB, "project", id, later);
    expect(copy.slug).toBe(`${content.slug}-copy`);
    expect(copy.status).toBe("draft");
    expect(copy.featured).toBe(false);
    expect(
      (await getEntity(env.DB, "project", copy.id))?.content.title,
    ).toEqual(content.title);
  });

  it("deletes only drafts or archived rows after typed confirmation", async () => {
    const { id, content } = await completeProject();
    await publishEntity(env.DB, "project", id, 1, now);
    await expect(
      deleteEntity(env.DB, "project", id, content.slug),
    ).rejects.toMatchObject({ code: "published_entity_delete_forbidden" });

    await archiveEntity(env.DB, "project", id, later);
    await expect(
      deleteEntity(env.DB, "project", id, "wrong"),
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    await deleteEntity(env.DB, "project", id, content.slug);
    expect(await getEntity(env.DB, "project", id)).toBeNull();
    expect(await usages(id)).toEqual([]);
  });

  it("protects commission services and keeps their price out of the row", async () => {
    await expect(
      archiveEntity(env.DB, "service", "svc-full_mix", now),
    ).rejects.toMatchObject({ code: "commission_service_archive_forbidden" });
    const loaded = await getEntity(env.DB, "service", "svc-full_mix");
    expect(loaded?.meta.commissionServiceId).toBe("full_mix");
    const content = loaded?.content;
    if (!content) throw new Error("missing");
    await saveEntity(
      env.DB,
      "service",
      "svc-full_mix",
      loaded.meta.revision,
      { ...content, priceMode: "fixed", priceAmount: 1, currency: "TWD" },
      now,
    );
    const row = await env.DB.prepare(
      "SELECT price_mode, price_amount, currency FROM services WHERE id = 'svc-full_mix'",
    ).first();
    expect(row).toEqual({
      price_mode: "starting_from",
      price_amount: null,
      currency: null,
    });
  });
});

describe("placement", () => {
  it("features in order and reorders with one statement", async () => {
    const a = await createEntity(env.DB, "recognition", {
      event: text("甲", "A"),
    });
    const b = await createEntity(env.DB, "recognition", {
      event: text("乙", "B"),
    });
    await setFeatured(env.DB, "recognition", a.id, true);
    await setFeatured(env.DB, "recognition", b.id, true);
    const orderOf = async (id: string) =>
      (await getEntity(env.DB, "recognition", id))?.meta;
    expect((await orderOf(b.id))?.featuredOrder).toBeGreaterThan(
      (await orderOf(a.id))?.featuredOrder ?? 0,
    );
    await reorder(env.DB, "recognition", [b.id, a.id], "featured_order");
    expect((await orderOf(b.id))?.featuredOrder).toBe(0);
    expect((await orderOf(a.id))?.featuredOrder).toBe(10);
    await reorder(env.DB, "recognition", [a.id, b.id], "sort_order");
    expect((await orderOf(a.id))?.sortOrder).toBe(0);
    expect((await orderOf(b.id))?.sortOrder).toBe(10);
    await setFeatured(env.DB, "recognition", a.id, false);
    expect(await orderOf(a.id)).toMatchObject({
      featured: false,
      featuredOrder: null,
    });
  });

  it("keeps exactly one showreel", async () => {
    const one = await createEntity(env.DB, "music", { title: text("一") });
    const two = await createEntity(env.DB, "music", { title: text("二") });
    await setShowreel(env.DB, one.id);
    await setShowreel(env.DB, two.id);
    const flagged = await env.DB.prepare(
      "SELECT id FROM music_tracks WHERE is_showreel = 1",
    ).all<{ id: string }>();
    expect(flagged.results).toEqual([{ id: two.id }]);
    await archiveEntity(env.DB, "music", two.id, now);
    expect((await getEntity(env.DB, "music", two.id))?.meta.isShowreel).toBe(
      false,
    );
    await setShowreel(env.DB, null);
  });
});

describe("lookups", () => {
  it("lists options, working snapshots and rebuilds the usage index", async () => {
    const { id, content } = await completeProject();
    const options = await listEntityOptions(env.DB, "project", {
      q: "訊號花園",
    });
    expect(options).toContainEqual({
      id,
      label: "訊號花園",
      status: "draft",
    });
    expect(await getWorkingSnapshot(env.DB, "project", id)).toEqual(content);
    const result = await rebuildAllUsages(env.DB);
    expect(result.usages).toBeGreaterThan(0);
    expect(await usages(id)).toEqual([
      expect.objectContaining({ field: "coverImageId", scope: "working" }),
    ]);
  });

  it("returns null for unknown ids", async () => {
    expect(await getEntity(env.DB, "writing", uniqueId("nope"))).toBeNull();
    await expect(
      saveEntity(
        env.DB,
        "project",
        uniqueId("nope"),
        0,
        ProjectDraftSchema.parse({}),
        now,
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
