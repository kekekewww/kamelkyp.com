/**
 * Studio → Settings → Footer (wp3 spec §4.6–§4.8, §6.2): the loader, the
 * four intents and their messages, the public footer they produce, legacy
 * `/admin/links` rows and the Studio preview's parity with the public site.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localizeRecords } from "../../app/components/studio/footer/footer-model";
import { composeFooterGroups } from "../../app/lib/cms/public/footer";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import {
  handleFooterAction,
  loadFooterScreen,
} from "../../app/lib/cms/repositories/footer.server";
import { loadSocialLinks } from "../../app/lib/cms/repositories/social-links.server";
import type { StudioFooterGroup } from "../../app/lib/cms/schemas/footer";
import type { Locale } from "../../app/lib/cms/types";
import { createTestEnv } from "../helpers/test-env";

const now = new Date("2026-10-13T10:00:00Z");
const testEnv = createTestEnv({ DB: env.DB });
// Deny-list term assembled at runtime so no personal name is spelled out here.
const DENIED = ["Ya", "ng"].join("");

type Unwrapped = { status: number; body: Record<string, unknown> };
type Entries = Array<[string, string]>;
type LinkInput = { zh: string; en: string; url: string; enabled?: boolean };

function unwrap(result: unknown): Unwrapped {
  const value = result as {
    data?: Record<string, unknown>;
    init?: ResponseInit | null;
  };
  return { status: value.init?.status ?? 200, body: value.data ?? {} };
}

async function act(entries: Entries): Promise<Unwrapped> {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  const intent = entries.find(([name]) => name === "intent")?.[1] ?? null;
  return unwrap(
    await handleFooterAction({ db: env.DB, formData, intent, now }),
  );
}

/** The fields the Studio's group editor posts. */
function saveEntries(input: {
  id?: string;
  fingerprint?: string;
  label: { zh: string; en: string };
  enabled?: boolean;
  links?: LinkInput[];
}): Entries {
  const entries: Entries = [["intent", "save-group"]];
  if (input.id) entries.push(["id", input.id]);
  if (input.fingerprint) entries.push(["fingerprint", input.fingerprint]);
  entries.push(["label.zh", input.label.zh], ["label.en", input.label.en]);
  if (input.enabled !== undefined) {
    entries.push(["enabled:bool", "false"]);
    if (input.enabled) entries.push(["enabled:bool", "true"]);
  }
  if (input.links?.length === 0) entries.push(["links:json", "[]"]);
  input.links?.forEach((link, index) => {
    entries.push(
      [`links.${index}.label.zh`, link.zh],
      [`links.${index}.label.en`, link.en],
      [`links.${index}.url`, link.url],
      [`links.${index}.enabled:bool`, "false"],
    );
    if (link.enabled !== false) {
      entries.push([`links.${index}.enabled:bool`, "true"]);
    }
  });
  return entries;
}

async function screen() {
  return loadFooterScreen(env.DB);
}

async function group(key: string): Promise<StudioFooterGroup> {
  const found = (await screen()).groups.find((item) => item.key === key);
  if (!found) throw new Error(`no footer group ${key}`);
  return found;
}

async function publicFooter(locale: Locale = "en") {
  return (await getPublicSiteContext(env.DB, testEnv, locale)).footerGroups;
}

async function linkRows(groupId: string) {
  const rows = await env.DB.prepare(
    "SELECT id, locale, label, url, sort_order, enabled FROM links WHERE group_id = ? ORDER BY sort_order, locale",
  )
    .bind(groupId)
    .all<{
      id: string;
      locale: string;
      label: string;
      url: string;
      sort_order: number;
      enabled: number;
    }>();
  return rows.results;
}

async function sortOrders(): Promise<Record<string, number>> {
  const rows = await env.DB.prepare(
    "SELECT stable_key, sort_order FROM link_groups",
  ).all<{ stable_key: string; sort_order: number }>();
  return Object.fromEntries(
    rows.results.map((row) => [row.stable_key, row.sort_order]),
  );
}

// The footer tables at the start of the file (seeded by 0007 and 0010);
// every case starts from them because worker storage persists per file.
type Snapshot = Record<
  "groups" | "labels" | "links",
  Record<string, unknown>[]
>;
let seeded: Snapshot;
let settingsRows: Record<string, unknown>[];

