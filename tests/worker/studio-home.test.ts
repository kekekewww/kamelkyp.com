import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getStudioHome } from "../../app/lib/cms/repositories/studio-home.server";
import { getBrandSettings } from "../../app/lib/cms/settings.server";
import {
  acknowledgeRedesignCopy,
  confirmContactEmail,
} from "../../app/lib/cms/settings-write.server";
import { getStudioCounts } from "../../app/lib/cms/studio/attention.server";
import {
  clearPlacement,
  insertExternalAsset,
  insertMusicTrack,
  insertProject,
  publishViaView,
  restoreSettings,
  snapshotSettings,
  text,
  uniqueId,
} from "./studio-p4-fixtures";

const now = new Date("2026-09-25T10:00:00Z");

let seeded: Awaited<ReturnType<typeof snapshotSettings>>;
beforeAll(async () => {
  seeded = await snapshotSettings(env.DB);
});
beforeEach(async () => {
  await restoreSettings(env.DB, seeded);
  await clearPlacement(env.DB);
  await env.DB.prepare("DELETE FROM cases").run();
});

function keys(home: Awaited<ReturnType<typeof getStudioHome>>) {
  return home.attention.map((item) => item.key);
}

async function insertCase(status: string) {
  const id = uniqueId("KAM-TEST");
  await env.DB.prepare(
    "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES (?, 'full_mix', 8000, 'TWD', '2026-09-20T00:00:00Z', ?)",
  )
    .bind(id, status)
    .run();
  return id;
}

describe("content counts", () => {
  it("counts every type by status, with seeded samples as TODO", async () => {
    const home = await getStudioHome(env.DB, now);
    const types = home.counts.map((row) => row.type);
    expect(types).toEqual([
      "project",
      "music",
      "recognition",
      "writing",
      "service",
    ]);
    const projects = home.counts[0];
    expect(projects?.todo).toBeGreaterThanOrEqual(6);
    expect(projects?.draft).toBeGreaterThanOrEqual(projects?.todo ?? 0);
    const services = home.counts.find((row) => row.type === "service");
    expect(services?.published).toBeGreaterThan(0);
    expect(services?.href).toBe("/studio/services");
  });

  it("moves a row between columns when it is published", async () => {
    const before = await getStudioHome(env.DB, now);
    const id = await insertProject(env.DB);
    await publishViaView(env.DB, "projects", id);
    const after = await getStudioHome(env.DB, now);
    expect(after.counts[0]?.published).toBe(
      (before.counts[0]?.published ?? 0) + 1,
    );
  });
});

describe("recent changes", () => {
  it("lists the latest edits across content and settings, newest first", async () => {
    const brand = await getBrandSettings(env.DB);
    await confirmContactEmail(env.DB, brand.revision, now);
    const home = await getStudioHome(env.DB, now);
    expect(home.recent.length).toBeLessThanOrEqual(15);
    expect(home.recent[0]).toMatchObject({
      kind: "settings",
      label: "Brand settings",
      href: "/studio/settings/brand",
      updatedAt: now.toISOString(),
    });
  });
});

