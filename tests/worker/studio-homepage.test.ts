import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getHomepageModel,
  handleHomepageAction,
} from "../../app/lib/cms/repositories/homepage.server";
import {
  getBrandSettings,
  getSiteSettings,
} from "../../app/lib/cms/settings.server";
import {
  clearPlacement,
  insertExternalAsset,
  insertMusicTrack,
  insertProject,
  publishViaView,
  restoreSettings,
  snapshotSettings,
} from "./studio-p4-fixtures";

const now = new Date("2026-09-25T10:00:00Z");

type Result = {
  data?: Record<string, unknown>;
  init?: { status?: number } | null;
};
const body = (result: unknown) =>
  ((result as Result).data ?? {}) as Record<string, unknown>;
const status = (result: unknown) => (result as Result).init?.status ?? 200;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function act(intent: string, fields: Record<string, string>) {
  return handleHomepageAction({
    db: env.DB,
    formData: form({ intent, ...fields }),
    intent,
    now,
  });
}

let seeded: Awaited<ReturnType<typeof snapshotSettings>>;
beforeAll(async () => {
  seeded = await snapshotSettings(env.DB);
});
beforeEach(async () => {
  await restoreSettings(env.DB, seeded);
  await clearPlacement(env.DB);
});

describe("homepage model", () => {
  it("collects hero, sections, showreel and featured lists", async () => {
    const model = await getHomepageModel(env.DB);
    expect(model.brand.value.brandName).toBe("Kamel");
    expect(model.site.value.homepage.sections.showreel).toBe(true);
    expect(model.showreel.current).toBeNull();
    expect(model.featured.project.items).toEqual([]);
    expect(model.featured.service.candidates.length).toBeGreaterThan(0);
  });

  it("lists featured entries in order and keeps archived rows out", async () => {
    const first = await insertProject(env.DB, { title: "First" });
    const second = await insertProject(env.DB, { title: "Second" });
    const archived = await insertProject(env.DB, { title: "Gone" });
    await env.DB.prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .bind(archived)
      .run();
    await publishViaView(env.DB, "projects", first);

    await act("feature", { type: "project", id: first });
    await act("feature", { type: "project", id: second });
    let model = await getHomepageModel(env.DB);
    expect(model.featured.project.items.map((item) => item.id)).toEqual([
      first,
      second,
    ]);
    expect(model.featured.project.items[0]?.status).toBe("published");
    expect(model.featured.project.items[1]?.status).toBe("draft");
    const candidateIds = model.featured.project.candidates.map(
      (item) => item.id,
    );
    expect(candidateIds).not.toContain(first);
    expect(candidateIds).not.toContain(archived);

    const reordered = await act("reorder-featured", {
      type: "project",
      ids: JSON.stringify([second, first]),
    });
    expect(body(reordered).ok).toBe(true);
    model = await getHomepageModel(env.DB);
    expect(model.featured.project.items.map((item) => item.id)).toEqual([
      second,
      first,
    ]);

    await act("unfeature", { type: "project", id: second });
    model = await getHomepageModel(env.DB);
    expect(model.featured.project.items.map((item) => item.id)).toEqual([
      first,
    ]);
  });

  it("refuses an unknown content type", async () => {
    const result = await act("feature", { type: "page", id: "x" });
    expect(status(result)).toBe(422);
  });
});

describe("showreel", () => {
  it("sets exactly one showreel from tracks with audio and clears it", async () => {
    const audio = await insertExternalAsset(env.DB, {
      kind: "audio",
      url: "https://media.example.com/reel.mp3",
    });
    const reel = await insertMusicTrack(env.DB, { audioPreviewId: audio });
    const silent = await insertMusicTrack(env.DB);

    let model = await getHomepageModel(env.DB);
    const candidates = model.showreel.candidates.map((item) => item.id);
    expect(candidates).toContain(reel);
    expect(candidates).not.toContain(silent);

    const set = await act("set-showreel", { id: reel });
    expect(body(set).ok).toBe(true);
    model = await getHomepageModel(env.DB);
    expect(model.showreel.current?.id).toBe(reel);
    expect(model.showreel.current?.status).toBe("draft");

    await act("clear-showreel", {});
    model = await getHomepageModel(env.DB);
    expect(model.showreel.current).toBeNull();
  });

  it("refuses an archived track", async () => {
    const track = await insertMusicTrack(env.DB);
    await env.DB.prepare(
      "UPDATE music_tracks SET status = 'archived' WHERE id = ?",
    )
      .bind(track)
      .run();
    const result = await act("set-showreel", { id: track });
    expect(status(result)).toBe(409);
  });
});

