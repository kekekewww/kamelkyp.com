import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createEntity,
  publishEntity,
  saveEntity,
  setFeatured,
  setShowreel,
  unpublishEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import {
  getShowreel,
  listProjectMusic,
} from "../../app/lib/cms/public/music.server";
import {
  getPublicProject,
  listCategoryFilters,
  listHomeProjects,
  listPublicProjects,
} from "../../app/lib/cms/public/projects.server";
import { listPublicRecognition } from "../../app/lib/cms/public/recognition.server";
import {
  getAreaStartingPrices,
  getCommissionServiceView,
  listPublicServices,
} from "../../app/lib/cms/public/services.server";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import {
  getPublicWriting,
  listPublicWriting,
} from "../../app/lib/cms/public/writing.server";
import { MusicDraftSchema } from "../../app/lib/cms/schemas/music";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { RecognitionDraftSchema } from "../../app/lib/cms/schemas/recognition";
import { WritingDraftSchema } from "../../app/lib/cms/schemas/writing";
import { insertExternalAsset, uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });
const testEnv = createTestEnv({ DB: env.DB });

async function publishProject(input: {
  title: string;
  category?: string;
  featured?: boolean;
  slug?: string;
  enTitle?: string;
}) {
  const meta = await createEntity(env.DB, "project", {
    title: text(input.title, input.enTitle ?? input.title),
  });
  const content = ProjectDraftSchema.parse({
    slug: input.slug ?? meta.slug,
    year: 2026,
    primaryCategoryId: input.category ?? "term-project_category-software",
    title: text(input.title, input.enTitle ?? input.title),
    shortDescription: text("摘要", input.enTitle === "" ? "" : "Summary"),
  });
  await saveEntity(env.DB, "project", meta.id, 0, content, now);
  const outcome = await publishEntity(env.DB, "project", meta.id, 1, now);
  if (input.featured) await setFeatured(env.DB, "project", meta.id, true);
  return { id: meta.id, outcome, content };
}

describe("site context", () => {
  it("composes brand, site, navigation and the footer from settings", async () => {
    const context = await getPublicSiteContext(env.DB, testEnv, "en");
    expect(context.brand.brandName).toBe("Kamel");
    expect(context.brand.roles).toEqual([
      "Music Producer",
      "Software Developer",
      "Creative Technologist",
    ]);
    expect(context.brand.primaryCta).toEqual({
      label: "Start a project",
      href: "/en/commission",
    });
    expect(context.site.copyright).toBe(`© ${new Date().getFullYear()} Kamel`);
    expect(context.navigation.map((item) => item.key)).toEqual([
      "work",
      "services",
      "about",
      "writing",
    ]);
    expect(context.footerGroups.map((group) => group.label)).toEqual([
      "Navigate",
      "Services",
      "Work & Resources",
      "Contact",
      "Legal",
    ]);
    const links = context.footerGroups.flatMap((group) => group.links);
    expect(links.some((link) => link.url.endsWith("/kamelkyp.com"))).toBe(
      false,
    );
    expect(
      links.some((link) => link.url === "https://github.com/kekekewww"),
    ).toBe(true);
    expect(links).toContainEqual(
      expect.objectContaining({ url: "mailto:kevinyaungputra@gmail.com" }),
    );
    expect(context.mediaConfig.r2Hosts).toContain("media.kamelkyp.com");
  });

  it("adds a Find me group only when social links are enabled", async () => {
    await env.DB.prepare(
      "INSERT INTO social_links (id, platform, label_i18n, url, enabled, sort_order, created_at, updated_at) VALUES ('s-ig', 'instagram', ?, 'https://instagram.com/kamel', 1, 0, ?, ?), ('s-off', 'github', ?, 'https://github.com/x', 0, 1, ?, ?)",
    )
      .bind(
        JSON.stringify(text("IG", "Instagram")),
        now.toISOString(),
        now.toISOString(),
        JSON.stringify(text("GH")),
        now.toISOString(),
        now.toISOString(),
      )
      .run();
    const context = await getPublicSiteContext(env.DB, testEnv, "zh");
    const findMe = context.footerGroups.find((group) => group.id === "find_me");
    expect(findMe?.links).toEqual([
      { id: "s-ig", label: "IG", url: "https://instagram.com/kamel" },
    ]);
    expect(context.socialLinks).toHaveLength(1);
    await env.DB.prepare("DELETE FROM social_links").run();
  });
});

