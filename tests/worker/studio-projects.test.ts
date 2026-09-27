import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createEntity,
  getEntity,
  saveEntity,
} from "../../app/lib/cms/db/lifecycle.server";
import { resolveRedirect } from "../../app/lib/cms/db/redirects.server";
import {
  getProjectFacets,
  handleProjectCreate,
  handleProjectEditorAction,
  handleProjectsListAction,
  listFeaturedProjects,
  listStudioProjects,
  loadProjectEditor,
  loadProjectNew,
  loadProjectsList,
} from "../../app/lib/cms/repositories/projects.server";
import { ProjectDraftSchema } from "../../app/lib/cms/schemas/project";
import type { ValidationIssue } from "../../app/lib/cms/types";
import { insertExternalAsset, uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const later = new Date("2026-09-24T11:00:00Z");
const SOFTWARE = "term-project_category-software";
const AI = "term-project_category-ai";
const MUSIC = "term-project_category-music";
const testEnv = createTestEnv();

type Result = {
  data: Record<string, unknown> & { ok: boolean };
  init: { status?: number } | null;
};

function result(value: unknown): Result {
  return value as Result;
}

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(name, item);
    }
  }
  return data;
}

/** The editor form as the browser posts it (every group present). */
function editorForm(
  revision: number,
  fields: Record<string, string | string[]> = {},
  intent = "save",
): FormData {
  return form({
    csrfToken: "ignored",
    intent,
    expectedRevision: String(revision),
    "gallery:json": "[]",
    "links:json": "[]",
    "credits:json": "[]",
    "categoryIds:json": "[]",
    "tools:json": "[]",
    "technologies:json": "[]",
    "listed:bool": ["false", "true"],
    ...fields,
  });
}

async function editor(
  id: string,
  intent: string,
  formData: FormData | null,
  at = now,
) {
  return result(
    await handleProjectEditorAction({
      db: env.DB,
      formData,
      intent,
      params: { id },
      now: at,
    }),
  );
}

async function listAction(intent: string, fields: Record<string, string>) {
  return result(
    await handleProjectsListAction({
      db: env.DB,
      formData: form({ intent, ...fields }),
      intent,
      now,
    }),
  );
}

async function makeProject(input: {
  title?: { zh: string; en: string };
  year?: number | null;
  primaryCategoryId?: string | null;
  categoryIds?: string[];
  tools?: string[];
  featured?: boolean;
}) {
  const meta = await createEntity(
    env.DB,
    "project",
    { title: input.title ?? { zh: "專案", en: "Project" } },
    { now },
  );
  const current = await getEntity(env.DB, "project", meta.id);
  const content = ProjectDraftSchema.parse({
    ...current?.content,
    year: input.year ?? null,
    primaryCategoryId: input.primaryCategoryId ?? null,
    categoryIds: input.categoryIds ?? [],
    tools: input.tools ?? [],
  });
  const saved = await saveEntity(env.DB, "project", meta.id, 0, content, now);
  if (input.featured) {
    await listAction("feature", { id: meta.id });
  }
  return saved;
}

function codes(issues: unknown): string[] {
  return ((issues as ValidationIssue[]) ?? []).map(
    (issue) =>
      `${issue.field}:${issue.code}${issue.locale ? `:${issue.locale}` : ""}`,
  );
}

