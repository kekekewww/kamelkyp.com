import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { matchBrandTerm } from "../../app/lib/cms/brand-guard.server";
import { loadHome } from "../../app/lib/cms/public/home.server";
import { listProjectMusic } from "../../app/lib/cms/public/music.server";
import {
  getPublicProject,
  listPublicProjects,
} from "../../app/lib/cms/public/projects.server";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import {
  getPublicWriting,
  listPublicWriting,
} from "../../app/lib/cms/public/writing.server";
import cmsFixture from "../fixtures/cms-e2e.sql?raw";
import cmsCleanup from "../fixtures/cms-e2e-cleanup.sql?raw";
import mediaFixture from "../fixtures/media-e2e.sql?raw";
import mediaCleanup from "../fixtures/media-e2e-cleanup.sql?raw";
import { createTestEnv } from "../helpers/test-env";

/**
 * The loopback e2e fixtures (content-architecture §5.5) applied to the
 * worker-pool D1: every published fixture row must parse through the public
 * read functions, so fixture drift fails here without a browser.
 */
const testEnv = createTestEnv({ DB: env.DB });

/** Statements end with `;` at a line end; `--` lines are comments. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function run(sql: string) {
  for (const statement of statements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

async function fixtureRows(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM projects WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM media_assets WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM music_tracks WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM recognitions WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM writings WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM social_links WHERE id GLOB 'e2e-*')
          + (SELECT COUNT(*) FROM slug_redirects WHERE entity_id GLOB 'e2e-*') AS total`,
  ).first<{ total: number }>();
  return row?.total ?? 0;
}

beforeAll(async () => {
  // Twice: the fixtures clean up after an interrupted run before inserting.
  await run(mediaFixture);
  await run(cmsFixture);
  await run(mediaFixture);
  await run(cmsFixture);
});

describe("cms e2e fixture", () => {
  it("publishes six listed projects in public order; media fixtures stay unlisted", async () => {
    const projects = await listPublicProjects(env.DB, testEnv, "en");
    expect(projects.map((project) => project.slug)).toEqual([
      "fixture-signal-map",
      "fixture-booking-console",
      "fixture-listening-room",
      "fixture-single-mix",
      "fixture-vocal-session",
      "fixture-analysis-notes",
    ]);
    const categories = new Set(
      projects.flatMap((project) =>
        project.categories.map((term) => term.slug),
      ),
    );
    for (const slug of [
      "ai",
      "software",
      "interactive",
      "mixing",
      "research",
    ]) {
      expect(categories.has(slug)).toBe(true);
    }
    for (const slug of [
      "media-test",
      "mediafire-test",
      "audio-test",
      "audio-bounds-test",
      "audio-fallback-test",
      "security-media-test",
    ]) {
      const result = await getPublicProject(env.DB, testEnv, "en", slug);
      expect(result.kind, slug).toBe("found");
    }
  });

  it("features three projects in explicit order and never a draft", async () => {
    const home = await loadHome(env.DB, testEnv, "en");
    expect(home.projects.map((project) => project.slug)).toEqual([
      "fixture-signal-map",
      "fixture-booking-console",
      "fixture-listening-room",
    ]);
    expect(home.recognition.map((item) => item.event)).toEqual([
      "Fixture Festival — Best Interactive Work",
      "Fixture Conference Talk",
    ]);
    expect(home.writing.map((item) => item.title)).toEqual([
      "Fixture Notes on Building Tools",
      "Fixture Thread on Mixing",
    ]);
    expect(home.showreel?.url).toBe(
      "https://media.kamelkyp.com/e2e/showreel.wav",
    );
    expect(home.showreel?.kind).toBe("cloudflare_r2_audio");
  });

  it("resolves the renamed slug, hides the draft and renders the full case study", async () => {
    expect(
      await getPublicProject(env.DB, testEnv, "en", "fixture-old-signal-map"),
    ).toEqual({ kind: "redirect", to: "/en/works/fixture-signal-map" });
    expect(
      (await getPublicProject(env.DB, testEnv, "en", "fixture-draft-project"))
        .kind,
    ).toBe("missing");

    const result = await getPublicProject(
      env.DB,
      testEnv,
      "zh",
      "fixture-signal-map",
    );
    if (result.kind !== "found") throw new Error("fixture project missing");
    const { project } = result;
    expect(project.story.map((section) => section.key)).toEqual([
      "context",
      "problem",
      "approach",
      "architecture",
      "result",
      "reflection",
    ]);
    expect(project.cover?.alt).toBe("示範訊號地圖封面");
    expect(project.gallery).toHaveLength(1);
    expect(project.links).toEqual([
      { label: "專案網站", url: "https://example.com/fixture-signal-map" },
    ]);
    expect(project.credits).toEqual([{ role: "開發", name: "Kamel" }]);

    const minimal = await getPublicProject(
      env.DB,
      testEnv,
      "en",
      "fixture-booking-console",
    );
    if (minimal.kind !== "found") throw new Error("fixture project missing");
    expect(minimal.project.story).toEqual([]);
    expect(minimal.project.gallery).toEqual([]);
    expect(minimal.project.links).toEqual([]);
    expect(minimal.project.credits).toEqual([]);
    expect(minimal.project.cover).toBeNull();

    const single = await getPublicProject(
      env.DB,
      testEnv,
      "en",
      "fixture-single-mix",
    );
    if (single.kind !== "found") throw new Error("fixture project missing");
    const music = await listProjectMusic(
      env.DB,
      testEnv,
      "en",
      single.project.id,
    );
    expect(music.map((track) => [track.title, track.media?.kind])).toEqual([
      ["Fixture Single", "cloudflare_r2_audio"],
    ]);
  });

  it("links external writing out and gives internal writing a detail page", async () => {
    const writing = await listPublicWriting(env.DB, testEnv, "en");
    const thread = writing.find((item) => item.platform === "threads");
    expect(thread).toMatchObject({ external: true, hasDetail: false });
    expect(
      (
        await getPublicWriting(
          env.DB,
          testEnv,
          "en",
          "fixture-thread-on-mixing",
        )
      ).kind,
    ).toBe("missing");
    expect(
      (await getPublicWriting(env.DB, testEnv, "en", "fixture-building-notes"))
        .kind,
    ).toBe("found");
    expect(writing.some((item) => item.slug === "fixture-draft-note")).toBe(
      false,
    );
  });

  it("shows only the enabled social link in the footer", async () => {
    const site = await getPublicSiteContext(env.DB, testEnv, "en");
    expect(site.socialLinks.map((link) => link.label)).toEqual(["Instagram"]);
    expect(site.footerGroups.map((group) => group.id)).toContain("find_me");
  });

  it("carries no personal name and no sample prefix", () => {
    for (const sql of [cmsFixture, mediaFixture]) {
      for (const line of sql.split("\n")) {
        expect(matchBrandTerm(line), line).toBeNull();
        expect(line).not.toMatch(/Sample:|示意：/);
      }
    }
  });

  it("cleans up every fixture row", async () => {
    expect(await fixtureRows()).toBeGreaterThan(20);
    await run(cmsCleanup);
    await run(mediaCleanup);
    expect(await fixtureRows()).toBe(0);
    await run(mediaFixture);
    await run(cmsFixture);
  });
});
