/**
 * WP4 SEO on D1 (§6.2): sitemap entries from the published snapshots, the
 * detail `indexing` facts that feed hreflang and noindex, and the robots.txt
 * and sitemap.xml resource routes. Rows persist within the file, so every
 * assertion checks membership with per-test unique slugs.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import {
  archiveEntity,
  createEntity,
  publishEntity,
  saveEntity,
  unpublishEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import { getPublicProject } from "../../app/lib/cms/public/projects.server";
import { listSitemapEntries } from "../../app/lib/cms/public/sitemap.server";
import { getPublicWriting } from "../../app/lib/cms/public/writing.server";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { WritingDraftSchema } from "../../app/lib/cms/schemas/writing";
import type { Env } from "../../app/lib/env.server";
import { SITEMAP_STATIC_PATHS } from "../../app/lib/seo/sitemap";
import { loader as robotsLoader } from "../../app/routes/robots";
import { loader as sitemapLoader } from "../../app/routes/sitemap";
import { uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-10-01T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });
const testEnv = createTestEnv({ DB: env.DB });

async function draftProject(
  slug: string,
  options: { en?: boolean; listed?: boolean } = {},
) {
  const en = options.en ?? true;
  const title = text(`搜尋 ${slug}`, en ? `Search ${slug}` : "");
  const meta = await createEntity(env.DB, "project", { title });
  const content = ProjectDraftSchema.parse({
    slug,
    listed: options.listed ?? true,
    year: 2026,
    primaryCategoryId: "term-project_category-software",
    title,
    shortDescription: text("摘要", en ? "Summary" : ""),
  });
  await saveEntity(env.DB, "project", meta.id, 0, content, now);
  return { id: meta.id, content };
}

async function publishedProject(
  slug: string,
  options: { listed?: boolean } = {},
) {
  const project = await draftProject(slug, options);
  const outcome = await publishEntity(env.DB, "project", project.id, 1, now);
  expect(outcome.ok).toBe(true);
  return project;
}

async function draftWriting(
  slug: string,
  title: { zh: string; en: string },
  overrides: Record<string, unknown> = {},
) {
  const meta = await createEntity(env.DB, "writing", { title });
  const content = WritingDraftSchema.parse({
    slug,
    date: "2026-09-30",
    platform: "internal",
    content: {
      zh: [{ type: "paragraph", text: "內文。" }],
      en: [{ type: "paragraph", text: "Body." }],
    },
    ...overrides,
    title,
  });
  await saveEntity(env.DB, "writing", meta.id, 0, content, now);
  return { id: meta.id, content };
}

/** Publish rows the engine refuses (one locale) through the snapshot view. */
async function forcePublish(
  table: "projects" | "writings",
  id: string,
  publishedAt: string,
) {
  const view = table === "projects" ? "project_snapshots" : "writing_snapshots";
  await env.DB.prepare(
    `UPDATE ${table} SET status = 'published', published_slug = slug, published_at = ?,
       published_json = (SELECT snapshot FROM ${view} WHERE id = ${table}.id)
     WHERE id = ?`,
  )
    .bind(publishedAt, id)
    .run();
}

async function entries() {
  return listSitemapEntries(env.DB);
}

function entryFor(list: Awaited<ReturnType<typeof entries>>, path: string) {
  return list.find((entry) => entry.path === path);
}

function contextFor(overrides: Partial<Env> = {}) {
  return createCloudflareContextProvider(
    createTestEnv({ DB: env.DB, ...overrides }),
    {} as ExecutionContext,
    { nonce: "n", requestId: "r" },
  );
}