describe("list queries", () => {
  it("searches titles and metadata in both locales", async () => {
    const token = uniqueId("srch");
    const zhOnly = await makeProject({
      title: { zh: `訊號${token}`, en: "Unrelated" },
    });
    const enOnly = await makeProject({
      title: { zh: "無關", en: `Garden ${token}` },
    });
    const byTool = await makeProject({
      title: { zh: "工具", en: "Tool" },
      tools: [`Max ${token}`],
    });
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

    expect(
      ids(await listStudioProjects(env.DB, { q: `訊號${token}` })),
    ).toEqual([zhOnly.id]);
    expect(
      ids(await listStudioProjects(env.DB, { q: `garden ${token}` })),
    ).toEqual([enOnly.id]);
    expect(ids(await listStudioProjects(env.DB, { q: token }))).toEqual(
      [zhOnly.id, enOnly.id, byTool.id].sort(),
    );
  });

  it("filters by status, category (any of its categories), year and featured", async () => {
    const token = uniqueId("filt");
    const a = await makeProject({
      title: { zh: `甲 ${token}`, en: `Alpha ${token}` },
      year: 2024,
      primaryCategoryId: SOFTWARE,
      categoryIds: [SOFTWARE, AI],
      featured: true,
    });
    const b = await makeProject({
      title: { zh: `乙 ${token}`, en: `Beta ${token}` },
      year: 2026,
      primaryCategoryId: MUSIC,
    });
    await editor(b.id, "archive", null);
    const ids = async (filters: Record<string, unknown>) =>
      (await listStudioProjects(env.DB, { q: token, ...filters }))
        .map((row) => row.id)
        .sort();

    expect(await ids({ status: "active" })).toEqual([a.id]);
    expect(await ids({ status: "archived" })).toEqual([b.id]);
    expect(await ids({ status: "all" })).toEqual([a.id, b.id].sort());
    expect(await ids({ status: "all", categoryId: AI })).toEqual([a.id]);
    expect(await ids({ status: "all", categoryId: MUSIC })).toEqual([b.id]);
    expect(await ids({ status: "all", year: 2026 })).toEqual([b.id]);
    expect(await ids({ status: "all", featured: true })).toEqual([a.id]);
    expect(await ids({ status: "all", featured: false })).toEqual([b.id]);

    const [row] = await listStudioProjects(env.DB, { q: `Alpha ${token}` });
    expect(row).toMatchObject({
      id: a.id,
      label: `甲 ${token}`,
      secondary: `Alpha ${token}`,
      status: "draft",
      featured: true,
      year: 2024,
      primaryCategoryId: SOFTWARE,
      categoryIds: [SOFTWARE, AI],
    });
  });

  it("sorts by manual order, last update or year", async () => {
    const token = uniqueId("sort");
    const older = await makeProject({
      title: { zh: token, en: `${token} older` },
      year: 2030,
    });
    const newer = await makeProject({
      title: { zh: token, en: `${token} newer` },
      year: 2020,
    });
    // New projects go to the top of the manual order.
    const manual = await listStudioProjects(env.DB, { q: token });
    expect(manual.map((row) => row.id)).toEqual([newer.id, older.id]);
    const current = await getEntity(env.DB, "project", older.id);
    if (!current) throw new Error("missing");
    await saveEntity(
      env.DB,
      "project",
      older.id,
      current.meta.revision,
      current.content,
      later,
    );
    const updated = await listStudioProjects(env.DB, {
      q: token,
      sort: "updated",
    });
    expect(updated.map((row) => row.id)).toEqual([older.id, newer.id]);
    const byYear = await listStudioProjects(env.DB, { q: token, sort: "year" });
    expect(byYear.map((row) => row.year)).toEqual([2030, 2020]);
  });

  it("offers year and category facets", async () => {
    await makeProject({ year: 2019 });
    const facets = await getProjectFacets(env.DB);
    expect(facets.years).toContain(2019);
    expect(facets.years).toEqual([...facets.years].sort((a, b) => b - a));
    expect(facets.categories.map((term) => term.slug)).toEqual(
      expect.arrayContaining(["software", "ai", "music", "research"]),
    );
  });

  it("loads the list page from URL filters", async () => {
    const token = uniqueId("page");
    await makeProject({ title: { zh: token, en: token } });
    const data = await loadProjectsList({
      db: env.DB,
      request: new Request(
        `https://kamelkyp.com/studio/projects?q=${token}&sort=updated`,
      ),
      now,
    });
    expect(data.query).toMatchObject({ q: token, sort: "updated" });
    expect(data.rows).toHaveLength(1);
    expect(data.manualOrder).toBe(false);
    expect(data.featuredLimit).toBeGreaterThanOrEqual(1);
    expect(data.now).toBe(now.toISOString());
  });
});

