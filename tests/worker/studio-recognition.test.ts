import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEntity, getEntity } from "../../app/lib/cms/db/lifecycle.server";
import {
  getRecognitionFacets,
  handleRecognitionCreate,
  handleRecognitionEditorAction,
  handleRecognitionListAction,
  listStudioRecognition,
  loadRecognitionEditor,
  loadRecognitionList,
} from "../../app/lib/cms/repositories/recognition.server";
import type { ValidationIssue } from "../../app/lib/cms/types";
import { insertExternalAsset, uniqueId } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-09-24T10:00:00Z");
const AWARD = "term-recognition_type-award";
const SPEAKING = "term-recognition_type-speaking";
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
    await handleRecognitionEditorAction({
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
    await handleRecognitionListAction({
      db: env.DB,
      formData: form(fields),
      intent: fields.intent ?? null,
      params: {},
      now,
    }),
  );
}

async function recognition(input: {
  event: string;
  year?: number;
  date?: string;
  typeTermId?: string;
}) {
  const meta = await createEntity(
    env.DB,
    "recognition",
    {
      event: text(`${input.event} 中文`, input.event),
      year: input.year ?? null,
      date: input.date ?? null,
      typeTermId: input.typeTermId ?? null,
    },
    { now },
  );
  return meta.id;
}

/** Every editor field, as the form posts them. */
function fullForm(
  revision: number,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    expectedRevision: String(revision),
    "event.zh": "國際互動設計獎",
    "event.en": "International Interaction Design Award",
    "organization.zh": "設計協會",
    "organization.en": "Design Society",
    "result.zh": "金獎",
    "result.en": "Gold",
    typeTermId: AWARD,
    "year:number": "2026",
    date: "2026-05-01",
    "description.zh": "",
    "description.en": "",
    url: "https://awards.example.com/2026",
    imageId: "",
    disciplineTermId: "term-project_category-interactive",
    projectId: "",
    "clearTodoContent:bool": "false",
    ...overrides,
  };
}

describe("recognition list", () => {
  it("filters by year and type and searches both locales", async () => {
    const token = uniqueId("tok");
    const a = await recognition({
      event: `${token} alpha`,
      year: 2091,
      typeTermId: AWARD,
    });
    const b = await recognition({
      event: `${token} beta`,
      year: 2091,
      typeTermId: SPEAKING,
    });
    const c = await recognition({
      event: `${token} gamma`,
      year: 2092,
      typeTermId: AWARD,
    });
    const ids = async (filters: Parameters<typeof listStudioRecognition>[1]) =>
      (await listStudioRecognition(env.DB, { q: token, ...filters }))
        .map((row) => row.id)
        .sort();

    expect(await ids({})).toEqual([a, b, c].sort());
    expect(await ids({ year: 2091 })).toEqual([a, b].sort());
    expect(await ids({ typeTermId: AWARD })).toEqual([a, c].sort());
    expect(await ids({ year: 2091, typeTermId: SPEAKING })).toEqual([b]);
    // The zh value is searched too.
    const zh = await listStudioRecognition(env.DB, {
      q: `${token} beta 中文`,
    });
    expect(zh.map((row) => row.id)).toEqual([b]);
  });

  it("lists in public order: year, then date, then manual order", async () => {
    const token = uniqueId("ord");
    const older = await recognition({ event: `${token} older`, year: 2093 });
    const undated = await recognition({
      event: `${token} undated`,
      year: 2094,
    });
    const dated = await recognition({
      event: `${token} dated`,
      year: 2094,
      date: "2094-03-01",
    });
    const rows = await listStudioRecognition(env.DB, { q: token });
    expect(rows.map((row) => row.id)).toEqual([dated, undated, older]);
    const updated = await listStudioRecognition(env.DB, {
      q: token,
      sort: "updated",
    });
    expect(updated).toHaveLength(3);
  });

  it("hides archived entries unless asked", async () => {
    const token = uniqueId("arc");
    const id = await recognition({ event: `${token} archived`, year: 2095 });
    await listAct({ intent: "archive", id });
    expect(await listStudioRecognition(env.DB, { q: token })).toHaveLength(0);
    expect(
      await listStudioRecognition(env.DB, { q: token, status: "archived" }),
    ).toHaveLength(1);
    expect(
      await listStudioRecognition(env.DB, { q: token, status: "all" }),
    ).toHaveLength(1);
    await listAct({ intent: "restore", id });
    const [row] = await listStudioRecognition(env.DB, { q: token });
    expect(row?.status).toBe("draft");
  });

  it("offers the years in use and every recognition type as filters", async () => {
    await recognition({ event: uniqueId("facet"), year: 2096 });
    const facets = await getRecognitionFacets(env.DB);
    expect(facets.years).toContain(2096);
    expect(facets.years).toEqual([...facets.years].sort((x, y) => y - x));
    expect(facets.types.map((term) => term.slug)).toEqual(
      expect.arrayContaining([
        "award",
        "publication",
        "speaking",
        "event",
        "competition",
        "research",
      ]),
    );
  });

  it("reads the filters from the URL", async () => {
    const data = await loadRecognitionList({
      db: env.DB,
      request: new Request(
        `https://kamelkyp.com/studio/recognition?q=%20x%20&year=2091&type=${AWARD}&status=draft&sort=updated`,
      ),
    });
    expect(data.filters).toEqual({
      q: "x",
      year: 2091,
      typeTermId: AWARD,
      status: "draft",
      sort: "updated",
    });
    const fallback = await loadRecognitionList({
      db: env.DB,
      request: new Request(
        "https://kamelkyp.com/studio/recognition?year=abc&status=nope",
      ),
    });
    expect(fallback.filters).toMatchObject({
      year: null,
      status: "active",
      sort: "public",
    });
  });

  it("features, duplicates and reorders from the list", async () => {
    const token = uniqueId("lst");
    const first = await recognition({ event: `${token} one`, year: 2097 });
    const second = await recognition({ event: `${token} two`, year: 2097 });

    expect((await listAct({ intent: "feature", id: first })).status).toBe(200);
    expect((await getEntity(env.DB, "recognition", first))?.meta.featured).toBe(
      true,
    );
    await listAct({ intent: "unfeature", id: first });

    const reorder = await listAct({
      intent: "reorder",
      ids: JSON.stringify([second, first]),
    });
    expect(reorder.status).toBe(200);
    const rows = await listStudioRecognition(env.DB, { q: token });
    expect(rows.map((row) => row.id)).toEqual([second, first]);

    const copy = await listAct({ intent: "duplicate", id: first });
    expect(copy.status).toBe(200);
    expect(typeof copy.body.copyId).toBe("string");

    expect((await listAct({ intent: "reorder", ids: "[1,2" })).status).toBe(
      422,
    );
    expect((await listAct({ intent: "nope" })).status).toBe(422);
  });
});