describe("listSitemapEntries", () => {
  it("lists every static path and the published commission service pages", async () => {
    const list = await entries();
    for (const path of SITEMAP_STATIC_PATHS) {
      expect(entryFor(list, path), path).toEqual({
        path,
        locales: ["zh", "en"],
        lastModified: null,
      });
    }
    for (const path of [
      "/mixing/full",
      "/mixing/vocal",
      "/song-transition/simple",
      "/song-transition/edit",
    ]) {
      const entry = entryFor(list, path);
      expect(entry?.locales, path).toEqual(["zh", "en"]);
      expect(entry?.lastModified, path).not.toBeNull();
    }
    expect(entryFor(list, "/mixing/full")?.lastModified).toBe(
      "2026-09-24T00:00:00Z",
    );
    expect(list.filter((entry) => entry.path.includes("sample-"))).toEqual([]);
  });

  it("lists published, listed projects in the locales where they render", async () => {
    const both = uniqueId("seo-both");
    const bilingual = await publishedProject(both);
    const zhSlug = uniqueId("seo-zh");
    const zhOnly = await draftProject(zhSlug, { en: false });
    await forcePublish("projects", zhOnly.id, "2026-09-20T00:00:00Z");

    const list = await entries();
    const published = await env.DB.prepare(
      "SELECT published_at FROM projects WHERE id = ?",
    )
      .bind(bilingual.id)
      .first<{ published_at: string }>();
    expect(entryFor(list, `/works/${both}`)).toEqual({
      path: `/works/${both}`,
      locales: ["zh", "en"],
      lastModified: published?.published_at,
    });
    expect(entryFor(list, `/works/${zhSlug}`)).toEqual({
      path: `/works/${zhSlug}`,
      locales: ["zh"],
      lastModified: "2026-09-20T00:00:00Z",
    });
  });

  it("leaves out unlisted, draft, archived and unpublished projects", async () => {
    const unlisted = uniqueId("seo-unlisted");
    await publishedProject(unlisted, { listed: false });
    const draft = uniqueId("seo-draft");
    await draftProject(draft);
    const archived = uniqueId("seo-archived");
    const toArchive = await publishedProject(archived);
    await archiveEntity(env.DB, "project", toArchive.id, now);
    const unpublished = uniqueId("seo-unpublished");
    const toUnpublish = await publishedProject(unpublished);
    await unpublishEntity(env.DB, "project", toUnpublish.id, now);

    const paths = (await entries()).map((entry) => entry.path);
    for (const slug of [unlisted, draft, archived, unpublished]) {
      expect(paths, slug).not.toContain(`/works/${slug}`);
    }
  });

  it("reads listed from the published snapshot, not the working copy", async () => {
    const slug = uniqueId("seo-snapshot");
    const project = await publishedProject(slug);
    await saveEntity(
      env.DB,
      "project",
      project.id,
      1,
      { ...project.content, listed: false },
      now,
    );
    expect(entryFor(await entries(), `/works/${slug}`)).toBeDefined();

    const outcome = await publishEntity(env.DB, "project", project.id, 2, now);
    expect(outcome.ok).toBe(true);
    expect(entryFor(await entries(), `/works/${slug}`)).toBeUndefined();
  });

  it("lists internal writing where it has a detail page, never link-outs", async () => {
    const both = uniqueId("seo-article");
    const article = await draftWriting(both, text("文章", "Article"));
    expect(
      (await publishEntity(env.DB, "writing", article.id, 1, now)).ok,
    ).toBe(true);

    const enSlug = uniqueId("seo-en-article");
    const enOnly = await draftWriting(enSlug, text("", "English only"), {
      content: { zh: [], en: [{ type: "paragraph", text: "Body." }] },
    });
    await forcePublish("writings", enOnly.id, "2026-09-21T00:00:00Z");

    const externalSlug = uniqueId("seo-external");
    const external = await draftWriting(
      externalSlug,
      text("外部", "External"),
      {
        platform: "threads",
        externalUrl: "https://www.threads.net/@kamel.fixture/post/seo",
        content: { zh: [], en: [] },
      },
    );
    expect(
      (await publishEntity(env.DB, "writing", external.id, 1, now)).ok,
    ).toBe(true);

    const unlistedSlug = uniqueId("seo-unlisted-article");
    const unlisted = await draftWriting(unlistedSlug, text("隱藏", "Hidden"), {
      listed: false,
    });
    expect(
      (await publishEntity(env.DB, "writing", unlisted.id, 1, now)).ok,
    ).toBe(true);

    const list = await entries();
    expect(entryFor(list, `/writing/${both}`)?.locales).toEqual(["zh", "en"]);
    expect(entryFor(list, `/writing/${enSlug}`)).toEqual({
      path: `/writing/${enSlug}`,
      locales: ["en"],
      lastModified: "2026-09-21T00:00:00Z",
    });
    expect(entryFor(list, `/writing/${externalSlug}`)).toBeUndefined();
    expect(entryFor(list, `/writing/${unlistedSlug}`)).toBeUndefined();
  });

  it("drops a commission service page while its row is unpublished", async () => {
    const meta = await unpublishEntity(env.DB, "service", "svc-vocal_mix", now);
    try {
      const paths = (await entries()).map((entry) => entry.path);
      expect(paths).not.toContain("/mixing/vocal");
      expect(paths).toContain("/mixing/full");
    } finally {
      const outcome = await publishEntity(
        env.DB,
        "service",
        "svc-vocal_mix",
        meta.revision,
        now,
      );
      expect(outcome.ok).toBe(true);
    }
    expect((await entries()).map((entry) => entry.path)).toContain(
      "/mixing/vocal",
    );
  });
});