describe("homepage placement from the list", () => {
  it("features, reorders featured and unfeatures", async () => {
    const token = uniqueId("feat");
    const first = await makeProject({ title: { zh: token, en: `${token} 1` } });
    const second = await makeProject({
      title: { zh: token, en: `${token} 2` },
    });
    expect((await listAction("feature", { id: first.id })).data.ok).toBe(true);
    await listAction("feature", { id: second.id });
    let featured = (await listFeaturedProjects(env.DB)).map((row) => row.id);
    expect(featured.indexOf(first.id)).toBeLessThan(
      featured.indexOf(second.id),
    );

    const order = [
      second.id,
      first.id,
      ...featured.filter((id) => id !== first.id && id !== second.id),
    ];
    const reordered = await listAction("reorder", {
      field: "featured_order",
      ids: JSON.stringify(order),
    });
    expect(reordered.data.ok).toBe(true);
    featured = (await listFeaturedProjects(env.DB)).map((row) => row.id);
    expect(featured.slice(0, 2)).toEqual([second.id, first.id]);

    await listAction("unfeature", { id: second.id });
    featured = (await listFeaturedProjects(env.DB)).map((row) => row.id);
    expect(featured).not.toContain(second.id);
  });

  it("saves the manual project order in one request", async () => {
    const token = uniqueId("ord");
    const a = await makeProject({ title: { zh: token, en: `${token} a` } });
    const b = await makeProject({ title: { zh: token, en: `${token} b` } });
    const before = (await listStudioProjects(env.DB, {})).map((row) => row.id);
    // The newer project sits directly above the older one.
    expect(before.indexOf(b.id)).toBe(before.indexOf(a.id) - 1);
    const swapped = before.map((id) =>
      id === a.id ? b.id : id === b.id ? a.id : id,
    );
    const response = await listAction("reorder", {
      ids: JSON.stringify(swapped),
    });
    expect(response.data.ok).toBe(true);
    const after = await listStudioProjects(env.DB, { q: token });
    expect(after.map((row) => row.id)).toEqual([a.id, b.id]);
  });

  it("refuses malformed reorder payloads", async () => {
    const response = await listAction("reorder", { ids: "not json" });
    expect(response.data.ok).toBe(false);
    expect(response.init?.status).toBe(422);
    const wrongField = await listAction("reorder", {
      ids: "[]",
      field: "created_at",
    });
    expect(wrongField.init?.status).toBe(422);
  });

  it("archives with undo that restores the published state", async () => {
    const id = await publishedProject();
    await listAction("feature", { id });
    const archived = await listAction("archive", { id });
    expect(archived.data).toMatchObject({
      ok: true,
      status: "archived",
      wasPublished: true,
    });
    let loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.meta.featured).toBe(false);

    const undone = await listAction("restore", { id, republish: "1" });
    expect(undone.data).toMatchObject({ ok: true, status: "published" });
    loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.meta.status).toBe("published");
  });

  it("duplicates into a draft copy", async () => {
    const source = await makeProject({
      title: { zh: "原件", en: "Original" },
    });
    const response = await listAction("duplicate", { id: source.id });
    expect(response.data.ok).toBe(true);
    const copyId = response.data.id as string;
    const copy = await getEntity(env.DB, "project", copyId);
    expect(copy?.meta.status).toBe("draft");
    expect(copy?.meta.slug).toBe(`${source.slug}-copy`);
    expect(copy?.content.title.en).toBe("Original");
  });

  it("answers 422 for unknown intents and 404 for unknown ids", async () => {
    expect((await listAction("explode", {})).init?.status).toBe(422);
    expect((await listAction("archive", { id: "nope" })).init?.status).toBe(
      404,
    );
  });
});

