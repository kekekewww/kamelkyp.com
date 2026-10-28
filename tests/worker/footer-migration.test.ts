/**
 * Migration 0010 (wp3 spec §7, §6.2): the five built-in footer groups get
 * `link_groups` rows that wrap the existing groups, so the public order is
 * unchanged; re-running it changes nothing.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { FOOTER_SYSTEM_GROUPS } from "../../app/lib/cms/public/footer";
import { getPublicSiteContext } from "../../app/lib/cms/public/site.server";
import { ensureFooterSystemGroupStatements } from "../../app/lib/cms/repositories/footer.server";
import { applyMigrationQueries } from "../helpers/cms";
import { createTestEnv } from "../helpers/test-env";

const testEnv = createTestEnv({ DB: env.DB });

// The personal-name pattern of cms-schema.test.ts, assembled at runtime so
// no name variant is spelled out in this file.
const DENY = new RegExp(
  [
    ["楊", "子", "賢"],
    ["子", "賢"],
    ["ke", "vin"],
    ["ya", "ung"],
    ["\\by", "ang\\b"],
  ]
    .map((parts) => parts.join(""))
    .join("|"),
  "i",
);

type GroupRow = {
  id: string;
  stable_key: string;
  sort_order: number;
  enabled: number;
};

async function groups(): Promise<GroupRow[]> {
  const result = await env.DB.prepare(
    "SELECT id, stable_key, sort_order, enabled FROM link_groups ORDER BY sort_order, id",
  ).all<GroupRow>();
  return result.results;
}

async function labels(): Promise<Record<string, string>> {
  const result = await env.DB.prepare(
    "SELECT group_id, locale, label FROM link_group_labels ORDER BY group_id, locale",
  ).all<{ group_id: string; locale: string; label: string }>();
  return Object.fromEntries(
    result.results.map((row) => [`${row.group_id}.${row.locale}`, row.label]),
  );
}

async function reapply() {
  await applyMigrationQueries(env.DB, env.TEST_MIGRATIONS, ["0010"]);
}

const SEEDED = [
  ["seed-footer-navigate", "navigate", 10],
  ["seed-footer-services", "services", 20],
  ["seed-work-resources", "work_resources", 30],
  ["seed-footer-find-me", "find_me", 40],
  ["seed-footer-contact", "contact", 50],
  ["seed-footer-legal", "legal", 60],
] as const;

async function deleteGroups(where: string) {
  for (const table of ["links", "link_group_labels"]) {
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE group_id IN (SELECT id FROM link_groups WHERE ${where})`,
    ).run();
  }
  await env.DB.prepare(`DELETE FROM link_groups WHERE ${where}`).run();
}

describe("migration 0010", () => {
  it("wraps the seeded Work & Resources group with the built-in groups", async () => {
    expect(
      (await groups()).map((row) => [row.id, row.stable_key, row.sort_order]),
    ).toEqual(SEEDED.map((row) => [...row]));
    expect((await groups()).every((row) => row.enabled === 1)).toBe(true);
    const stored = await labels();
    for (const group of Object.values(FOOTER_SYSTEM_GROUPS)) {
      expect(stored[`${group.seedId}.zh`]).toBe(group.label.zh);
      expect(stored[`${group.seedId}.en`]).toBe(group.label.en);
    }
    for (const table of ["link_groups", "link_group_labels", "links"]) {
      const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows.results) {
        expect(JSON.stringify(row), table).not.toMatch(DENY);
      }
    }
  });

  it("changes nothing when it runs again and keeps an edited label", async () => {
    await env.DB.prepare(
      "UPDATE link_group_labels SET label = 'Site' WHERE group_id = 'seed-footer-navigate' AND locale = 'en'",
    ).run();
    await env.DB.prepare(
      "UPDATE link_groups SET sort_order = 70, enabled = 0 WHERE id = 'seed-footer-contact'",
    ).run();
    const beforeGroups = await groups();
    const beforeLabels = await labels();
    await reapply();
    expect(await groups()).toEqual(beforeGroups);
    expect(await labels()).toEqual(beforeLabels);
    expect(beforeLabels["seed-footer-navigate.en"]).toBe("Site");
    // Restore the seeded state for the other cases.
    await env.DB.prepare(
      "UPDATE link_group_labels SET label = 'Navigate' WHERE group_id = 'seed-footer-navigate' AND locale = 'en'",
    ).run();
    await env.DB.prepare(
      "UPDATE link_groups SET sort_order = 50, enabled = 1 WHERE id = 'seed-footer-contact'",
    ).run();
  });

  it("recreates the same rows through ensureFooterSystemGroupStatements", async () => {
    const before = await groups();
    const beforeLabels = await labels();
    await deleteGroups("id GLOB 'seed-footer-*'");
    expect((await groups()).map((row) => row.id)).toEqual([
      "seed-work-resources",
    ]);
    await env.DB.batch(ensureFooterSystemGroupStatements(env.DB));
    expect(await groups()).toEqual(before);
    expect(await labels()).toEqual(beforeLabels);
  });

  it("places the built-in groups around legacy groups (runs last)", async () => {
    await deleteGroups(
      "id GLOB 'seed-footer-*' OR id = 'seed-work-resources' OR id GLOB 'admin-*'",
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO link_groups (id, stable_key, sort_order, enabled) VALUES ('admin-footer', 'footer', 100, 1), ('admin-social', 'social', 10, 1)",
      ),
      env.DB.prepare(
        "INSERT INTO link_group_labels (group_id, locale, label) VALUES ('admin-footer', 'zh', '更多'), ('admin-footer', 'en', 'More')",
      ),
      env.DB.prepare(
        `INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled) VALUES
           ('admin-footer-0-zh', 'admin-footer', 'zh', 'Shop', 'https://example.com/shop', 0, 1),
           ('admin-footer-0-en', 'admin-footer', 'en', 'Shop', 'https://example.com/shop', 0, 1),
           ('admin-footer-1-zh', 'admin-footer', 'zh', 'Blog', 'https://example.com/blog', 1, 1),
           ('admin-footer-1-en', 'admin-footer', 'en', 'Blog', 'https://example.com/blog', 1, 1),
           ('admin-social-0-zh', 'admin-social', 'zh', 'IG', 'https://instagram.com/kamel', 0, 1)`,
      ),
    ]);
    await reapply();
    expect(
      (await groups()).map((row) => [row.stable_key, row.sort_order]),
    ).toEqual([
      ["social", 10],
      ["navigate", 80],
      ["services", 90],
      ["footer", 100],
      ["find_me", 110],
      ["contact", 120],
      ["legal", 130],
    ]);
    const site = await getPublicSiteContext(env.DB, testEnv, "en");
    expect(site.footerGroups.map((group) => group.label)).toEqual([
      "Navigate",
      "Services",
      "More",
      "Contact",
      "Legal",
    ]);
  });
});