describe("recognition editor", () => {
  it("creates a draft from the quick form and opens the editor", async () => {
    const result = unwrap(
      await handleRecognitionCreate({
        db: env.DB,
        formData: form({
          intent: "create",
          "event.zh": "創作展",
          "event.en": "",
          typeTermId: "term-recognition_type-event",
          "year:number": "2025",
        }),
        intent: "create",
        params: {},
        now,
      }),
    );
    expect(result.status).toBe(303);
    const id = result.location?.split("/").pop() ?? "";
    const loaded = await getEntity(env.DB, "recognition", id);
    expect(loaded?.meta.status).toBe("draft");
    expect(loaded?.content.event).toEqual({ zh: "創作展", en: "" });
    expect(loaded?.content.year).toBe(2025);
  });

  it("saves a draft with only the event and refuses to publish it", async () => {
    const id = await recognition({ event: "Draft only" });
    const saved = await editorAct(id, {
      intent: "save",
      expectedRevision: "0",
      "event.zh": "只有標題",
      "event.en": "",
    });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toBe(true);

    const publish = await editorAct(id, {
      intent: "publish",
      expectedRevision: "1",
      "event.zh": "只有標題",
      "event.en": "",
    });
    expect(publish.status).toBe(200);
    expect(publish.body.published).toBe(false);
    const issues = publish.body.issues as ValidationIssue[];
    const blocking = issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.field}${issue.locale ? `.${issue.locale}` : ""}`)
      .sort();
    expect(blocking).toEqual(["event.en", "typeTermId", "year"]);
    expect((await getEntity(env.DB, "recognition", id))?.meta.status).toBe(
      "draft",
    );
  });

  it("publishes once year, type and event are complete", async () => {
    const id = await recognition({ event: "Complete" });
    const result = await editorAct(id, fullForm(0, { intent: "publish" }));
    expect(result.status).toBe(200);
    expect(result.body.published).toBe(true);
    const loaded = await getEntity(env.DB, "recognition", id);
    expect(loaded?.meta.status).toBe("published");
    expect(loaded?.published?.organization.en).toBe("Design Society");
    expect(loaded?.published?.disciplineTermId).toBe(
      "term-project_category-interactive",
    );
  });

  it("requires https links and alt text on the image to publish", async () => {
    const image = await insertExternalAsset(env.DB, { alt: "" });
    const id = await recognition({ event: "Links" });
    const result = await editorAct(
      id,
      fullForm(0, {
        intent: "publish",
        url: "http://awards.example.com",
        imageId: image,
      }),
    );
    expect(result.body.published).toBe(false);
    const codes = (result.body.issues as ValidationIssue[]).map(
      (issue) => issue.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining(["invalid_url", "alt_required"]),
    );
  });

  it("does not bump the revision when nothing changed", async () => {
    const id = await recognition({ event: "Stable" });
    await editorAct(id, fullForm(0, { intent: "save" }));
    const again = await editorAct(id, fullForm(1, { intent: "save" }));
    expect(again.body.saved).toBe(false);
    expect((await getEntity(env.DB, "recognition", id))?.meta.revision).toBe(1);
  });

  it("answers 409 on a stale revision and 422 on a structural error", async () => {
    const id = await recognition({ event: "Stale" });
    await editorAct(id, fullForm(0, { intent: "save" }));
    const stale = await editorAct(
      id,
      fullForm(0, { intent: "save", "result.en": "Silver" }),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("stale_revision");

    const structural = await editorAct(
      id,
      fullForm(1, { intent: "save", "year:number": "1850" }),
    );
    expect(structural.status).toBe(422);
    expect(
      (structural.body.issues as ValidationIssue[]).map((issue) => issue.field),
    ).toContain("year");

    const missing = await editorAct(id, { intent: "save" });
    expect(missing.status).toBe(422);
  });

  it("saves edits before archiving, then restores and deletes with DELETE", async () => {
    const id = await recognition({ event: "Lifecycle" });
    const featured = await editorAct(id, fullForm(0, { intent: "feature" }));
    expect(featured.status).toBe(200);
    expect((await getEntity(env.DB, "recognition", id))?.meta.featured).toBe(
      true,
    );
    const archived = await editorAct(
      id,
      fullForm(1, { intent: "archive", "result.en": "Finalist" }),
    );
    expect(archived.status).toBe(200);
    const loaded = await getEntity(env.DB, "recognition", id);
    expect(loaded?.meta.status).toBe("archived");
    expect(loaded?.meta.featured).toBe(false);
    expect(loaded?.content.result.en).toBe("Finalist");

    const wrong = await editorAct(id, { intent: "delete", confirm: "delete" });
    expect(wrong.status).toBe(422);
    const deleted = await editorAct(id, {
      intent: "delete",
      confirm: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.redirectTo).toBe("/studio/recognition");
    expect(await getEntity(env.DB, "recognition", id)).toBeNull();
  });

  it("refuses to delete a published entry", async () => {
    const id = await recognition({ event: "Published" });
    await editorAct(id, fullForm(0, { intent: "publish" }));
    const result = await editorAct(id, { intent: "delete", confirm: "DELETE" });
    expect(result.status).toBe(409);
    const unpublished = await editorAct(
      id,
      fullForm(1, { intent: "unpublish" }),
    );
    expect(unpublished.status).toBe(200);
    expect((await getEntity(env.DB, "recognition", id))?.meta.status).toBe(
      "draft",
    );
  });

  it("reverts unpublished changes to the published copy", async () => {
    const id = await recognition({ event: "Revert" });
    await editorAct(id, fullForm(0, { intent: "publish" }));
    await editorAct(id, fullForm(1, { intent: "save", "result.en": "Bronze" }));
    const changed = await getEntity(env.DB, "recognition", id);
    expect(changed?.meta.hasUnpublishedChanges).toBe(true);
    const reverted = await editorAct(id, {
      intent: "revert",
      expectedRevision: "2",
    });
    expect(reverted.status).toBe(200);
    const loaded = await getEntity(env.DB, "recognition", id);
    expect(loaded?.content.result.en).toBe("Gold");
    expect(loaded?.meta.hasUnpublishedChanges).toBe(false);
  });

  it("adds recognition types inline (the vocabulary is extensible)", async () => {
    const id = await recognition({ event: "Types" });
    const label = uniqueId("Residency");
    const created = await editorAct(id, {
      intent: "create-term",
      vocabulary: "recognition_type",
      "label.zh": "駐村",
      "label.en": label,
    });
    expect(created.status).toBe(200);
    const term = created.body.term as { id: string; vocabulary: string };
    expect(term.vocabulary).toBe("recognition_type");
    const facets = await getRecognitionFacets(env.DB);
    expect(facets.types.map((item) => item.id)).toContain(term.id);

    const refused = await editorAct(id, {
      intent: "create-term",
      vocabulary: "service_group",
      "label.zh": "x",
      "label.en": "x",
    });
    expect(refused.status).toBe(422);
  });

  it("loads the editor with terms, projects, asset summaries and issues", async () => {
    const image = await insertExternalAsset(env.DB, { alt: "Stage" });
    const id = await recognition({ event: "Loader" });
    await editorAct(id, fullForm(0, { intent: "save", imageId: image }));
    const data = await loadRecognitionEditor({
      db: env.DB,
      env: createTestEnv(),
      params: { id },
    });
    expect(data.meta.id).toBe(id);
    expect(data.content.imageId).toBe(image);
    expect(data.assets.map((asset) => asset.id)).toEqual([image]);
    expect(data.types.length).toBeGreaterThanOrEqual(6);
    expect(data.disciplines.map((term) => term.slug)).toContain("software");
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.issues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(data.previewPath).toBe(`/studio/preview/recognition/${id}`);

    await expect(
      loadRecognitionEditor({
        db: env.DB,
        env: createTestEnv(),
        params: { id: "missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