async function readSnapshot(): Promise<Snapshot> {
  const all = async (sql: string) =>
    (await env.DB.prepare(sql).all<Record<string, unknown>>()).results;
  return {
    groups: await all(
      "SELECT id, stable_key, sort_order, enabled FROM link_groups",
    ),
    labels: await all("SELECT group_id, locale, label FROM link_group_labels"),
    links: await all(
      "SELECT id, group_id, locale, label, url, sort_order, enabled FROM links",
    ),
  };
}

async function restore(snapshot: Snapshot) {
  const insert = (table: string, row: Record<string, unknown>) => {
    const columns = Object.keys(row);
    return env.DB.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ).bind(...columns.map((column) => row[column]));
  };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM links"),
    env.DB.prepare("DELETE FROM link_group_labels"),
    env.DB.prepare("DELETE FROM link_groups"),
    env.DB.prepare("DELETE FROM social_links"),
    env.DB.prepare("DELETE FROM settings"),
    ...snapshot.groups.map((row) => insert("link_groups", row)),
    ...snapshot.labels.map((row) => insert("link_group_labels", row)),
    ...snapshot.links.map((row) => insert("links", row)),
    ...settingsRows.map((row) => insert("settings", row)),
  ]);
}

beforeAll(async () => {
  seeded = await readSnapshot();
  settingsRows = (
    await env.DB.prepare(
      "SELECT key, data_json, revision, updated_at FROM settings",
    ).all<Record<string, unknown>>()
  ).results;
});

beforeEach(async () => {
  await restore(seeded);
});

async function insertLegacySocial() {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('admin-social', 'social', 5, 1)",
    ),
    env.DB.prepare(
      "INSERT INTO link_group_labels (group_id, locale, label) VALUES ('admin-social', 'zh', '社群舊'), ('admin-social', 'en', 'Old social')",
    ),
    env.DB.prepare(
      "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES ('admin-social-0-zh', 'admin-social', 'zh', 'IG', 'https://instagram.com/old', 0, 1), ('admin-social-0-en', 'admin-social', 'en', 'IG', 'https://instagram.com/old', 0, 1)",
    ),
  ]);
}

