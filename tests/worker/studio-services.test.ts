import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getEntity } from "../../app/lib/cms/db/lifecycle.server";
import {
  createServiceFromForm,
  handleServiceEditorAction,
  handleServiceListAction,
  listStudioServices,
  loadServiceEditor,
  parseServiceForm,
} from "../../app/lib/cms/repositories/services.server";
import { getActivePriceRule } from "../../app/lib/pricing/price-repository.server";
import { clearPlacement } from "./studio-p4-fixtures";

const now = new Date("2026-09-25T10:00:00Z");

type Result = {
  data?: Record<string, unknown>;
  init?: { status?: number } | null;
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function body(result: unknown): Record<string, unknown> {
  return ((result as Result).data ?? {}) as Record<string, unknown>;
}

function status(result: unknown): number {
  return (result as Result).init?.status ?? 200;
}

function redirectTarget(result: unknown): string | null {
  return result instanceof Response ? result.headers.get("Location") : null;
}

async function newDraft(name = "Sound Design") {
  const result = await createServiceFromForm({
    db: env.DB,
    formData: form({
      "name.zh": "聲音設計",
      "name.en": name,
      groupTermId: "term-service_group-creative-technology",
    }),
    now,
  });
  const location = redirectTarget(result);
  expect(location).toMatch(/^\/studio\/services\//);
  return (location as string).split("/").pop() as string;
}

function editorForm(
  revision: number,
  fields: Record<string, string>,
): FormData {
  return form({
    expectedRevision: String(revision),
    slug: "",
    groupTermId: "term-service_group-creative-technology",
    "name.zh": "聲音設計",
    "name.en": "Sound Design",
    "description.zh": "為互動作品設計聲音。",
    "description.en": "Sound for interactive work.",
    ...fields,
  });
}

beforeEach(async () => {
  await clearPlacement(env.DB);
});

describe("service list", () => {
  it("shows commission rows with the live price from price_versions", async () => {
    const rows = await listStudioServices(env.DB, { status: "all" }, now);
    const fullMix = rows.find((row) => row.commissionServiceId === "full_mix");
    const rule = await getActivePriceRule(
      env.DB,
      "full_mix",
      now.toISOString(),
    );
    expect(fullMix?.livePrice).toEqual({
      baseTwd: rule.baseTwd,
      versionId: rule.versionId,
    });
    expect(fullMix?.priceAmount).toBeNull();
    const software = rows.find(
      (row) => row.groupTermId === "term-service_group-software-development",
    );
    expect(software?.livePrice).toBeNull();
    expect(software?.priceMode).toBe("custom_quote");
    expect(software?.priceAmount).toBeNull();
  });

  it("filters by group, status and text in either locale", async () => {
    const mixing = await listStudioServices(
      env.DB,
      { groupTermId: "term-service_group-mixing" },
      now,
    );
    expect(mixing.length).toBeGreaterThan(0);
    expect(
      mixing.every((row) => row.groupTermId === "term-service_group-mixing"),
    ).toBe(true);

    const id = await newDraft("Granular Patches");
    const drafts = await listStudioServices(env.DB, { status: "draft" }, now);
    expect(drafts.map((row) => row.id)).toContain(id);
    const published = await listStudioServices(
      env.DB,
      { status: "published" },
      now,
    );
    expect(published.map((row) => row.id)).not.toContain(id);

    const byEn = await listStudioServices(env.DB, { q: "granular" }, now);
    expect(byEn.map((row) => row.id)).toEqual([id]);
    const byZh = await listStudioServices(env.DB, { q: "聲音設計" }, now);
    expect(byZh.map((row) => row.id)).toContain(id);
  });

  it("hides archived services unless asked", async () => {
    const id = await newDraft("Archive Me");
    await handleServiceListAction({
      db: env.DB,
      formData: form({ intent: "archive", id }),
      intent: "archive",
      now,
    });
    const active = await listStudioServices(env.DB, {}, now);
    expect(active.map((row) => row.id)).not.toContain(id);
    const archived = await listStudioServices(
      env.DB,
      { status: "archived" },
      now,
    );
    expect(archived.map((row) => row.id)).toContain(id);
  });

  it("features and reorders services within a group", async () => {
    const first = await newDraft("First");
    const second = await newDraft("Second");
    await handleServiceListAction({
      db: env.DB,
      formData: form({ id: first }),
      intent: "feature",
      now,
    });
    expect((await getEntity(env.DB, "service", first))?.meta.featured).toBe(
      true,
    );
    const reordered = await handleServiceListAction({
      db: env.DB,
      formData: form({ ids: JSON.stringify([second, first]) }),
      intent: "reorder",
      now,
    });
    expect(body(reordered).ok).toBe(true);
    const rows = await listStudioServices(
      env.DB,
      { groupTermId: "term-service_group-creative-technology" },
      now,
    );
    const ids = rows.map((row) => row.id);
    expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
  });
});

describe("service form parsing", () => {
  it("keeps a price only for fixed and starting-from modes", () => {
    const fixed = parseServiceForm(
      editorForm(3, {
        priceMode: "fixed",
        "priceAmount:number": "1200",
        currency: "USD",
      }),
    );
    expect(fixed.expectedRevision).toBe(3);
    expect(fixed.input).toMatchObject({
      priceMode: "fixed",
      priceAmount: 1200,
      currency: "USD",
    });

    const quote = parseServiceForm(
      editorForm(3, {
        priceMode: "custom_quote",
        "priceAmount:number": "1200",
        currency: "USD",
      }),
    );
    expect(quote.input).toMatchObject({
      priceMode: "custom_quote",
      priceAmount: null,
      currency: null,
    });
  });

  it("never accepts a commission link from the form", () => {
    const parsed = parseServiceForm(
      editorForm(1, { commissionServiceId: "full_mix" }),
    );
    expect(parsed.input.commissionServiceId).toBeNull();
  });
});

describe("service editor", () => {
  it("creates a draft from a name and a group", async () => {
    const id = await newDraft();
    const loaded = await getEntity(env.DB, "service", id);
    expect(loaded?.meta.status).toBe("draft");
    expect(loaded?.content.name.en).toBe("Sound Design");
    expect(loaded?.content.slug).toBe("sound-design");
    expect(loaded?.content.priceMode).toBe("contact");
  });

  it("refuses to create a service without any name", async () => {
    const result = await createServiceFromForm({
      db: env.DB,
      formData: form({ "name.zh": " ", "name.en": "" }),
      now,
    });
    expect(status(result)).toBe(422);
    expect(body(result).ok).toBe(false);
  });

  it("publishes a custom-quote service without any price", async () => {
    const id = await newDraft();
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, { priceMode: "custom_quote" }),
      intent: "publish",
      now,
    });
    expect(body(result)).toMatchObject({ ok: true, published: true });
    const loaded = await getEntity(env.DB, "service", id);
    expect(loaded?.meta.status).toBe("published");
    expect(loaded?.published?.priceAmount).toBeNull();
  });

  it("saves a fixed-price draft without a number but refuses to publish it", async () => {
    const id = await newDraft();
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, { priceMode: "fixed" }),
      intent: "publish",
      now,
    });
    const payload = body(result);
    expect(payload.ok).toBe(true);
    expect(payload.published).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "priceAmount",
          code: "price_required",
        }),
      ]),
    );
    const loaded = await getEntity(env.DB, "service", id);
    expect(loaded?.meta.status).toBe("draft");
    expect(loaded?.meta.revision).toBe(1);
  });

  it("answers 409 when the entry changed elsewhere", async () => {
    const id = await newDraft();
    await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, { "turnaround.en": "Two weeks" }),
      intent: "save",
      now,
    });
    const stale = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, { "turnaround.en": "Three weeks" }),
      intent: "save",
      now,
    });
    expect(status(stale)).toBe(409);
    expect(body(stale).code).toBe("stale_revision");
  });

  it("does not bump the revision when nothing changed", async () => {
    const id = await newDraft();
    const loaded = await loadServiceEditor(env.DB, id, now);
    const fields = {
      slug: loaded.content.slug,
      priceMode: loaded.content.priceMode,
      "description.zh": "",
      "description.en": "",
    };
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, fields),
      intent: "feature",
      now,
    });
    expect(body(result).ok).toBe(true);
    const after = await getEntity(env.DB, "service", id);
    expect(after?.meta.featured).toBe(true);
    expect(after?.meta.revision).toBe(0);
  });

  it("keeps commission prices in Pricing: read-only price, no archive", async () => {
    const loaded = await loadServiceEditor(env.DB, "svc-full_mix", now);
    const rule = await getActivePriceRule(
      env.DB,
      "full_mix",
      now.toISOString(),
    );
    expect(loaded.livePrice).toEqual({
      baseTwd: rule.baseTwd,
      versionId: rule.versionId,
    });
    expect(loaded.meta.commissionServiceId).toBe("full_mix");

    const saved = await handleServiceEditorAction({
      db: env.DB,
      id: "svc-full_mix",
      formData: form({
        expectedRevision: String(loaded.meta.revision),
        slug: "renamed",
        groupTermId: loaded.content.groupTermId ?? "",
        "name.zh": loaded.content.name.zh,
        "name.en": loaded.content.name.en,
        priceMode: "fixed",
        "priceAmount:number": "1",
        currency: "TWD",
      }),
      intent: "save",
      now,
    });
    expect(body(saved).ok).toBe(true);
    const row = await env.DB.prepare(
      "SELECT slug, price_mode, price_amount, currency FROM services WHERE id = 'svc-full_mix'",
    ).first();
    expect(row).toEqual({
      slug: "full-mix",
      price_mode: "starting_from",
      price_amount: null,
      currency: null,
    });

    const archived = await handleServiceEditorAction({
      db: env.DB,
      id: "svc-full_mix",
      formData: form({ expectedRevision: String(loaded.meta.revision + 1) }),
      intent: "archive",
      now,
    });
    expect(status(archived)).toBe(409);
  });

  it("deletes a draft after typing its slug and returns to the list", async () => {
    const id = await newDraft("Delete Me");
    const wrong = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: form({ confirm: "nope" }),
      intent: "delete",
      now,
    });
    expect(body(wrong).code).toBe("confirmation_mismatch");
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: form({ confirm: "delete-me" }),
      intent: "delete",
      now,
    });
    expect(body(result)).toMatchObject({
      ok: true,
      redirectTo: "/studio/services",
    });
    expect(await getEntity(env.DB, "service", id)).toBeNull();
  });

  it("duplicates into a new draft and points at its editor", async () => {
    const id = await newDraft("Copy Source");
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: editorForm(0, {
        slug: "copy-source",
        "name.en": "Copy Source",
      }),
      intent: "duplicate",
      now,
    });
    const redirectTo = body(result).redirectTo as string;
    expect(redirectTo).toMatch(/^\/studio\/services\//);
    const copy = await getEntity(
      env.DB,
      "service",
      redirectTo.split("/").pop() as string,
    );
    expect(copy?.content.slug).toBe("copy-source-copy");
  });

  it("rejects unknown intents", async () => {
    const id = await newDraft();
    const result = await handleServiceEditorAction({
      db: env.DB,
      id,
      formData: form({}),
      intent: "explode",
      now,
    });
    expect(status(result)).toBe(422);
  });
});
