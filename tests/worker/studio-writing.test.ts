import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEntity, getEntity } from "../../app/lib/cms/db/lifecycle.server";
import { listPublicWriting } from "../../app/lib/cms/public/writing.server";
import {
  getWritingFacets,
  handleWritingCreate,
  handleWritingEditorAction,
  handleWritingListAction,
  listStudioWriting,
  loadWritingEditor,
  loadWritingList,
} from "../../app/lib/cms/repositories/writing.server";
import { createTerm } from "../../app/lib/cms/taxonomy.server";
import type { ValidationIssue } from "../../app/lib/cms/types";
import { insertExternalAsset, uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const text = (zh: string, en = zh) => ({ zh, en });

type Unwrapped = {
  status: number;
  body: Record<string, unknown>;
  location?: string | null;
};

function unwrap(result: unknown): Unwrapped {
  if (result instanceof Response) {
    return {
      status: result.status,
      body: {},
      location: result.headers.get("Location"),
    };
  }
  const value = result as {
    data?: Record<string, unknown>;
    init?: ResponseInit | null;
  };
  return { status: value.init?.status ?? 200, body: value.data ?? {} };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

async function editorAct(id: string, fields: Record<string, string>) {
  return unwrap(
    await handleWritingEditorAction({
      db: env.DB,
      formData: form(fields),
      intent: fields.intent ?? null,
      params: { id },
      now,
    }),
  );
}

async function listAct(fields: Record<string, string>) {
  return unwrap(
    await handleWritingListAction({
      db: env.DB,
      formData: form(fields),
      intent: fields.intent ?? null,
      params: {},
      now,
    }),
  );
}

async function writing(title: string, extra: Record<string, unknown> = {}) {
  const meta = await createEntity(
    env.DB,
    "writing",
    { title: text(`${title} 中文`, title), ...extra },
    { now },
  );
  return meta;
}

const paragraph = (value: string) =>
  JSON.stringify([{ type: "paragraph", text: value }]);

/** Every editor field, as the form posts them. */
function fullForm(
  revision: number,
  slug: string,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    expectedRevision: String(revision),
    "title.zh": "為什麼我做工具",
    "title.en": "Why I build tools",
    slug,
    date: "2026-09-01",
    platform: "internal",
    platformLabel: "",
    categoryTermId: "",
    "excerpt.zh": "摘要",
    "excerpt.en": "Summary",
    "content.zh:json": paragraph("內文"),
    "content.en:json": paragraph("Body"),
    externalUrl: "",
    coverImageId: "",
    socialImageId: "",
    "listed:bool": "true",
    "seo.title.zh": "",
    "seo.title.en": "",
    "seo.description.zh": "",
    "seo.description.en": "",
    "clearTodoContent:bool": "false",
    ...overrides,
  };
}

function blocking(issues: ValidationIssue[]): string[] {
  return issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.field}${issue.locale ? `.${issue.locale}` : ""}`)
    .sort();
}

describe("writing publish rule", () => {
  it("needs content in both locales for an internal article", async () => {
    const meta = await writing("Internal");
    const empty = await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", {
        intent: "publish",
        "content.zh:json": "[]",
        "content.en:json": "[]",
      }),
    );
    expect(empty.body.published).toBe(false);
    expect(blocking(empty.body.issues as ValidationIssue[])).toEqual([
      "content.en",
      "content.zh",
    ]);

    const zhOnly = await editorAct(
      meta.id,
      fullForm(1, meta.slug ?? "", {
        intent: "publish",
        "content.en:json": "[]",
      }),
    );
    expect(blocking(zhOnly.body.issues as ValidationIssue[])).toEqual([
      "content.en",
    ]);

    const complete = await editorAct(
      meta.id,
      fullForm(2, meta.slug ?? "", { intent: "publish" }),
    );
    expect(complete.body.published).toBe(true);
  });

  it("needs an https link, not content, for an external post", async () => {
    const meta = await writing("Threads note");
    const base = {
      intent: "publish",
      platform: "threads",
      "content.zh:json": "[]",
      "content.en:json": "[]",
    };
    // Without a link the entry would need internal content instead.
    const missing = await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", base),
    );
    expect(blocking(missing.body.issues as ValidationIssue[])).toEqual([
      "content.en",
      "content.zh",
      "externalUrl",
    ]);

    const insecure = await editorAct(
      meta.id,
      fullForm(1, meta.slug ?? "", {
        ...base,
        externalUrl: "http://www.threads.net/@kamel/post/1",
      }),
    );
    expect(
      (insecure.body.issues as ValidationIssue[]).map((issue) => issue.code),
    ).toContain("invalid_url");

    const linked = await editorAct(
      meta.id,
      fullForm(2, meta.slug ?? "", {
        ...base,
        externalUrl: "https://www.threads.net/@kamel/post/1",
      }),
    );
    expect(linked.body.published).toBe(true);
  });

  it("asks for the platform name when the platform is Other", async () => {
    const meta = await writing("Other platform");
    const result = await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", {
        intent: "publish",
        platform: "other",
        externalUrl: "https://example.com/post",
      }),
    );
    expect(blocking(result.body.issues as ValidationIssue[])).toEqual([
      "platformLabel",
    ]);
    const named = await editorAct(
      meta.id,
      fullForm(1, meta.slug ?? "", {
        intent: "publish",
        platform: "other",
        platformLabel: "Substack",
        externalUrl: "https://example.com/post",
      }),
    );
    expect(named.body.published).toBe(true);
  });

  it("requires title and date; a draft saves without them", async () => {
    const meta = await writing("Untitled soon");
    const saved = await editorAct(meta.id, {
      intent: "save",
      expectedRevision: "0",
      "title.zh": "",
      "title.en": "",
      slug: meta.slug ?? "",
      platform: "internal",
    });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toBe(true);
    const publish = await editorAct(meta.id, {
      intent: "publish",
      expectedRevision: "1",
      "title.zh": "",
      "title.en": "",
      slug: meta.slug ?? "",
      platform: "internal",
    });
    expect(blocking(publish.body.issues as ValidationIssue[])).toEqual([
      "content.en",
      "content.zh",
      "date",
      "title.en",
      "title.zh",
    ]);
  });

  it("links an external-only entry out on the public site", async () => {
    const meta = await writing(uniqueId("Outbound"));
    await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", {
        intent: "publish",
        "title.en": `Outbound ${meta.id}`,
        platform: "medium",
        externalUrl: "https://medium.com/@kamel/outbound",
        "content.zh:json": "[]",
        "content.en:json": "[]",
      }),
    );
    const items = await listPublicWriting(env.DB, createTestEnv(), "en");
    const item = items.find((entry) => entry.id === meta.id);
    expect(item).toMatchObject({
      href: "https://medium.com/@kamel/outbound",
      external: true,
      hasDetail: false,
    });
  });
});

describe("writing slugs", () => {
  it("creates a slug from the English title and keeps drafts unique", async () => {
    const title = uniqueId("Notes on Mixing");
    const created = unwrap(
      await handleWritingCreate({
        db: env.DB,
        formData: form({
          intent: "create",
          "title.zh": "混音筆記",
          "title.en": title,
          platform: "threads",
          externalUrl: "https://www.threads.net/@kamel/post/2",
          date: "2026-08-18",
        }),
        intent: "create",
        params: {},
        now,
      }),
    );
    expect(created.status).toBe(303);
    const id = created.location?.split("/").pop() ?? "";
    const loaded = await getEntity(env.DB, "writing", id);
    expect(loaded?.meta.slug).toBe(title.toLowerCase().replace(/ /g, "-"));
    expect(loaded?.content.platform).toBe("threads");
    expect(loaded?.content.externalUrl).toBe(
      "https://www.threads.net/@kamel/post/2",
    );
    expect(loaded?.content.date).toBe("2026-08-18");
  });

  it("refuses a slug another entry uses", async () => {
    const first = await writing(uniqueId("First"));
    const second = await writing(uniqueId("Second"));
    const result = await editorAct(
      second.id,
      fullForm(0, first.slug ?? "", { intent: "save" }),
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("slug_taken");
  });

  it("keeps the old URL as a redirect after a published slug changes", async () => {
    const meta = await writing(uniqueId("Renamed"));
    const oldSlug = meta.slug ?? "";
    await editorAct(meta.id, fullForm(0, oldSlug, { intent: "publish" }));
    const newSlug = `${oldSlug}-v2`;
    const result = await editorAct(
      meta.id,
      fullForm(1, newSlug, { intent: "publish" }),
    );
    expect(result.body.published).toBe(true);
    const redirect = await env.DB.prepare(
      "SELECT entity_id FROM slug_redirects WHERE entity_type = 'writing' AND from_slug = ?",
    )
      .bind(oldSlug)
      .first<{ entity_id: string }>();
    expect(redirect?.entity_id).toBe(meta.id);
  });

  it("round-trips every block type through the form", async () => {
    const meta = await writing(uniqueId("Blocks"));
    const asset = await insertExternalAsset(env.DB, { alt: "Stage" });
    const blocks = [
      { type: "heading", level: 2, text: "Heading" },
      { type: "paragraph", text: "Paragraph" },
      { type: "list", style: "ordered", items: ["One", "Two"] },
      { type: "quote", text: "Quote", attribution: null },
      {
        type: "external_image",
        url: "https://images.example.com/a.jpg",
        alt: "Alt",
        caption: null,
      },
      {
        type: "external_link",
        url: "https://example.com",
        label: "Example",
      },
      { type: "media", mediaId: asset },
      { type: "divider" },
    ];
    const result = await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", {
        intent: "save",
        "content.en:json": JSON.stringify(blocks),
      }),
    );
    expect(result.status).toBe(200);
    const loaded = await getEntity(env.DB, "writing", meta.id);
    expect(loaded?.content.content.en).toEqual(blocks);
    const editor = await loadWritingEditor({
      db: env.DB,
      env: createTestEnv(),
      params: { id: meta.id },
    });
    expect(editor.assets.map((item) => item.id)).toEqual([asset]);
  });

  it("refuses malformed blocks as a structural error", async () => {
    const meta = await writing(uniqueId("Broken"));
    const result = await editorAct(
      meta.id,
      fullForm(0, meta.slug ?? "", {
        intent: "save",
        "content.zh:json": JSON.stringify([
          { type: "external_link", url: "javascript:alert(1)", label: "x" },
        ]),
      }),
    );
    expect(result.status).toBe(422);
    expect(
      (result.body.issues as ValidationIssue[]).some((issue) =>
        issue.field.startsWith("content"),
      ),
    ).toBe(true);
  });
});

describe("writing list", () => {
  it("filters by platform, status and category and searches both locales", async () => {
    const token = uniqueId("wtok");
    const category = await createTerm(env.DB, "writing_category", {
      label: text("筆記", `Notes ${token}`),
    });
    const a = await writing(`${token} alpha`, {
      platform: "threads",
      categoryTermId: category.id,
    });
    const b = await writing(`${token} beta`, { platform: "internal" });
    const c = await writing(`${token} gamma`, {
      platform: "threads",
      excerpt: text("只有中文摘要", ""),
    });
    const ids = async (filters: Parameters<typeof listStudioWriting>[1]) =>
      (await listStudioWriting(env.DB, { q: token, ...filters }))
        .map((row) => row.id)
        .sort();

    expect(await ids({})).toEqual([a.id, b.id, c.id].sort());
    expect(await ids({ platform: "threads" })).toEqual([a.id, c.id].sort());
    expect(await ids({ categoryTermId: category.id })).toEqual([a.id]);
    expect(
      (await listStudioWriting(env.DB, { q: "只有中文摘要" })).map(
        (row) => row.id,
      ),
    ).toEqual([c.id]);

    await listAct({ intent: "archive", id: b.id });
    expect(await ids({})).toEqual([a.id, c.id].sort());
    expect(await ids({ status: "archived" })).toEqual([b.id]);
    expect(await ids({ status: "draft" })).toEqual([a.id, c.id].sort());
  });

  it("lists newest first and describes where each entry goes", async () => {
    const token = uniqueId("wdate");
    const older = await writing(`${token} older`, { date: "2026-01-01" });
    const newer = await writing(`${token} newer`, {
      date: "2026-02-01",
      platform: "instagram",
      externalUrl: "https://instagram.com/p/x",
    });
    const rows = await listStudioWriting(env.DB, { q: token });
    expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({
      platform: "instagram",
      externalUrl: "https://instagram.com/p/x",
      hasContent: { zh: false, en: false },
    });
  });

  it("reads filters from the URL and offers categories", async () => {
    const data = await loadWritingList({
      db: env.DB,
      request: new Request(
        "https://kamelkyp.com/studio/writing?platform=medium&status=published&category=term-x&q=a",
      ),
    });
    expect(data.filters).toEqual({
      q: "a",
      platform: "medium",
      categoryTermId: "term-x",
      status: "published",
      sort: "public",
    });
    const invalid = await loadWritingList({
      db: env.DB,
      request: new Request("https://kamelkyp.com/studio/writing?platform=fax"),
    });
    expect(invalid.filters.platform).toBeNull();
    const facets = await getWritingFacets(env.DB);
    expect(Array.isArray(facets.categories)).toBe(true);
  });

  it("features and reorders from the list and adds categories inline", async () => {
    const token = uniqueId("wlist");
    const one = await writing(`${token} one`, { date: "2026-03-03" });
    const two = await writing(`${token} two`, { date: "2026-03-03" });
    await listAct({ intent: "reorder", ids: JSON.stringify([one.id, two.id]) });
    expect(
      (await listStudioWriting(env.DB, { q: token })).map((row) => row.id),
    ).toEqual([one.id, two.id]);
    await listAct({ intent: "feature", id: two.id });
    expect((await getEntity(env.DB, "writing", two.id))?.meta.featured).toBe(
      true,
    );

    const term = await editorAct(one.id, {
      intent: "create-term",
      vocabulary: "writing_category",
      "label.zh": "隨筆",
      "label.en": uniqueId("Essays"),
    });
    expect(term.status).toBe(200);
    expect((term.body.term as { vocabulary: string }).vocabulary).toBe(
      "writing_category",
    );
  });
});

describe("writing editor data", () => {
  it("gives live URLs for articles and the outbound link for link cards", async () => {
    const article = await writing(uniqueId("Article"));
    await editorAct(
      article.id,
      fullForm(0, article.slug ?? "", { intent: "publish" }),
    );
    const data = await loadWritingEditor({
      db: env.DB,
      env: createTestEnv(),
      params: { id: article.id },
    });
    expect(data.liveUrls).toEqual({
      zh: `/zh/writing/${article.slug}`,
      en: `/en/writing/${article.slug}`,
    });
    expect(data.previewPath).toBe(`/studio/preview/writing/${article.id}`);

    const card = await writing(uniqueId("Card"));
    await editorAct(
      card.id,
      fullForm(0, card.slug ?? "", {
        intent: "publish",
        platform: "devpost",
        externalUrl: "https://devpost.com/software/kamel",
        "content.zh:json": "[]",
        "content.en:json": "[]",
      }),
    );
    const cardData = await loadWritingEditor({
      db: env.DB,
      env: createTestEnv(),
      params: { id: card.id },
    });
    expect(cardData.liveUrls).toBeNull();
    expect(cardData.outboundUrl).toBe("https://devpost.com/software/kamel");

    await expect(
      loadWritingEditor({
        db: env.DB,
        env: createTestEnv(),
        params: { id: "missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