describe("footer screen loader", () => {
  it("lists every footer group in footer order, without the legacy social group", async () => {
    await insertLegacySocial();
    const { groups, sources } = await screen();
    expect(groups.map((item) => item.key)).toEqual([
      "navigate",
      "services",
      "work_resources",
      "find_me",
      "contact",
      "legal",
    ]);
    const work = groups.find((item) => item.key === "work_resources");
    expect(work?.kind).toBe("custom");
    expect(
      work?.links.map((link) => [link.label.en, link.enabled, link.notes]),
    ).toEqual([
      ["GitHub", true, []],
      ["Website repository", false, []],
    ]);
    expect(groups.find((item) => item.key === "legal")?.hideable).toBe(false);
    for (const item of groups) {
      expect(item.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(item.stored).toBe(true);
    }
    expect(sources.navigation.map((item) => item.key)).toEqual([
      "work",
      "services",
      "about",
      "writing",
    ]);
    expect(sources.socialLinks).toEqual([]);
  });

  it("shows a missing built-in row from its defaults", async () => {
    await env.DB.prepare(
      "DELETE FROM link_groups WHERE id = 'seed-footer-contact'",
    ).run();
    const contact = await group("contact");
    expect(contact).toMatchObject({
      id: "seed-footer-contact",
      stored: false,
      enabled: true,
      label: { zh: "", en: "" },
    });
    // A missing trail group goes after the stored ones (spec §4.4.1).
    expect((await screen()).groups.at(-1)?.key).toBe("contact");
  });
});

describe("save-group", () => {
  it("replaces a custom group's labels and links as complete pairs", async () => {
    const before = await group("work_resources");
    const saved = await act(
      saveEntries({
        id: before.id,
        fingerprint: before.fingerprint,
        label: { zh: "作品與資源", en: "Work & Resources" },
        links: [
          { zh: "作品集", en: "Portfolio", url: "example.com/portfolio" },
          { zh: "作品", en: "Works", url: "/zh/works" },
          {
            zh: "隱藏",
            en: "Hidden",
            url: "https://example.com/hidden",
            enabled: false,
          },
        ],
      }),
    );
    expect(saved.status).toBe(200);
    expect(saved.body.intent).toBe("save-group");
    const result = saved.body.group as StudioFooterGroup;
    expect(result.fingerprint).not.toBe(before.fingerprint);
    expect(result.links.map((link) => link.url)).toEqual([
      "https://example.com/portfolio",
      "/works",
      "https://example.com/hidden",
    ]);

    const rows = await linkRows(before.id);
    expect(
      rows.map((row) => [row.locale, row.sort_order, row.enabled, row.url]),
    ).toEqual([
      ["en", 0, 1, "https://example.com/portfolio"],
      ["zh", 0, 1, "https://example.com/portfolio"],
      ["en", 10, 1, "/works"],
      ["zh", 10, 1, "/works"],
      ["en", 20, 0, "https://example.com/hidden"],
      ["zh", 20, 0, "https://example.com/hidden"],
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(6);

    const footer = await publicFooter("en");
    const work = footer.find((item) => item.id === before.id);
    expect(work?.links.map((link) => link.url)).toEqual([
      "https://example.com/portfolio",
      "/en/works",
    ]);
  });

  it("refuses a save made from an older version with 409", async () => {
    const before = await group("work_resources");
    const first = await act(
      saveEntries({
        id: before.id,
        fingerprint: before.fingerprint,
        label: { zh: "作品", en: "Work" },
        links: [{ zh: "甲", en: "A", url: "https://example.com/a" }],
      }),
    );
    expect(first.status).toBe(200);
    const rowsAfterFirst = await linkRows(before.id);
    const stale = await act(
      saveEntries({
        id: before.id,
        fingerprint: before.fingerprint,
        label: { zh: "作品", en: "Work" },
        links: [{ zh: "乙", en: "B", url: "https://example.com/b" }],
      }),
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      ok: false,
      code: "stale_revision",
      message: "This group changed elsewhere.",
    });
    expect(await linkRows(before.id)).toEqual(rowsAfterFirst);
  });

  it("answers 422 with the issues of every rule", async () => {
    const work = await group("work_resources");
    const rowsBefore = await linkRows(work.id);
    const invalid = await act(
      saveEntries({
        id: work.id,
        fingerprint: work.fingerprint,
        label: { zh: "Sample: 作品", en: "" },
        links: [
          { zh: "連結", en: "Link", url: "ftp://example.com" },
          { zh: "工作室", en: "Studio", url: "/studio/settings/footer" },
          { zh: "From NT$4,000", en: "Rates", url: "https://example.com" },
          { zh: "繞路", en: "Detour", url: "/zh/../studio" },
          { zh: "斜線", en: "Slash", url: "https:/example.com" },
        ],
      }),
    );
    expect(invalid.status).toBe(422);
    const issues = invalid.body.issues as Array<Record<string, unknown>>;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "label",
          locale: "en",
          code: "required_locale",
        }),
        expect.objectContaining({
          field: "label",
          locale: "zh",
          code: "todo_content",
        }),
        expect.objectContaining({ field: "links.0.url", code: "invalid_url" }),
        expect.objectContaining({
          field: "links.1.url",
          code: "invalid_url",
          message: "Link to a public page of the site.",
        }),
        expect.objectContaining({
          field: "links.2.label",
          locale: "zh",
          code: "price_forbidden",
        }),
        expect.objectContaining({
          field: "links.3.url",
          code: "invalid_url",
          message: "Link to a public page of the site.",
        }),
        expect.objectContaining({ field: "links.4.url", code: "invalid_url" }),
      ]),
    );

    const brand = await act(
      saveEntries({
        id: work.id,
        fingerprint: work.fingerprint,
        label: { zh: "作品", en: `Work by ${DENIED}` },
        links: [
          {
            zh: "連結",
            en: "Link",
            url: `https://example.com/${DENIED.toLowerCase()}`,
          },
        ],
      }),
    );
    expect(brand.status).toBe(422);
    const brandIssues = brand.body.issues as Array<Record<string, unknown>>;
    expect(brandIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "label",
          locale: "en",
          code: "brand_name",
        }),
        expect.objectContaining({ field: "links.0.url", code: "brand_name" }),
      ]),
    );

    const noLinks = await act(
      saveEntries({
        id: work.id,
        fingerprint: work.fingerprint,
        label: { zh: "作品", en: "Work" },
      }),
    );
    expect(noLinks.status).toBe(422);
    expect(noLinks.body).toMatchObject({
      code: "invalid_request",
      message: "The links could not be read. Reload and try again.",
    });

    const navigate = await group("navigate");
    const builtInLinks = await act(
      saveEntries({
        id: navigate.id,
        fingerprint: navigate.fingerprint,
        label: { zh: "導覽", en: "Navigate" },
        links: [{ zh: "甲", en: "A", url: "https://example.com" }],
      }),
    );
    expect(builtInLinks.status).toBe(422);
    expect(builtInLinks.body.code).toBe("invalid_request");
    expect(String(builtInLinks.body.message)).toContain(
      "only its label can change here",
    );
    expect(await linkRows(work.id)).toEqual(rowsBefore);
  });

  it("renames a built-in group without touching its links", async () => {
    const navigate = await group("navigate");
    const before = (await publicFooter("en")).find(
      (item) => item.id === "navigate",
    );
    const saved = await act(
      saveEntries({
        id: navigate.id,
        fingerprint: navigate.fingerprint,
        label: { zh: "導覽", en: "Site" },
      }),
    );
    expect(saved.status).toBe(200);
    const after = (await publicFooter("en")).find(
      (item) => item.id === "navigate",
    );
    expect(after?.label).toBe("Site");
    expect(after?.links).toEqual(before?.links);
  });

  it("creates a custom group before Find Me; it appears once it has a shown link", async () => {
    const created = await act(
      saveEntries({
        label: { zh: "新群組", en: "New group" },
        enabled: true,
      }),
    );
    expect(created.status).toBe(200);
    const fresh = created.body.group as StudioFooterGroup;
    expect(fresh.key).toBe(`custom-${fresh.id}`);
    expect(fresh.kind).toBe("custom");
    const order = (await screen()).groups.map((item) => item.key);
    expect(order.indexOf(fresh.key)).toBe(order.indexOf("find_me") - 1);
    const orders = await sortOrders();
    expect(orders[fresh.key]).toBeLessThan(orders.find_me ?? 0);
    expect(orders[fresh.key]).toBeGreaterThan(orders.work_resources ?? 0);
    expect((await publicFooter("en")).map((item) => item.label)).not.toContain(
      "New group",
    );

    const withLink = await act(
      saveEntries({
        id: fresh.id,
        fingerprint: fresh.fingerprint,
        label: { zh: "新群組", en: "New group" },
        links: [{ zh: "新", en: "New", url: "https://example.com/new" }],
      }),
    );
    expect(withLink.status).toBe(200);
    expect((await publicFooter("en")).map((item) => item.label)).toEqual([
      "Navigate",
      "Services",
      "Work & Resources",
      "New group",
      "Contact",
      "Legal",
    ]);
  });

  it("caps the footer at 20 custom groups", async () => {
    await env.DB.batch(
      Array.from({ length: 19 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES (?1, ?1, ?2, 1)",
        ).bind(`cap-${index}`, 31 + index),
      ),
    );
    const count = async () =>
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM link_groups").first<{
          n: number;
        }>()
      )?.n;
    const before = await count();
    const refused = await act(
      saveEntries({ label: { zh: "多", en: "More" }, enabled: true }),
    );
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: "invalid_state",
      message: "The footer holds at most 20 custom groups.",
    });
    expect(await count()).toBe(before);
  });
});

