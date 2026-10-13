/**
 * Studio → Terms (wp2 §4.5, §4.7, §6.2). Term versions are immutable and
 * this file shares one database, so each test works on its own document and
 * locale and passes an explicit `now`.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { publishTermVersion } from "../../app/lib/admin/term-service.server";
import { isCmsError } from "../../app/lib/cms/db/errors";
import {
  PreviewFormError,
  previewTerms,
} from "../../app/lib/cms/public/preview.server";
import {
  handleTermEditorAction,
  loadTermEditor,
  loadTermsIndex,
  publishTermDraft,
} from "../../app/lib/cms/repositories/terms.server";
import { listPublishedTerms } from "../../app/lib/content/public-content.server";

type Result = {
  data?: Record<string, unknown>;
  init?: { status?: number } | null;
};

function body(result: unknown): Record<string, unknown> {
  return ((result as Result).data ?? {}) as Record<string, unknown>;
}

function status(result: unknown): number {
  return (result as Result).init?.status ?? 200;
}

type Clause = { key: string; title: string; text: string };

function termForm(
  clauses: Clause[],
  fields: Record<string, string> = {},
): FormData {
  const form = new FormData();
  clauses.forEach((clause, index) => {
    form.append(`clauses.${index}.key`, clause.key);
    form.append(`clauses.${index}.title`, clause.title);
    form.append(`clauses.${index}.text`, clause.text);
  });
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

function act(
  documentId: string,
  locale: string,
  intent: string,
  formData: FormData,
  now: Date,
) {
  return handleTermEditorAction({
    db: env.DB,
    documentId,
    locale,
    formData,
    intent,
    now,
  });
}

async function draftRow(documentId: string, locale: string) {
  return env.DB.prepare(
    "SELECT body_json, base_version_id, revision FROM term_drafts WHERE document_id = ? AND locale = ?",
  )
    .bind(documentId, locale)
    .first<{
      body_json: string;
      base_version_id: string | null;
      revision: number;
    }>();
}

async function versionCount(documentId: string, locale: string) {
  return (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM term_versions WHERE document_id = ? AND locale = ?",
  )
    .bind(documentId, locale)
    .first("n")) as number;
}

const CLAUSE: Clause = {
  key: "scope",
  title: "Scope",
  text: "What the service covers.",
};

describe("terms index", () => {
  it("lists 6 documents x 2 locales with nothing live and no drafts on a fresh database", async () => {
    const data = await loadTermsIndex(
      env.DB,
      new Date("2026-10-13T00:00:00.000Z"),
    );
    expect(data.documents.map((document) => document.id)).toEqual([
      "common",
      "privacy",
      "full-mix",
      "vocal-mix",
      "simple-transition",
      "edit-transition",
    ]);
    expect(data.documents.map((document) => document.label)).toEqual([
      "General terms",
      "Privacy notice",
      "Service terms · Full Song Mixing",
      "Service terms · Vocal Mixing",
      "Service terms · Simple Song Transition",
      "Service terms · Edited Song Transition",
    ]);
    for (const document of data.documents) {
      for (const locale of ["zh", "en"] as const) {
        expect(document.locales[locale]).toEqual({
          live: null,
          liveEffective: false,
          draft: null,
        });
      }
    }
    expect(data.documents[1]?.publicPath).toBe("/privacy");
    expect(data.documents[2]?.serviceId).toBe("full_mix");
    expect(data.readiness).toHaveLength(4);
  });
});

describe("term drafts", () => {
  it("saves a revision-checked server draft", async () => {
    const now = new Date("2026-10-13T01:00:00.000Z");
    const first = await act(
      "privacy",
      "en",
      "save",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    expect(status(first)).toBe(200);
    expect(body(first).message).toBe("Saved");
    expect(await draftRow("privacy", "en")).toEqual({
      body_json: JSON.stringify([CLAUSE]),
      base_version_id: null,
      revision: 1,
    });

    const stale = await act(
      "privacy",
      "en",
      "save",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    expect(status(stale)).toBe(409);
    expect(body(stale).code).toBe("stale_revision");

    const same = await act(
      "privacy",
      "en",
      "save",
      termForm([CLAUSE], { expectedRevision: "1" }),
      now,
    );
    expect(status(same)).toBe(200);
    expect(body(same).message).toBe("No changes");
    expect((await draftRow("privacy", "en"))?.revision).toBe(1);

    const changed = await act(
      "privacy",
      "en",
      "save",
      termForm(
        [CLAUSE, { key: "", title: "", text: "" }, { ...CLAUSE, key: "more" }],
        { expectedRevision: "1" },
      ),
      now,
    );
    expect(status(changed)).toBe(200);
    const row = await draftRow("privacy", "en");
    expect(row?.revision).toBe(2);
    // Rows whose three fields are empty are dropped.
    expect(JSON.parse(row?.body_json ?? "[]")).toHaveLength(2);

    const malformed = await act(
      "privacy",
      "en",
      "save",
      termForm([{ ...CLAUSE, key: "Bad Key" }], { expectedRevision: "2" }),
      now,
    );
    expect(status(malformed)).toBe(422);
    expect(body(malformed).code).toBe("invalid_content");
  });

  it("refuses to publish without the legal review and saves nothing", async () => {
    const now = new Date("2026-10-13T02:00:00.000Z");
    const result = await act(
      "common",
      "zh",
      "publish-term-version",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    expect(status(result)).toBe(422);
    expect(body(result).code).toBe("legal_review_required");
    expect((body(result).issues as Array<{ field: string }>)[0]?.field).toBe(
      "legalReviewConfirmed",
    );
    expect(await draftRow("common", "zh")).toBeNull();
    expect(await versionCount("common", "zh")).toBe(0);
  });

  it("saves the draft but does not publish while blocking issues remain", async () => {
    const now = new Date("2026-10-13T03:00:00.000Z");
    const result = await act(
      "common",
      "en",
      "publish-term-version",
      termForm([{ ...CLAUSE, title: "" }], {
        expectedRevision: "0",
        legalReviewConfirmed: "on",
      }),
      now,
    );
    expect(status(result)).toBe(200);
    expect(body(result).published).toBe(false);
    expect(String(body(result).message)).toMatch(
      /^Saved\. Publishing is blocked by 1 issue/,
    );
    expect((await draftRow("common", "en"))?.revision).toBe(1);
    expect(await versionCount("common", "en")).toBe(0);
  });

  it("publishes the next immutable version, moves the pointer at `now` and deletes the draft", async () => {
    const now = new Date("2026-10-13T04:00:00.000Z");
    const first = await act(
      "full-mix",
      "zh",
      "publish-term-version",
      termForm([CLAUSE], { expectedRevision: "0", legalReviewConfirmed: "on" }),
      now,
    );
    expect(status(first)).toBe(200);
    expect(body(first)).toMatchObject({ published: true, versionNumber: 1 });
    expect(await draftRow("full-mix", "zh")).toBeNull();
    const pointer = await env.DB.prepare(
      "SELECT version_id, effective_from FROM term_publications WHERE document_id = 'full-mix' AND locale = 'zh'",
    ).first<{ version_id: string; effective_from: string }>();
    expect(pointer?.effective_from).toBe(now.toISOString());
    const terms = await listPublishedTerms(
      env.DB,
      "zh",
      "terms",
      now.toISOString(),
    );
    expect(terms.map((term) => [term.documentId, term.clauses])).toEqual([
      ["full-mix", [CLAUSE]],
    ]);

    // A new draft starts from v1; publishing it makes v2.
    const later = new Date("2026-10-14T04:00:00.000Z");
    const saved = await act(
      "full-mix",
      "zh",
      "save",
      termForm([{ ...CLAUSE, text: "Updated scope." }], {
        expectedRevision: "0",
      }),
      later,
    );
    expect(status(saved)).toBe(200);
    expect((await draftRow("full-mix", "zh"))?.base_version_id).toBe(
      pointer?.version_id,
    );
    const second = await act(
      "full-mix",
      "zh",
      "publish-term-version",
      termForm([{ ...CLAUSE, text: "Updated scope." }], {
        expectedRevision: "1",
        legalReviewConfirmed: "on",
      }),
      later,
    );
    expect(body(second)).toMatchObject({ published: true, versionNumber: 2 });
    expect(await versionCount("full-mix", "zh")).toBe(2);

    await expect(
      env.DB.prepare(
        "UPDATE term_versions SET body_json = '[]' WHERE document_id = 'full-mix'",
      ).run(),
    ).rejects.toThrow();

    const editor = await loadTermEditor(env.DB, "full-mix", "zh", later);
    expect(editor.live?.versionNumber).toBe(2);
    expect(editor.liveEffective).toBe(true);
    expect(editor.draft).toBeNull();
    expect(editor.history.map((version) => version.versionNumber)).toEqual([
      2, 1,
    ]);
    expect(editor.history[0]?.live).toBe(true);
    expect(editor.expected.map((item) => item.key)).toEqual([
      "full_mix",
      "mixing_source",
    ]);
    expect(editor.otherLocale).toBe("en");
  });

  it("maps a draft revision that moved before the publish batch to 409 and inserts nothing", async () => {
    const now = new Date("2026-10-13T05:00:00.000Z");
    await act(
      "vocal-mix",
      "zh",
      "save",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    await act(
      "vocal-mix",
      "zh",
      "save",
      termForm([{ ...CLAUSE, title: "Scope 2" }], { expectedRevision: "1" }),
      now,
    );
    const outcome = await publishTermDraft(env.DB, {
      documentId: "vocal-mix",
      locale: "zh",
      revision: 1,
      now,
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCmsError(outcome) && outcome.code).toBe("stale_revision");
    expect(await versionCount("vocal-mix", "zh")).toBe(0);
    expect((await draftRow("vocal-mix", "zh"))?.revision).toBe(2);
  });

  it("takes the next number after a legacy publish in between", async () => {
    const now = new Date("2026-10-13T06:00:00.000Z");
    await act(
      "vocal-mix",
      "en",
      "save",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    await publishTermVersion({
      db: env.DB,
      documentId: "vocal-mix",
      locale: "en",
      clauses: [{ key: "legacy", title: "Legacy", text: "Legacy text." }],
      effectiveFrom: "2026-10-13T05:30:00.000Z",
      legalReviewConfirmed: true,
    });
    const result = await act(
      "vocal-mix",
      "en",
      "publish-term-version",
      termForm([CLAUSE], { expectedRevision: "1", legalReviewConfirmed: "on" }),
      now,
    );
    expect(body(result)).toMatchObject({ published: true, versionNumber: 2 });
    const issues = (body(result).issues ?? []) as Array<{ code: string }>;
    expect(issues.map((issue) => issue.code)).toContain("base_outdated");
  });

  it("answers `unchanged` when there is no draft and the form equals the live version", async () => {
    const now = new Date("2026-10-13T07:00:00.000Z");
    await act(
      "full-mix",
      "en",
      "publish-term-version",
      termForm([CLAUSE], { expectedRevision: "0", legalReviewConfirmed: "on" }),
      now,
    );
    expect(await versionCount("full-mix", "en")).toBe(1);
    const again = await act(
      "full-mix",
      "en",
      "publish-term-version",
      termForm([CLAUSE], { expectedRevision: "0", legalReviewConfirmed: "on" }),
      new Date("2026-10-13T08:00:00.000Z"),
    );
    expect(status(again)).toBe(200);
    expect(body(again).published).toBe(false);
    const issues = body(again).issues as Array<{ code: string }>;
    expect(issues.map((issue) => issue.code)).toEqual(["unchanged"]);
    expect(await versionCount("full-mix", "en")).toBe(1);
    expect(await draftRow("full-mix", "en")).toBeNull();
  });

  it("discards a draft, revision-checked", async () => {
    const now = new Date("2026-10-13T09:00:00.000Z");
    await act(
      "simple-transition",
      "zh",
      "save",
      termForm([CLAUSE], { expectedRevision: "0" }),
      now,
    );
    const stale = await act(
      "simple-transition",
      "zh",
      "discard-draft",
      termForm([], { expectedRevision: "7" }),
      now,
    );
    expect(status(stale)).toBe(409);
    expect(await draftRow("simple-transition", "zh")).not.toBeNull();
    const discarded = await act(
      "simple-transition",
      "zh",
      "discard-draft",
      termForm([], { expectedRevision: "1" }),
      now,
    );
    expect(status(discarded)).toBe(200);
    expect(await draftRow("simple-transition", "zh")).toBeNull();
  });

  it("warns about personal names (terms are exempt from the blocking guard)", async () => {
    const now = new Date("2026-10-13T10:00:00.000Z");
    const result = await act(
      "simple-transition",
      "en",
      "publish-term-version",
      termForm(
        [{ ...CLAUSE, text: "Provided by Kevin as the operator of Kamel." }],
        { expectedRevision: "0", legalReviewConfirmed: "on" },
      ),
      now,
    );
    expect(body(result).published).toBe(true);
    const issues = body(result).issues as Array<{
      code: string;
      severity: string;
    }>;
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "brand_name", severity: "warning" }),
    );
  });

  it("warns about NT$ amounts that are not the active price", async () => {
    const now = new Date("2026-10-13T11:00:00.000Z");
    const result = await act(
      "edit-transition",
      "zh",
      "publish-term-version",
      termForm(
        [{ ...CLAUSE, text: "基本價格 NT$9,000，第六首起每首 NT$800。" }],
        { expectedRevision: "0", legalReviewConfirmed: "on" },
      ),
      now,
    );
    expect(body(result).published).toBe(true);
    const issues = body(result).issues as Array<{
      code: string;
      message: string;
    }>;
    const mention = issues.find((issue) => issue.code === "price_mention");
    expect(mention?.message).toBe(
      "Mentions NT$9,000; the active Edited Song Transition price is base NT$4,000, NT$800 per song after the 5th.",
    );
  });

  it("answers 404 for an unknown document or locale", async () => {
    await expect(
      loadTermEditor(env.DB, "refunds", "zh", new Date()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      loadTermEditor(env.DB, "common", "fr", new Date()),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("term preview", () => {
  it("shows the saved draft (GET) or the unsaved form (POST) inside the real page", async () => {
    const now = new Date("2026-10-15T00:00:00.000Z");
    const saved = await previewTerms(env.DB, "en", "privacy", { now });
    expect(saved?.page).toBe("privacy");
    expect(saved?.terms.map((term) => term.documentId)).toEqual(["privacy"]);
    expect(saved?.terms[0]?.clauses.map((clause) => clause.key)).toEqual([
      "scope",
      "more",
    ]);
    expect(saved?.terms[0]?.effectiveFrom).toBe(now.toISOString());

    const posted = await previewTerms(env.DB, "zh", "full-mix", {
      now,
      formData: termForm([{ ...CLAUSE, title: "Unsaved title" }], {
        locale: "zh",
      }),
    });
    expect(posted?.page).toBe("terms");
    expect(
      posted?.terms.find((term) => term.documentId === "full-mix")?.clauses[0]
        ?.title,
    ).toBe("Unsaved title");

    await expect(
      previewTerms(env.DB, "en", "full-mix", {
        now,
        formData: termForm([CLAUSE], { locale: "zh" }),
      }),
    ).rejects.toBeInstanceOf(PreviewFormError);
    expect(await previewTerms(env.DB, "zh", "refunds", { now })).toBeNull();
  });
});