describe("services and prices", () => {
  it("prices commission services from the active price rule", async () => {
    const mixing = await listPublicServices(env.DB, testEnv, "en", {
      area: "mixing",
      now,
    });
    expect(
      mixing.map((service) => [service.commissionServiceId, service.price]),
    ).toEqual([
      ["full_mix", { amount: 8000, currency: "TWD" }],
      ["vocal_mix", { amount: 4000, currency: "TWD" }],
    ]);
    const software = await listPublicServices(env.DB, testEnv, "en", {
      area: "software",
      now,
    });
    expect(software).toHaveLength(7);
    expect(
      software.every((service) => service.priceMode === "custom_quote"),
    ).toBe(true);
    expect(software.every((service) => service.price === null)).toBe(true);
    expect(await getAreaStartingPrices(env.DB, now)).toEqual({
      mixing: 4000,
      song_transition: 1000,
    });
  });

  it("hides an unpublished commission service", async () => {
    const view = await getCommissionServiceView(
      env.DB,
      testEnv,
      "zh",
      "edit_transition",
      now,
    );
    expect(view?.name).toBe("編輯／剪輯歌曲銜接");
    expect(view?.deliverables).toEqual(["24-bit / 48 kHz WAV", "MP3 與 AAC"]);
    await unpublishEntity(env.DB, "service", "svc-edit_transition", now);
    expect(
      await getCommissionServiceView(
        env.DB,
        testEnv,
        "zh",
        "edit_transition",
        now,
      ),
    ).toBeNull();
    expect((await getAreaStartingPrices(env.DB, now)).song_transition).toBe(
      1000,
    );
  });
});

describe("projects", () => {
  it("never lists drafts or TODO_CONTENT samples, but preview does", async () => {
    const before = await listPublicProjects(env.DB, testEnv, "en");
    expect(before.some((card) => card.slug.startsWith("sample-"))).toBe(false);
    const preview = await listPublicProjects(env.DB, testEnv, "en", {
      mode: "preview",
    });
    expect(preview.find((card) => card.id === "seed-p-001")).toMatchObject({
      todoContent: true,
      title: "Sample: Generative Audio-Visual Tool",
    });
  });

  it("lists, details, features and redirects published projects", async () => {
    const one = await publishProject({
      title: "專案一",
      enTitle: "Public One",
      featured: true,
      category: "term-project_category-ai",
    });
    const two = await publishProject({
      title: "專案二",
      enTitle: "Public Two",
      featured: true,
    });
    expect(one.outcome.ok && two.outcome.ok).toBe(true);

    const cards = await listPublicProjects(env.DB, testEnv, "en");
    const card = cards.find((item) => item.id === one.id);
    expect(card).toMatchObject({
      title: "Public One",
      href: `/en/works/${one.content.slug}`,
      primaryCategory: { slug: "ai", label: "AI" },
      cover: null,
    });
    expect(
      (await listPublicProjects(env.DB, testEnv, "en", { category: "ai" })).map(
        (item) => item.id,
      ),
    ).toEqual([one.id]);

    const home = await listHomeProjects(env.DB, testEnv, "en", 1);
    expect(home.map((item) => item.id)).toEqual([one.id]);

    const found = await getPublicProject(
      env.DB,
      testEnv,
      "en",
      one.content.slug,
    );
    expect(found.kind).toBe("found");
    if (found.kind === "found") {
      expect(found.project.title).toBe("Public One");
      expect(found.project.categories.map((category) => category.slug)).toEqual(
        ["ai"],
      );
    }

    const newSlug = uniqueId("renamed");
    await saveEntity(
      env.DB,
      "project",
      one.id,
      1,
      { ...one.content, slug: newSlug },
      now,
    );
    await publishEntity(env.DB, "project", one.id, 2, now);
    expect(
      await getPublicProject(env.DB, testEnv, "zh", one.content.slug),
    ).toEqual({ kind: "redirect", to: `/zh/works/${newSlug}` });
    expect(await getPublicProject(env.DB, testEnv, "zh", "nope")).toEqual({
      kind: "missing",
    });

    const filters = await listCategoryFilters(env.DB, "en", cards);
    expect(filters.find((filter) => filter.slug === "ai")?.count).toBe(1);
    expect(filters.find((filter) => filter.slug === "research")?.count).toBe(0);
  });

  it("excludes a project from a locale where required text is missing", async () => {
    const zhOnly = await publishProject({ title: "只有中文", enTitle: "" });
    expect(zhOnly.outcome.ok).toBe(false);
    await env.DB.prepare(
      "UPDATE projects SET status = 'published', published_slug = slug, published_json = (SELECT snapshot FROM project_snapshots WHERE id = projects.id) WHERE id = ?",
    )
      .bind(zhOnly.id)
      .run();
    const en = await listPublicProjects(env.DB, testEnv, "en");
    expect(en.some((card) => card.id === zhOnly.id)).toBe(false);
    const zh = await listPublicProjects(env.DB, testEnv, "zh");
    expect(zh.some((card) => card.id === zhOnly.id)).toBe(true);
    expect(
      (await getPublicProject(env.DB, testEnv, "en", zhOnly.content.slug)).kind,
    ).toBe("missing");
  });
});