describe("toggle-group", () => {
  const toggle = (id: string, enabled?: boolean) =>
    act([
      ["intent", "toggle-group"],
      ["id", id],
      ...(enabled === undefined
        ? []
        : ([["enabled:bool", String(enabled)]] as Entries)),
    ]);

  it("hides and shows a group", async () => {
    const hidden = await toggle("seed-work-resources", false);
    expect(hidden.status).toBe(200);
    expect((hidden.body.group as StudioFooterGroup).enabled).toBe(false);
    expect((await publicFooter()).map((item) => item.id)).not.toContain(
      "seed-work-resources",
    );
    await toggle("seed-work-resources", true);
    expect((await publicFooter()).map((item) => item.id)).toContain(
      "seed-work-resources",
    );
  });

  it("refuses Legal, a missing value and unknown groups", async () => {
    const legal = await toggle("seed-footer-legal", false);
    expect(legal.status).toBe(409);
    expect(legal.body).toMatchObject({
      code: "invalid_state",
      message: "The Legal group is always shown.",
    });
    const missing = await toggle("seed-work-resources");
    expect(missing.status).toBe(422);
    expect(missing.body.message).toBe("Say whether the group should be shown.");
    expect((await toggle("no-such-group", false)).status).toBe(404);
  });

  it("recreates a missing built-in row, unless the key lives under another id", async () => {
    await env.DB.prepare(
      "DELETE FROM link_groups WHERE id = 'seed-footer-contact'",
    ).run();
    const hidden = await toggle("seed-footer-contact", false);
    expect(hidden.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT stable_key, enabled FROM link_groups WHERE id = 'seed-footer-contact'",
    ).first();
    expect(row).toEqual({ stable_key: "contact", enabled: 0 });
    expect((await publicFooter()).map((item) => item.id)).not.toContain(
      "contact",
    );

    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM link_groups WHERE id = 'seed-footer-contact'",
      ),
      env.DB.prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('my-contact', 'contact', 50, 1)",
      ),
    ]);
    expect((await toggle("seed-footer-contact", false)).status).toBe(404);
    expect((await group("contact")).id).toBe("my-contact");
  });
});