describe("homepage settings sections", () => {
  it("saves the hero text and CTAs but never the brand name", async () => {
    const brand = await getBrandSettings(env.DB);
    const result = await act("save-hero", {
      expectedRevision: String(brand.revision),
      brandName: "Something else",
      "heroStatement.zh": "新的主張。",
      "heroStatement.en": "A new statement.",
      "roles.0.zh": "製作人",
      "roles.0.en": "Producer",
      "primaryCta.label.zh": "聯絡",
      "primaryCta.label.en": "Get in touch",
      "primaryCta.href": "/commission",
      "secondaryCtaEnabled:bool": "false",
    });
    expect(body(result)).toMatchObject({
      ok: true,
      revision: brand.revision + 1,
    });
    const saved = (await getBrandSettings(env.DB)).value;
    expect(saved.brandName).toBe("Kamel");
    expect(saved.heroStatement.en).toBe("A new statement.");
    expect(saved.roles).toEqual([{ zh: "製作人", en: "Producer" }]);
    expect(saved.primaryCta.label.en).toBe("Get in touch");
    expect(saved.secondaryCta).toBeNull();
    expect(saved.tagline).toEqual(brand.value.tagline);
  });

  it("answers 409 on a stale hero save", async () => {
    const brand = await getBrandSettings(env.DB);
    await act("save-hero", {
      expectedRevision: String(brand.revision),
      "heroStatement.zh": "一",
      "heroStatement.en": "One",
    });
    const stale = await act("save-hero", {
      expectedRevision: String(brand.revision),
      "heroStatement.zh": "二",
      "heroStatement.en": "Two",
    });
    expect(status(stale)).toBe(409);
  });

  it("saves section visibility and counts", async () => {
    const site = await getSiteSettings(env.DB);
    const result = await act("save-sections", {
      expectedRevision: String(site.revision),
      "homepage.sections.recognition:bool": "false",
      "homepage.sections.writing:bool": "true",
      "homepage.featuredProjectCount:number": "6",
      "homepage.writingCount:number": "2",
      "homepage.recognitionCount:number": "0",
      "siteTitle.en": "must be ignored",
    });
    expect(body(result).ok).toBe(true);
    const saved = (await getSiteSettings(env.DB)).value;
    expect(saved.homepage.sections.recognition).toBe(false);
    expect(saved.homepage.featuredProjectCount).toBe(6);
    expect(saved.homepage.recognitionCount).toBe(0);
    expect(saved.siteTitle).toEqual(site.value.siteTitle);
  });

  it("reports invalid counts as field issues", async () => {
    const site = await getSiteSettings(env.DB);
    const result = await act("save-sections", {
      expectedRevision: String(site.revision),
      "homepage.featuredProjectCount:number": "40",
    });
    expect(status(result)).toBe(422);
    expect(body(result).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "homepage.featuredProjectCount" }),
      ]),
    );
  });

  it("saves availability and the contact band", async () => {
    const site = await getSiteSettings(env.DB);
    await act("save-availability", {
      expectedRevision: String(site.revision),
      "availability.status": "limited",
      "availability.message.zh": "十一月起可接案",
      "availability.message.en": "Booking from November",
    });
    const next = await getSiteSettings(env.DB);
    expect(next.value.availability.status).toBe("limited");
    await act("save-contact", {
      expectedRevision: String(next.revision),
      "homepage.contactBandBody.zh": "聊聊你的專案",
      "homepage.contactBandBody.en": "Tell me about your project",
      "contactBand.default.zh": "開始",
      "contactBand.default.en": "Start",
    });
    const saved = (await getSiteSettings(env.DB)).value;
    expect(saved.homepage.contactBandBody.en).toBe(
      "Tell me about your project",
    );
    expect(saved.homepage.featuredProjectCount).toBe(
      site.value.homepage.featuredProjectCount,
    );
    expect(saved.contactBand.default.en).toBe("Start");
    expect(saved.contactBand.project).toEqual(site.value.contactBand.project);
  });
});