describe("needs attention", () => {
  it("flags the seeded review items and missing homepage content", async () => {
    const home = await getStudioHome(env.DB, now);
    expect(keys(home)).toEqual(
      expect.arrayContaining([
        "contact-email",
        "redesign-copy",
        "showreel-missing",
        "no-featured-projects",
        "todo:project",
      ]),
    );
    const contact = home.attention.find((item) => item.key === "contact-email");
    expect(contact?.href).toBe("/studio/settings/brand#contact");
    // Highest severity first.
    expect(home.attention[0]?.severity).toBe("high");
  });

  it("drops the brand items once reviewed", async () => {
    const brand = await getBrandSettings(env.DB);
    const confirmed = await confirmContactEmail(env.DB, brand.revision, now);
    await acknowledgeRedesignCopy(env.DB, confirmed.revision, now);
    const home = await getStudioHome(env.DB, now);
    expect(keys(home)).not.toContain("contact-email");
    expect(keys(home)).not.toContain("redesign-copy");
  });

  it("links unpublished changes and one-locale entries to their editors", async () => {
    const changed = await insertProject(env.DB, { title: "Changed" });
    await publishViaView(env.DB, "projects", changed);
    await env.DB.prepare(
      "UPDATE projects SET revision = revision + 1 WHERE id = ?",
    )
      .bind(changed)
      .run();
    const legacy = await insertProject(env.DB, { title: "Legacy" });
    await env.DB.prepare("UPDATE projects SET title_i18n = ? WHERE id = ?")
      .bind(JSON.stringify({ zh: "舊作品", en: "" }), legacy)
      .run();
    await publishViaView(env.DB, "projects", legacy);

    const home = await getStudioHome(env.DB, now);
    const change = home.attention.find(
      (item) => item.key === `changes:project:${changed}`,
    );
    expect(change?.href).toBe(`/studio/projects/${changed}`);
    const locale = home.attention.find(
      (item) => item.key === `locale:project:${legacy}`,
    );
    expect(locale?.title).toContain("EN missing");
  });

  it("warns about a draft showreel and a featured list without live projects", async () => {
    const audio = await insertExternalAsset(env.DB, {
      kind: "audio",
      url: "https://media.example.com/reel.mp3",
    });
    const track = await insertMusicTrack(env.DB, {
      showreel: true,
      audioPreviewId: audio,
    });
    const home = await getStudioHome(env.DB, now);
    const reel = home.attention.find(
      (item) => item.key === "showreel-unpublished",
    );
    expect(reel?.href).toBe(`/studio/music/${track}`);
    expect(keys(home)).not.toContain("showreel-missing");
    expect(home.homepage.showreel?.id).toBe(track);
  });

  it("counts images on live pages without alt text", async () => {
    const image = await insertExternalAsset(env.DB, { alt: "" });
    const project = await insertProject(env.DB, { coverImageId: image });
    await publishViaView(env.DB, "projects", project);
    await env.DB.prepare(
      "INSERT INTO media_usages (asset_id, entity_type, entity_id, field, scope) VALUES (?, 'project', ?, 'coverImageId', 'published')",
    )
      .bind(image, project)
      .run();
    const home = await getStudioHome(env.DB, now);
    const alt = home.attention.find((item) => item.key === "missing-alt");
    expect(alt?.count).toBeGreaterThanOrEqual(1);
    expect(alt?.href).toBe("/studio/media?missingAlt=1");
  });

  it("surfaces commissions waiting for review", async () => {
    await insertCase("pending_review");
    await insertCase("pending_review");
    await insertCase("in_production");
    const home = await getStudioHome(env.DB, now);
    const review = home.attention.find(
      (item) => item.key === "commissions-review",
    );
    expect(review?.count).toBe(2);
    expect(home.commissions).toMatchObject({
      pendingReview: 2,
      awaitingDeposit: 0,
      inProduction: 1,
    });
  });

  it("gives the sidebar the same number as the attention list", async () => {
    const home = await getStudioHome(env.DB, now);
    const counts = await getStudioCounts(env.DB, now);
    expect(counts.attention).toBe(home.attention.length);
  });
});

describe("homepage summary", () => {
  it("shows featured projects in order and the section visibility", async () => {
    const first = await insertProject(env.DB, { title: "Alpha" });
    const second = await insertProject(env.DB, { title: "Beta" });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE projects SET featured = 1, featured_order = 20 WHERE id = ?",
      ).bind(first),
      env.DB.prepare(
        "UPDATE projects SET featured = 1, featured_order = 10, title_i18n = ? WHERE id = ?",
      ).bind(text("貝塔", "Beta"), second),
    ]);
    const home = await getStudioHome(env.DB, now);
    expect(home.homepage.featuredProjects.map((item) => item.id)).toEqual([
      second,
      first,
    ]);
    expect(home.homepage.featuredProjects[0]?.label).toBe("貝塔");
    expect(home.homepage.sections.visible).toContain("showreel");
    expect(home.homepage.featuredCounts).toMatchObject({
      music: 0,
      recognition: 0,
      writing: 0,
      service: 0,
    });
  });
});