describe("new project", () => {
  it("lists categories for the quick create form", async () => {
    const data = await loadProjectNew({ db: env.DB });
    expect(data.categories.length).toBeGreaterThanOrEqual(7);
  });

  it("creates a draft from a title alone and opens the editor", async () => {
    const token = uniqueId("new");
    const response = (await handleProjectCreate({
      db: env.DB,
      formData: form({
        intent: "create",
        "title.zh": "新專案",
        "title.en": `Fresh ${token}`,
        slug: "",
        primaryCategoryId: AI,
      }),
      intent: "create",
      now,
    })) as Response;
    expect(response.status).toBe(303);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/studio\/projects\/[0-9a-f-]{36}$/);
    const id = location.split("/").pop() ?? "";
    const created = await getEntity(env.DB, "project", id);
    expect(created?.meta.status).toBe("draft");
    expect(created?.meta.slug).toBe(`fresh-${token}`.toLowerCase());
    expect(created?.content.primaryCategoryId).toBe(AI);
    expect(created?.content.categoryIds).toEqual([AI]);
  });

  it("refuses an invalid slug without creating anything", async () => {
    const response = result(
      await handleProjectCreate({
        db: env.DB,
        formData: form({
          intent: "create",
          "title.en": "X",
          slug: "Bad Slug!",
        }),
        intent: "create",
        now,
      }),
    );
    expect(response.init?.status).toBe(422);
    expect(codes(response.data.issues)).toContain("slug:slug_invalid");
  });
});

async function publishedProject(slug = uniqueId("live")) {
  const meta = await createEntity(
    env.DB,
    "project",
    { title: { zh: "上線", en: "Live" } },
    { now },
  );
  const saved = await editor(
    meta.id,
    "publish",
    editorForm(
      meta.revision,
      {
        "title.zh": "上線專案",
        "title.en": "Live project",
        slug,
        "year:number": "2026",
        primaryCategoryId: SOFTWARE,
        "shortDescription.zh": "摘要",
        "shortDescription.en": "Summary",
      },
      "publish",
    ),
  );
  expect(saved.data).toMatchObject({ ok: true, published: true });
  return meta.id;
}