describe("delete-group", () => {
  const remove = (id: string) =>
    act([
      ["intent", "delete-group"],
      ["id", id],
    ]);

  it("deletes a custom group with its labels and links", async () => {
    const removed = await remove("seed-work-resources");
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      intent: "delete-group",
      id: "seed-work-resources",
    });
    for (const sql of [
      "SELECT COUNT(*) AS n FROM link_groups WHERE id = 'seed-work-resources'",
      "SELECT COUNT(*) AS n FROM link_group_labels WHERE group_id = 'seed-work-resources'",
      "SELECT COUNT(*) AS n FROM links WHERE group_id = 'seed-work-resources'",
    ]) {
      expect((await env.DB.prepare(sql).first<{ n: number }>())?.n).toBe(0);
    }
  });

  it("refuses built-in groups and the legacy social group", async () => {
    const builtIn = await remove("seed-footer-navigate");
    expect(builtIn.status).toBe(409);
    expect(builtIn.body).toMatchObject({
      code: "invalid_state",
      message: "Built-in groups cannot be deleted. Hide the group instead.",
    });
    await insertLegacySocial();
    expect((await remove("admin-social")).status).toBe(404);
  });
});

describe("reorder", () => {
  const reorder = (ids: unknown) =>
    act([
      ["intent", "reorder"],
      ["ids", typeof ids === "string" ? ids : JSON.stringify(ids)],
    ]);

  it("stores the full order and the public footer follows it", async () => {
    const ids = (await screen()).groups.map((item) => item.id);
    const next = [...ids].reverse();
    const saved = await reorder(next);
    expect(saved.status).toBe(200);
    expect(saved.body.intent).toBe("reorder");
    const rows = await env.DB.prepare(
      "SELECT id, sort_order FROM link_groups ORDER BY sort_order",
    ).all<{ id: string; sort_order: number }>();
    expect(rows.results.map((row) => [row.id, row.sort_order])).toEqual(
      next.map((id, index) => [id, index * 10]),
    );
    expect((await publicFooter()).map((item) => item.id)).toEqual([
      "legal",
      "contact",
      "seed-work-resources",
      "services",
      "navigate",
    ]);
  });

  it("refuses a stale or unreadable list", async () => {
    const ids = (await screen()).groups.map((item) => item.id);
    const stale = await reorder(ids.slice(1));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: "stale_revision",
      message: "The footer changed elsewhere. Reload and try again.",
    });
    const unreadable = await reorder("not json");
    expect(unreadable.status).toBe(422);
    expect(unreadable.body.message).toBe(
      "The new order could not be read. Reload and try again.",
    );
  });
});

