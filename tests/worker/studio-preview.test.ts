import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  archiveEntity,
  createEntity,
  publishEntity,
  saveEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import {
  previewLocale,
  previewMusic,
  previewProject,
  previewRecognition,
  previewService,
  previewWriting,
} from "../../app/lib/cms/public/preview.server";
import { getPublicProject } from "../../app/lib/cms/public/projects.server";
import { MusicDraftSchema } from "../../app/lib/cms/schemas/music";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import { WritingDraftSchema } from "../../app/lib/cms/schemas/writing";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });
const testEnv = createTestEnv({ DB: env.DB });

async function project(title: string) {
  const meta = await createEntity(env.DB, "project", { title: text(title) });
  const content = ProjectDraftSchema.parse({
    slug: meta.slug,
    year: 2026,
    primaryCategoryId: "term-project_category-software",
    title: text(title),
    shortDescription: text("摘要", "Summary"),
    story: { context: text("背景", "Context line") },
  });
  await saveEntity(env.DB, "project", meta.id, 0, content, now);
  return { id: meta.id, slug: content.slug, content };
}

describe("preview locale", () => {
  it("defaults to zh and accepts en", () => {
    expect(previewLocale(new Request("https://x/studio/preview/home"))).toBe(
      "zh",
    );
    expect(
      previewLocale(new Request("https://x/studio/preview/home?locale=en")),
    ).toBe("en");
    expect(
      previewLocale(new Request("https://x/studio/preview/home?locale=fr")),
    ).toBe("zh");
  });
});

describe("project preview", () => {
  it("renders a draft that the public site cannot reach", async () => {
    const draft = await project("Preview only draft");
    const publicRead = await getPublicProject(
      env.DB,
      testEnv,
      "en",
      draft.slug,
    );
    expect(publicRead.kind).toBe("missing");

    const preview = await previewProject(env.DB, testEnv, "en", draft.id);
    expect(preview?.project.title).toBe("Preview only draft");
    expect(preview?.project.story.map((section) => section.key)).toEqual([
      "context",
    ]);
  });

  it("shows unpublished changes of a published project (working copy)", async () => {
    const live = await project("Live title");
    await publishEntity(env.DB, "project", live.id, 1, now);
    await saveEntity(
      env.DB,
      "project",
      live.id,
      1,
      { ...live.content, title: text("Edited title") },
      now,
    );
    const publicRead = await getPublicProject(env.DB, testEnv, "en", live.slug);
    expect(publicRead.kind === "found" ? publicRead.project.title : null).toBe(
      "Live title",
    );
    const preview = await previewProject(env.DB, testEnv, "en", live.id);
    expect(preview?.project.title).toBe("Edited title");
  });

  it("previews an unsaved form without writing anything", async () => {
    const draft = await project("Saved title");
    const before = await env.DB.prepare(
      "SELECT revision, title_i18n FROM projects WHERE id = ?",
    )
      .bind(draft.id)
      .first();
    const form = new FormData();
    form.set("csrfToken", "ignored");
    form.set("slug", draft.slug);
    form.set("title.zh", "未存標題");
    form.set("title.en", "Unsaved title");
    form.set("shortDescription.en", "Unsaved summary");
    const preview = await previewProject(env.DB, testEnv, "en", draft.id, form);
    expect(preview?.project.title).toBe("Unsaved title");
    expect(preview?.project.shortDescription).toBe("Unsaved summary");
    const after = await env.DB.prepare(
      "SELECT revision, title_i18n FROM projects WHERE id = ?",
    )
      .bind(draft.id)
      .first();
    expect(after).toEqual(before);
  });

  it("renders missing required text as empty, never from the other locale", async () => {
    const draft = await project("Only zh title");
    const form = new FormData();
    form.set("slug", draft.slug);
    form.set("title.zh", "只有中文");
    const preview = await previewProject(env.DB, testEnv, "en", draft.id, form);
    expect(preview?.project.title).toBe("");
  });

  it("badges seeded samples and refuses archived or unknown rows", async () => {
    const sample = await previewProject(env.DB, testEnv, "en", "seed-p-001");
    expect(sample?.project.todoContent).toBe(true);

    const archived = await project("Archived one");
    await archiveEntity(env.DB, "project", archived.id, now);
    expect(await previewProject(env.DB, testEnv, "en", archived.id)).toBeNull();
    expect(
      await previewProject(env.DB, testEnv, "en", "missing-id"),
    ).toBeNull();
  });
});

describe("other previews", () => {
  it("writing: an internal draft has a detail; an external-only one is a card", async () => {
    const internal = await createEntity(env.DB, "writing", {
      title: text("內部", "Internal note"),
    });
    await saveEntity(
      env.DB,
      "writing",
      internal.id,
      0,
      WritingDraftSchema.parse({
        slug: internal.slug,
        date: "2026-09-01",
        platform: "internal",
        title: text("內部", "Internal note"),
        content: {
          zh: [{ type: "paragraph", text: "內文" }],
          en: [{ type: "paragraph", text: "Body" }],
        },
      }),
      now,
    );
    const detail = await previewWriting(env.DB, testEnv, "en", internal.id);
    expect(detail?.writing?.content).toHaveLength(1);

    const external = await createEntity(env.DB, "writing", {
      title: text("外部", "Thread link"),
    });
    await saveEntity(
      env.DB,
      "writing",
      external.id,
      0,
      WritingDraftSchema.parse({
        slug: external.slug,
        date: "2026-09-02",
        platform: "threads",
        externalUrl: "https://www.threads.net/@kamel/post/1",
        title: text("外部", "Thread link"),
      }),
      now,
    );
    const card = await previewWriting(env.DB, testEnv, "en", external.id);
    expect(card?.writing).toBeNull();
    expect(card?.item.external).toBe(true);
    expect(card?.item.href).toBe("https://www.threads.net/@kamel/post/1");
  });

  it("music, recognition and service previews read working copies", async () => {
    const track = await createEntity(env.DB, "music", {
      title: text("曲目", "Draft track"),
    });
    await saveEntity(
      env.DB,
      "music",
      track.id,
      0,
      MusicDraftSchema.parse({
        title: text("曲目", "Draft track"),
        artist: text("Kamel"),
      }),
      now,
    );
    expect((await previewMusic(env.DB, testEnv, "en", track.id))?.title).toBe(
      "Draft track",
    );

    const recognition = await previewRecognition(
      env.DB,
      testEnv,
      "en",
      "seed-r-001",
    );
    expect(recognition?.todoContent).toBe(true);

    const service = await previewService(
      env.DB,
      testEnv,
      "zh",
      "svc-full_mix",
      { now },
    );
    expect(service?.service.name).toBe("完整歌曲混音");
    expect(service?.service.price).toEqual({ amount: 8000, currency: "TWD" });
  });
});