describe("music, recognition and writing", () => {
  it("serves the published showreel and project tracks", async () => {
    expect(await getShowreel(env.DB, testEnv, "en")).toBeNull();
    const audio = await insertExternalAsset(env.DB, {
      kind: "audio",
      url: "https://raw.githubusercontent.com/o/r/main/reel.wav",
    });
    const project = await publishProject({
      title: "有音樂",
      enTitle: "With Music",
    });
    const meta = await createEntity(env.DB, "music", {
      title: text("示範", "Reel"),
    });
    await saveEntity(
      env.DB,
      "music",
      meta.id,
      0,
      MusicDraftSchema.parse({
        title: text("示範", "Reel"),
        artist: text("Kamel"),
        audioPreviewId: audio,
        projectId: project.id,
      }),
      now,
    );
    await setShowreel(env.DB, meta.id);
    expect(await getShowreel(env.DB, testEnv, "en")).toBeNull();
    await publishEntity(env.DB, "music", meta.id, 1, now);
    expect(await getShowreel(env.DB, testEnv, "en")).toMatchObject({
      id: audio,
      kind: "github_raw_audio",
      title: "Reel",
    });
    const tracks = await listProjectMusic(env.DB, testEnv, "en", project.id);
    expect(tracks.map((track) => track.title)).toEqual(["Reel"]);
  });

  it("orders recognition by year and puts featured rows first on home", async () => {
    const ids: string[] = [];
    for (const year of [2023, 2025, 2024]) {
      const meta = await createEntity(env.DB, "recognition", {
        event: text(`活動 ${year}`, `Event ${year}`),
      });
      await saveEntity(
        env.DB,
        "recognition",
        meta.id,
        0,
        RecognitionDraftSchema.parse({
          year,
          typeTermId: "term-recognition_type-award",
          event: text(`活動 ${year}`, `Event ${year}`),
        }),
        now,
      );
      await publishEntity(env.DB, "recognition", meta.id, 1, now);
      ids.push(meta.id);
    }
    const list = await listPublicRecognition(env.DB, testEnv, "en");
    expect(list.map((item) => item.year)).toEqual([2025, 2024, 2023]);
    expect(list[0]?.type).toEqual({ slug: "award", label: "Award" });
    await setFeatured(env.DB, "recognition", ids[0] ?? "", true);
    const home = await listPublicRecognition(env.DB, testEnv, "en", {
      home: true,
      limit: 2,
    });
    expect(home.map((item) => item.year)).toEqual([2023, 2025]);
  });

  it("links external-only writing out and has no detail page for it", async () => {
    const meta = await createEntity(env.DB, "writing", {
      title: text("外部", "External"),
    });
    await saveEntity(
      env.DB,
      "writing",
      meta.id,
      0,
      WritingDraftSchema.parse({
        slug: meta.slug,
        date: "2026-09-01",
        platform: "medium",
        externalUrl: "https://medium.com/@kamel/external",
        title: text("外部", "External"),
      }),
      now,
    );
    const outcome = await publishEntity(env.DB, "writing", meta.id, 1, now);
    expect(outcome.ok).toBe(true);
    const list = await listPublicWriting(env.DB, testEnv, "en");
    expect(list.find((item) => item.id === meta.id)).toMatchObject({
      hasDetail: false,
      href: "https://medium.com/@kamel/external",
      platform: "medium",
    });
    expect(
      (await getPublicWriting(env.DB, testEnv, "en", meta.slug ?? "")).kind,
    ).toBe("missing");
  });
});