describe("detail indexing facts", () => {
  it("carries listed and the rendered locales on projects", async () => {
    const both = uniqueId("seo-index-both");
    await publishedProject(both);
    const bilingual = await getPublicProject(env.DB, testEnv, "en", both);
    expect(bilingual.kind === "found" && bilingual.project.indexing).toEqual({
      listed: true,
      locales: ["zh", "en"],
    });

    const hidden = uniqueId("seo-index-hidden");
    await publishedProject(hidden, { listed: false });
    const unlisted = await getPublicProject(env.DB, testEnv, "zh", hidden);
    expect(unlisted.kind === "found" && unlisted.project.indexing).toEqual({
      listed: false,
      locales: ["zh", "en"],
    });

    const zhSlug = uniqueId("seo-index-zh");
    const zhOnly = await draftProject(zhSlug, { en: false });
    await forcePublish("projects", zhOnly.id, "2026-09-20T00:00:00Z");
    const zh = await getPublicProject(env.DB, testEnv, "zh", zhSlug);
    expect(zh.kind === "found" && zh.project.indexing).toEqual({
      listed: true,
      locales: ["zh"],
    });
  });

  it("carries listed and the detail locales on writing", async () => {
    const slug = uniqueId("seo-index-article");
    const article = await draftWriting(slug, text("文章", "Article"), {
      listed: false,
    });
    await publishEntity(env.DB, "writing", article.id, 1, now);
    const found = await getPublicWriting(env.DB, testEnv, "en", slug);
    expect(found.kind === "found" && found.writing.indexing).toEqual({
      listed: false,
      locales: ["zh", "en"],
    });

    const enSlug = uniqueId("seo-index-en");
    const enOnly = await draftWriting(enSlug, text("", "English only"), {
      content: { zh: [], en: [{ type: "paragraph", text: "Body." }] },
    });
    await forcePublish("writings", enOnly.id, "2026-09-21T00:00:00Z");
    const en = await getPublicWriting(env.DB, testEnv, "en", enSlug);
    expect(en.kind === "found" && en.writing.indexing).toEqual({
      listed: true,
      locales: ["en"],
    });
  });
});

describe("resource routes", () => {
  it("serves sitemap.xml on the configured origin", async () => {
    const slug = uniqueId("seo-route");
    await publishedProject(slug);
    const response = (await sitemapLoader({
      request: new Request("https://kamelkyp.com/sitemap.xml"),
      context: contextFor(),
      params: {},
    } as never)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.has("cache-control")).toBe(false);
    const body = await response.text();
    expect(body.startsWith("<?xml")).toBe(true);
    expect(body).toContain(`<loc>https://kamelkyp.com/en/works/${slug}</loc>`);

    const preview = "https://kamelkyp-com-pr-7.example.workers.dev";
    const previewBody = await (
      (await sitemapLoader({
        request: new Request(`${preview}/sitemap.xml`),
        context: contextFor({ APP_ORIGIN: preview }),
        params: {},
      } as never)) as Response
    ).text();
    const locs = [...previewBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1] ?? "",
    );
    expect(locs.length).toBeGreaterThan(20);
    expect(locs.every((loc) => loc.startsWith(`${preview}/`))).toBe(true);
  });

  it("answers 503 with Retry-After when D1 fails, never a partial sitemap", async () => {
    const broken = {
      prepare() {
        throw new Error("d1_down");
      },
    } as unknown as D1Database;
    const response = (await sitemapLoader({
      request: new Request("https://kamelkyp.com/sitemap.xml"),
      context: contextFor({ DB: broken }),
      params: {},
    } as never)) as Response;
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).not.toContain("<urlset");
  });

  it("serves robots.txt by deployment and host, without D1", async () => {
    const broken = {
      prepare() {
        throw new Error("d1_must_not_be_read");
      },
    } as unknown as D1Database;
    const robots = async (url: string, overrides: Partial<Env> = {}) =>
      (await robotsLoader({
        request: new Request(url),
        context: contextFor({ DB: broken, ...overrides }),
        params: {},
      } as never)) as Response;

    const production = await robots("https://kamelkyp.com/robots.txt");
    expect(production.status).toBe(200);
    expect(production.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    const text = await production.text();
    expect(text).toContain("Disallow: /studio");
    expect(text).toContain("Sitemap: https://kamelkyp.com/sitemap.xml");

    const blocked = "User-agent: *\nDisallow: /\n";
    expect(
      await (
        await robots("https://kamelkyp-com.x.workers.dev/robots.txt")
      ).text(),
    ).toBe(blocked);
    const preview = "https://kamelkyp-com-pr-7.example.workers.dev";
    expect(
      await (
        await robots(`${preview}/robots.txt`, { APP_ORIGIN: preview })
      ).text(),
    ).toBe(blocked);
  });
});
