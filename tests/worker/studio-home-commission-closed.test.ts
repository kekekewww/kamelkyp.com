/**
 * Studio home "Commission form closed" (plan §9 C3 f, brief §26). A file of
 * its own: it publishes every term document, and term versions are
 * immutable, so no other home test would see a fresh database again.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getStudioHome } from "../../app/lib/cms/repositories/studio-home.server";
import { getStudioCounts } from "../../app/lib/cms/studio/attention.server";
import { TERM_DOCUMENT_IDS } from "../../app/lib/commission/term-outline";

// Seeded prices are active from 2026-08-10.
const NOW = new Date("2026-10-28T00:00:00.000Z");
const BODY = '[{"key":"test","title":"Test","text":"Test terms"}]';
const EFFECTIVE = "2026-08-10T00:00:00Z";

async function publish(documentId: string, locale: "zh" | "en") {
  const id = `closed-${documentId}-${locale}`;
  await env.DB.prepare(
    "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) " +
      "VALUES (?, ?, ?, 1, ?, ?, ?)",
  )
    .bind(id, documentId, locale, BODY, EFFECTIVE, EFFECTIVE)
    .run();
  await env.DB.prepare(
    "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
  )
    .bind(documentId, locale, id, EFFECTIVE)
    .run();
}

async function closedRow(at = NOW) {
  const home = await getStudioHome(env.DB, at);
  return {
    home,
    row: home.attention.find((item) => item.key === "commission-closed"),
  };
}

describe("needs attention: commission form closed", () => {
  it("is one high row on a fresh database, naming the missing documents", async () => {
    const { home, row } = await closedRow();
    expect(row).toEqual({
      key: "commission-closed",
      severity: "high",
      title: "Commission form closed: 4 services",
      detail:
        "terms missing: General terms (ZH), Privacy notice (ZH), Service terms (ZH), General terms (EN), Privacy notice (EN), Service terms (EN)",
      href: "/studio/services/terms",
      action: "Open terms",
      count: 4,
    });
    expect(
      home.attention.filter((item) => item.key === "commission-closed"),
    ).toHaveLength(1);
    const counts = await getStudioCounts(env.DB, NOW);
    expect(counts.attention).toBe(home.attention.length);
  });

  it("links to Pricing when a service has no active price", async () => {
    const { row } = await closedRow(new Date("2026-01-01T00:00:00.000Z"));
    expect(row).toMatchObject({
      href: "/studio/services/pricing",
      action: "Open pricing",
    });
    expect(row?.detail).toMatch(/^no active price; terms missing: /);
  });

  it("counts only services whose form is closed in a locale", async () => {
    for (const locale of ["zh", "en"] as const) {
      await publish("common", locale);
      await publish("privacy", locale);
      await publish("full-mix", locale);
    }
    await publish("vocal-mix", "zh");
    const { row } = await closedRow();
    expect(row?.title).toBe("Commission form closed: 3 services");
    expect(row?.detail).toBe(
      "terms missing: Service terms (ZH), Service terms (EN)",
    );
    expect(row?.count).toBe(3);
  });

  it("ignores a service whose marketing row is not published", async () => {
    await env.DB.prepare(
      "UPDATE services SET status = 'draft' WHERE commission_service_id IN ('simple_transition', 'edit_transition')",
    ).run();
    try {
      const { row } = await closedRow();
      expect(row?.title).toBe("Commission form closed: 1 service");
      expect(row?.detail).toBe("terms missing: Service terms (EN)");
    } finally {
      await env.DB.prepare(
        "UPDATE services SET status = 'published' WHERE commission_service_id IN ('simple_transition', 'edit_transition')",
      ).run();
    }
  });

  it("is gone once every document is published in both locales", async () => {
    const published = new Set(
      (
        await env.DB.prepare(
          "SELECT document_id || ':' || locale AS key FROM term_publications",
        ).all<{ key: string }>()
      ).results.map((item) => item.key),
    );
    for (const documentId of TERM_DOCUMENT_IDS) {
      for (const locale of ["zh", "en"] as const) {
        if (!published.has(`${documentId}:${locale}`)) {
          await publish(documentId, locale);
        }
      }
    }
    const { home, row } = await closedRow();
    expect(row).toBeUndefined();
    const counts = await getStudioCounts(env.DB, NOW);
    expect(counts.attention).toBe(home.attention.length);
  });
});