describe("editor loader", () => {
  it("returns everything the editor needs", async () => {
    const cover = await insertExternalAsset(env.DB, { alt: "Cover" });
    const meta = await createEntity(
      env.DB,
      "project",
      { title: { zh: "載入", en: "Loader" }, coverImageId: cover },
      { now },
    );
    const data = await loadProjectEditor({
      db: env.DB,
      env: testEnv,
      params: { id: meta.id },
      now,
    });
    expect(data.meta.id).toBe(meta.id);
    expect(data.content.title.en).toBe("Loader");
    expect(data.assets[cover]?.filename).toBe(`${cover}.jpg`);
    expect(data.terms.length).toBeGreaterThanOrEqual(7);
    expect(codes(data.issues)).toContain("year:required");
    expect(data.urls.preview).toBe(`/studio/preview/projects/${meta.id}`);
    expect(data.urls.live).toBeNull();
    expect(data.redirects).toEqual([]);
    expect(data.music).toEqual([]);
    expect(data.changedSections).toEqual([]);
  });

  it("throws 404 for an unknown id", async () => {
    await expect(
      loadProjectEditor({
        db: env.DB,
        env: testEnv,
        params: { id: "missing" },
        now,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("editor actions", () => {
  it("saves a draft with only a title and refuses to publish it", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    const saved = await editor(
      meta.id,
      "save",
      editorForm(0, { "title.zh": "只有標題", "title.en": "Title only" }),
    );
    expect(saved.data).toMatchObject({ ok: true });
    const revision = (saved.data.meta as { revision: number }).revision;
    expect(revision).toBe(1);

    const refused = await editor(
      meta.id,
      "publish",
      editorForm(revision, {
        "title.zh": "只有標題",
        "title.en": "Title only",
      }),
    );
    expect(refused.data).toMatchObject({ ok: true, published: false });
    expect(codes(refused.data.issues)).toEqual(
      expect.arrayContaining([
        "year:required",
        "primaryCategoryId:required",
        "shortDescription:required_locale:zh",
        "shortDescription:required_locale:en",
      ]),
    );
    // Refusing to publish never touched the working copy's revision.
    const loaded = await getEntity(env.DB, "project", meta.id);
    expect(loaded?.meta.status).toBe("draft");
    expect(loaded?.meta.revision).toBe(1);
  });

  it("publishes a complete project, then redirects the old slug after a slug change", async () => {
    const oldSlug = uniqueId("first-slug");
    const id = await publishedProject(oldSlug);
    let loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.meta.publishedSlug).toBe(oldSlug);

    const newSlug = uniqueId("second-slug");
    const republished = await editor(
      id,
      "publish",
      editorForm(loaded?.meta.revision ?? -1, {
        "title.zh": "上線專案",
        "title.en": "Live project",
        slug: newSlug,
        "year:number": "2026",
        primaryCategoryId: SOFTWARE,
        "shortDescription.zh": "摘要",
        "shortDescription.en": "Summary",
      }),
      later,
    );
    expect(republished.data).toMatchObject({ ok: true, published: true });
    loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.meta.publishedSlug).toBe(newSlug);
    expect(await resolveRedirect(env.DB, "project", oldSlug)).toBe(newSlug);

    const data = await loadProjectEditor({
      db: env.DB,
      env: testEnv,
      params: { id },
      now,
    });
    expect(data.redirects.map((row) => row.fromSlug)).toEqual([oldSlug]);
    expect(data.urls.live).toEqual({
      zh: `/zh/works/${newSlug}`,
      en: `/en/works/${newSlug}`,
    });
  });

  it("answers 409 when the entry changed elsewhere", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    await editor(meta.id, "save", editorForm(0, { "title.en": "First tab" }));
    const stale = await editor(
      meta.id,
      "save",
      editorForm(0, { "title.en": "Second tab" }),
    );
    expect(stale.init?.status).toBe(409);
    expect(stale.data).toMatchObject({ ok: false, code: "stale_revision" });
  });

  it("returns structural issues inline and saves nothing", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    const response = await editor(
      meta.id,
      "save",
      editorForm(0, { "title.en": "x".repeat(201) }),
    );
    expect(response.init?.status).toBe(422);
    expect(codes(response.data.issues)).toEqual(["title:too_long:en"]);
    expect((await getEntity(env.DB, "project", meta.id))?.meta.revision).toBe(
      0,
    );
  });

  it("refuses a slug another project uses", async () => {
    const taken = await makeProject({
      title: { zh: "佔用", en: uniqueId("Taken") },
    });
    const meta = await createEntity(env.DB, "project", {}, { now });
    const response = await editor(
      meta.id,
      "save",
      editorForm(0, { slug: taken.slug ?? "" }),
    );
    expect(response.init?.status).toBe(409);
    expect(response.data.code).toBe("slug_taken");
  });

  it("requires the revision field for content intents", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    const response = await editor(
      meta.id,
      "save",
      form({ intent: "save", "title.en": "No revision" }),
    );
    expect(response.init?.status).toBe(422);
  });

  it("does not bump the revision when an action carries an unchanged form", async () => {
    const meta = await createEntity(
      env.DB,
      "project",
      { title: { zh: "不變", en: "Unchanged" } },
      { now },
    );
    const loaded = await getEntity(env.DB, "project", meta.id);
    const archived = await editor(
      meta.id,
      "archive",
      editorForm(0, {
        "title.zh": "不變",
        "title.en": "Unchanged",
        slug: loaded?.meta.slug ?? "",
      }),
    );
    expect(archived.data).toMatchObject({ ok: true, status: "archived" });
    const after = await getEntity(env.DB, "project", meta.id);
    expect(after?.meta.revision).toBe(0);
    expect(after?.meta.status).toBe("archived");

    const restored = await editor(meta.id, "restore", null);
    expect(restored.data).toMatchObject({ ok: true, status: "draft" });
  });

  it("saves edits before unpublishing and reverts to the published copy", async () => {
    const id = await publishedProject();
    let loaded = await getEntity(env.DB, "project", id);
    const edited = await editor(
      id,
      "save",
      editorForm(loaded?.meta.revision ?? -1, {
        "title.zh": "改過",
        "title.en": "Edited after publish",
        slug: loaded?.meta.slug ?? "",
        "year:number": "2026",
        primaryCategoryId: SOFTWARE,
        "shortDescription.zh": "摘要",
        "shortDescription.en": "Summary",
      }),
    );
    expect(
      (edited.data.meta as { hasUnpublishedChanges: boolean })
        .hasUnpublishedChanges,
    ).toBe(true);
    loaded = await getEntity(env.DB, "project", id);
    const reverted = await editor(
      id,
      "revert",
      form({
        intent: "revert",
        expectedRevision: String(loaded?.meta.revision),
      }),
    );
    expect(reverted.data.ok).toBe(true);
    loaded = await getEntity(env.DB, "project", id);
    expect(loaded?.content.title.en).toBe("Live project");
    expect(loaded?.meta.hasUnpublishedChanges).toBe(false);

    const unpublished = await editor(id, "unpublish", null);
    expect(unpublished.data).toMatchObject({ ok: true, status: "draft" });
  });

  it("keeps published projects from permanent deletion (archive first)", async () => {
    const id = await publishedProject();
    const loaded = await getEntity(env.DB, "project", id);
    const refused = await editor(
      id,
      "delete",
      form({ intent: "delete", confirm: loaded?.meta.slug ?? "" }),
    );
    expect(refused.init?.status).toBe(409);
    expect(refused.data.code).toBe("published_entity_delete_forbidden");

    await editor(id, "archive", null);
    const mismatch = await editor(
      id,
      "delete",
      form({ intent: "delete", confirm: "wrong" }),
    );
    expect(mismatch.init?.status).toBe(422);

    const deleted = await editor(
      id,
      "delete",
      form({ intent: "delete", confirm: loaded?.meta.slug ?? "" }),
    );
    expect(deleted.data).toMatchObject({
      ok: true,
      deleted: true,
      redirectTo: "/studio/projects",
    });
    expect(await getEntity(env.DB, "project", id)).toBeNull();
  });

  it("duplicates from the editor and points at the copy", async () => {
    const meta = await createEntity(
      env.DB,
      "project",
      { title: { zh: "副本來源", en: "Copy source" } },
      { now },
    );
    const response = await editor(meta.id, "duplicate", null);
    expect(response.data.ok).toBe(true);
    expect(response.data.redirectTo).toBe(
      `/studio/projects/${response.data.id as string}`,
    );
  });

  it("features and unfeatures without touching the working copy", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    const featured = await editor(
      meta.id,
      "feature",
      form({ intent: "feature" }),
    );
    expect(featured.data).toMatchObject({ ok: true, featured: true });
    let loaded = await getEntity(env.DB, "project", meta.id);
    expect(loaded?.meta.featured).toBe(true);
    expect(loaded?.meta.revision).toBe(0);
    await editor(meta.id, "unfeature", form({ intent: "unfeature" }));
    loaded = await getEntity(env.DB, "project", meta.id);
    expect(loaded?.meta.featured).toBe(false);
  });

  it("clears TODO_CONTENT only when the owner confirms real content", async () => {
    const meta = await createEntity(
      env.DB,
      "project",
      { title: { zh: "示意", en: "Sample" } },
      { todoContent: true, now },
    );
    await editor(
      meta.id,
      "save",
      editorForm(0, { "title.zh": "真的", "title.en": "Real" }),
    );
    expect(
      (await getEntity(env.DB, "project", meta.id))?.meta.todoContent,
    ).toBe(true);
    await editor(
      meta.id,
      "save",
      editorForm(1, {
        "title.zh": "真的",
        "title.en": "Real",
        "clearTodoContent:bool": ["false", "true"],
      }),
    );
    expect(
      (await getEntity(env.DB, "project", meta.id))?.meta.todoContent,
    ).toBe(false);
  });

  it("adds a project category inline", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    const label = uniqueId("Generative");
    const created = await editor(
      meta.id,
      "create-term",
      form({
        intent: "create-term",
        vocabulary: "project_category",
        "label.zh": "生成",
        "label.en": label,
      }),
    );
    expect(created.data.ok).toBe(true);
    const facets = await getProjectFacets(env.DB);
    expect(facets.categories.some((term) => term.label.en === label)).toBe(
      true,
    );

    const wrongList = await editor(
      meta.id,
      "create-term",
      form({
        intent: "create-term",
        vocabulary: "service_group",
        "label.zh": "x",
        "label.en": "x",
      }),
    );
    expect(wrongList.init?.status).toBe(422);
  });

  it("answers 422 for unknown intents and 404 for unknown projects", async () => {
    const meta = await createEntity(env.DB, "project", {}, { now });
    expect((await editor(meta.id, "explode", null)).init?.status).toBe(422);
    expect((await editor("missing", "archive", null)).init?.status).toBe(404);
  });
});
