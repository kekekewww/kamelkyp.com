import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createEntity,
  publishEntity,
  saveEntity,
  setFeatured,
} from "../../app/lib/cms/db/lifecycle.server";
import { loadHome } from "../../app/lib/cms/public/home.server";
import { getPublicProject } from "../../app/lib/cms/public/projects.server";
import { getCommissionServiceNames } from "../../app/lib/cms/public/services.server";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { insertExternalAsset } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });
const testEnv = createTestEnv({ DB: env.DB });

async function siteSettings(): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(
    "SELECT data_json FROM settings WHERE key = 'site'",
  ).first<{ data_json: string }>();
  return JSON.parse(row?.data_json ?? "{}");
}

async function writeSiteSettings(value: Record<string, unknown>) {
  await env.DB.prepare("UPDATE settings SET data_json = ? WHERE key = 'site'")
    .bind(JSON.stringify(value))
    .run();
}

let original: Record<string, unknown> = {};

beforeAll(async () => {
  original = await siteSettings();
});

afterEach(async () => {
  await writeSiteSettings(original);
});

async function draftProject(title: string, featured: boolean) {
  const meta = await createEntity(env.DB, "project", {
    title: text(title),
  });
  const content = ProjectDraftSchema.parse({
    slug: meta.slug,
    year: 2026,
    primaryCategoryId: "term-project_category-ai",
    title: text(title),
    shortDescription: text("摘要", "Summary"),
  });
  await saveEntity(env.DB, "project", meta.id, 0, content, now);
  if (featured) await setFeatured(env.DB, "project", meta.id, true);
  return meta.id;
}

describe("home data (public read layer)", () => {
  it("returns empty collections on the seeded database (no samples are public)", async () => {
    const home = await loadHome(env.DB, testEnv, "en", { now });
    expect(home.projects).toEqual([]);
    expect(home.recognition).toEqual([]);
    expect(home.writing).toEqual([]);
    expect(home.showreel).toBeNull();
    // Commission prices come from the active price rules.
    expect(home.startingPrices).toEqual({
      mixing: 4000,
      song_transition: 1000,
    });
  });

  it("skips hidden sections and zero counts without querying them", async () => {
    const settings = structuredClone(original) as {
      homepage: {
        sections: Record<string, boolean>;
        writingCount: number;
      };
    };
    settings.homepage.sections.pricing = false;
    settings.homepage.sections.selectedWork = false;
    settings.homepage.writingCount = 0;
    await writeSiteSettings(settings);

    const featured = await draftProject("Hidden featured", true);
    await publishEntity(env.DB, "project", featured, 1, now);

    const home = await loadHome(env.DB, testEnv, "en", { now });
    expect(home.startingPrices).toBeNull();
    expect(home.projects).toEqual([]);
    expect(home.writing).toEqual([]);
  });

  it("previews drafts only in preview mode", async () => {
    await draftProject("Draft featured", true);
    const published = await loadHome(env.DB, testEnv, "en", { now });
    expect(published.projects.map((item) => item.title)).not.toContain(
      "Draft featured",
    );
    const preview = await loadHome(env.DB, testEnv, "en", {
      now,
      mode: "preview",
    });
    expect(preview.projects.map((item) => item.title)).toContain(
      "Draft featured",
    );
  });
});

describe("project body media", () => {
  it("keeps link-only media blocks (imported external links) as outbound links", async () => {
    const dropbox = await insertExternalAsset(env.DB, {
      kind: "link",
      url: "https://www.dropbox.com/s/example/demo.wav?dl=0",
    });
    const drive = await insertExternalAsset(env.DB, {
      kind: "embed",
      url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view",
    });
    const meta = await createEntity(env.DB, "project", {
      title: text("媒體", "Body media"),
    });
    const content = ProjectDraftSchema.parse({
      slug: meta.slug,
      year: 2026,
      primaryCategoryId: "term-project_category-music",
      title: text("媒體", "Body media"),
      shortDescription: text("摘要", "Summary"),
      body: {
        zh: [],
        en: [
          { type: "media", mediaId: drive },
          { type: "media", mediaId: dropbox },
        ],
      },
    });
    await saveEntity(env.DB, "project", meta.id, 0, content, now);
    const outcome = await publishEntity(env.DB, "project", meta.id, 1, now);
    expect(outcome.ok).toBe(true);

    const result = await getPublicProject(env.DB, testEnv, "en", content.slug);
    const media =
      result.kind === "found"
        ? result.project.bodyMedia.map((item) => [item.id, item.kind])
        : [];
    expect(media).toEqual([
      [drive, "google_drive"],
      [dropbox, "external_link"],
    ]);
  });
});

describe("commission service names", () => {
  it("names the four commission services from their rows", async () => {
    expect(await getCommissionServiceNames(env.DB, "zh")).toEqual({
      full_mix: "完整歌曲混音",
      vocal_mix: "Vocal 混音",
      simple_transition: "單純歌曲銜接",
      edit_transition: "編輯／剪輯歌曲銜接",
    });
    expect((await getCommissionServiceNames(env.DB, "en")).full_mix).toBe(
      "Full Song Mixing",
    );
  });
});