describe("other intents and sources", () => {
  it("answers 422 to an unknown intent", async () => {
    const result = await act([["intent", "publish"]]);
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("unknown_intent");
  });

  it("follows the header navigation visibility", async () => {
    await env.DB.prepare(
      `UPDATE settings SET data_json = json_set(data_json, '$.navigation.items', json(?))
       WHERE key = 'site'`,
    )
      .bind(
        JSON.stringify([
          { key: "work", visible: true },
          { key: "services", visible: true },
          { key: "about", visible: true },
          { key: "writing", visible: false },
        ]),
      )
      .run();
    const navigate = (await publicFooter()).find(
      (item) => item.id === "navigate",
    );
    expect(navigate?.links.map((link) => link.url)).toEqual([
      "/en/works",
      "/en/services",
      "/en/about",
    ]);
  });

  it("reads legacy /admin/links rows and moves them back with one reorder", async () => {
    await insertLegacySocial();
    const links = Array.from({ length: 8 }, (_, index) => index);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('admin-footer', 'footer', 100, 1)",
      ),
      env.DB.prepare(
        "INSERT INTO link_group_labels (group_id, locale, label) VALUES ('admin-footer', 'zh', '更多'), ('admin-footer', 'en', 'More')",
      ),
      ...links.flatMap((index) =>
        (["zh", "en"] as const).map((locale) =>
          env.DB.prepare(
            "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES (?, 'admin-footer', ?, ?, ?, ?, 1)",
          ).bind(
            `admin-footer-${index}-${locale}`,
            locale,
            `Link ${index}`,
            `https://example.com/more-${index}`,
            index,
          ),
        ),
      ),
    ]);
    for (const locale of ["zh", "en"] as const) {
      const footer = await publicFooter(locale);
      expect(
        footer.find((item) => item.id === "admin-footer")?.links,
      ).toHaveLength(8);
      expect(footer.map((item) => item.id)).not.toContain("admin-social");
    }
    expect((await publicFooter("en")).map((item) => item.label)).toEqual([
      "Navigate",
      "Services",
      "Work & Resources",
      "Contact",
      "Legal",
      "More",
    ]);

    const loaded = await screen();
    expect(loaded.groups.map((item) => item.id)).not.toContain("admin-social");
    const legacy = loaded.groups.find((item) => item.id === "admin-footer");
    expect(legacy?.links).toHaveLength(8);
    expect(legacy?.links.every((link) => link.notes.length === 0)).toBe(true);

    const ids = loaded.groups
      .map((item) => item.id)
      .filter((id) => id !== "admin-footer");
    ids.splice(ids.indexOf("seed-footer-find-me"), 0, "admin-footer");
    expect(
      (
        await act([
          ["intent", "reorder"],
          ["ids", JSON.stringify(ids)],
        ])
      ).status,
    ).toBe(200);
    expect((await publicFooter("en")).map((item) => item.label)).toEqual([
      "Navigate",
      "Services",
      "Work & Resources",
      "More",
      "Contact",
      "Legal",
    ]);
  });

  it("previews exactly what the public footer shows", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES ('legacy-zh-only', 'seed-work-resources', 'zh', '只有中文', 'https://example.com/zh-only', 5, 1)",
      ),
      // Legacy pairs whose rows disagree: the public footer reads each
      // locale's own row (flag and address), so the preview must too.
      env.DB.prepare(
        `INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES
           ('flag-zh', 'seed-work-resources', 'zh', '中文才顯示', 'https://example.com/flag', 6, 1),
           ('flag-en', 'seed-work-resources', 'en', 'Hidden in EN', 'https://example.com/flag', 6, 0),
           ('unsafe-zh', 'seed-work-resources', 'zh', '安全網址', 'https://example.com/safe', 7, 1),
           ('unsafe-en', 'seed-work-resources', 'en', 'Unsafe in EN', 'http://example.com/unsafe', 7, 1),
           ('split-zh', 'seed-work-resources', 'zh', '中文網址', 'https://example.com/zh-address', 8, 1),
           ('split-en', 'seed-work-resources', 'en', 'EN address', 'https://example.com/en-address', 8, 1)`,
      ),
      env.DB.prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('hidden-custom', 'hidden_custom', 35, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO link_group_labels (group_id, locale, label) VALUES ('hidden-custom', 'zh', '隱藏群組'), ('hidden-custom', 'en', 'Secret hidden group')",
      ),
      env.DB.prepare(
        "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES ('hidden-custom-zh', 'hidden-custom', 'zh', '祕密', 'https://example.com/secret', 0, 1), ('hidden-custom-en', 'hidden-custom', 'en', 'Secret', 'https://example.com/secret', 0, 1)",
      ),
      env.DB.prepare(
        "INSERT INTO social_links (id, platform, label_i18n, url, enabled, sort_order, created_at, updated_at) VALUES ('s-ig', 'instagram', ?1, 'https://instagram.com/kamel', 1, 0, ?2, ?2), ('s-zh', 'other', ?3, 'https://example.com/zh-social', 1, 1, ?2, ?2)",
      ).bind(
        JSON.stringify({ zh: "IG", en: "Instagram" }),
        now.toISOString(),
        JSON.stringify({ zh: "中文社群", en: "" }),
      ),
    ]);
    const loaded = await screen();
    for (const locale of ["zh", "en"] as const) {
      expect(
        composeFooterGroups(
          localizeRecords(loaded.groups, loaded.sources, locale),
        ),
      ).toEqual(await publicFooter(locale));
    }
    expect(
      (await publicFooter("zh"))
        .find((item) => item.id === "seed-work-resources")
        ?.links.map((link) => link.label),
    ).toEqual(
      expect.arrayContaining([
        "只有中文",
        "中文才顯示",
        "安全網址",
        "中文網址",
      ]),
    );
    const english = (await publicFooter("en")).find(
      (item) => item.id === "seed-work-resources",
    )?.links;
    expect(english?.map((link) => link.label)).not.toContain("Hidden in EN");
    expect(english?.map((link) => link.label)).not.toContain("Unsafe in EN");
    expect(english?.find((link) => link.label === "EN address")?.url).toBe(
      "https://example.com/en-address",
    );
  });

  it("tells the social links screen how the Find Me group is set", async () => {
    expect((await loadSocialLinks({ db: env.DB })).findMe).toEqual({
      label: { zh: "社群", en: "Find Me" },
      enabled: true,
    });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE link_group_labels SET label = 'Elsewhere' WHERE group_id = 'seed-footer-find-me' AND locale = 'en'",
      ),
      env.DB.prepare(
        "UPDATE link_groups SET enabled = 0 WHERE id = 'seed-footer-find-me'",
      ),
    ]);
    expect((await loadSocialLinks({ db: env.DB })).findMe).toEqual({
      label: { zh: "社群", en: "Elsewhere" },
      enabled: false,
    });
    await env.DB.prepare(
      "DELETE FROM link_groups WHERE id = 'seed-footer-find-me'",
    ).run();
    expect((await loadSocialLinks({ db: env.DB })).findMe).toEqual({
      label: { zh: "社群", en: "Find Me" },
      enabled: true,
    });
  });

  it("never sends a hidden group's label to the page", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('hidden-custom', 'hidden_custom', 35, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO link_group_labels (group_id, locale, label) VALUES ('hidden-custom', 'zh', '隱藏群組'), ('hidden-custom', 'en', 'Secret hidden group')",
      ),
      env.DB.prepare(
        "INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES ('hidden-custom-en', 'hidden-custom', 'en', 'Secret', 'https://example.com/secret', 0, 1)",
      ),
    ]);
    for (const locale of ["zh", "en"] as const) {
      const serialized = JSON.stringify(
        await getPublicSiteContext(env.DB, testEnv, locale),
      );
      expect(serialized).not.toContain("隱藏群組");
      expect(serialized).not.toContain("Secret hidden group");
      expect(serialized).not.toContain("example.com/secret");
    }
  });

  it("never sends the social links of a hidden Find Me group to the page", async () => {
    await env.DB.prepare(
      "INSERT INTO social_links (id, platform, label_i18n, url, username, enabled, sort_order, created_at, updated_at) VALUES ('s-secret', 'instagram', ?1, 'https://instagram.com/hidden-handle', 'hidden-handle', 1, 0, ?2, ?2)",
    )
      .bind(
        JSON.stringify({ zh: "祕密社群", en: "Secret social" }),
        now.toISOString(),
      )
      .run();
    const shown = await getPublicSiteContext(env.DB, testEnv, "en");
    expect(
      shown.footerGroups.find((item) => item.id === "find_me")?.links,
    ).toEqual([
      {
        id: "s-secret",
        label: "Secret social",
        url: "https://instagram.com/hidden-handle",
      },
    ]);

    const hidden = await act([
      ["intent", "toggle-group"],
      ["id", "seed-footer-find-me"],
      ["enabled:bool", "false"],
    ]);
    expect(hidden.status).toBe(200);
    for (const locale of ["zh", "en"] as const) {
      const site = await getPublicSiteContext(env.DB, testEnv, locale);
      expect(site.footerGroups.map((item) => item.id)).not.toContain("find_me");
      const serialized = JSON.stringify(site);
      expect(serialized).not.toContain("祕密社群");
      expect(serialized).not.toContain("Secret social");
      expect(serialized).not.toContain("hidden-handle");
    }
  });
});
