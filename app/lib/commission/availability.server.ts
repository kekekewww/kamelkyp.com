/**
 * Commission availability (wp2 §4.6). One definition of "open" for the public
 * category chooser, the wizard and the Studio readiness tables: a commission
 * service accepts commissions in a locale when it has an active price rule
 * and the common terms, the privacy notice and its own service terms are
 * published and effective in that locale. Missing rows close the form
 * gracefully (404 / empty state), never with a 500.
 */
import { getCommissionServiceNames } from "../cms/public/services.server";
import type { EntryStatus, Locale } from "../cms/types";
import {
  type FxSnapshot,
  getUsableFxSnapshot,
} from "../pricing/fx-repository.server";
import { getActivePriceRule } from "../pricing/price-repository.server";
import type { PriceRule } from "../pricing/types";
import { SERVICE_IDS, type ServiceId } from "../services/service-id";
import { SERVICE_TERM_DOCUMENT, type TermDocumentId } from "./term-outline";
import {
  getActiveTerms,
  type PublishedTermDocument,
} from "./terms-repository.server";

export type CommissionReadiness = {
  serviceId: ServiceId;
  /** Status of the marketing row (`services`), null when it is missing. */
  serviceStatus: EntryStatus | null;
  /** The active price rule. */
  price: { versionId: string; baseTwd: number } | null;
  /** Common + privacy + the service document, effective now, per locale. */
  terms: Record<Locale, { ready: boolean; missing: TermDocumentId[] }>;
  open: Record<Locale, boolean>;
};

const LOCALES: readonly Locale[] = ["zh", "en"];

async function activePrice(
  db: D1Database,
  serviceId: ServiceId,
  at: string,
): Promise<PriceRule | null> {
  try {
    return await getActivePriceRule(db, serviceId, at);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "active_price_rule_not_found"
    )
      return null;
    throw error;
  }
}

export async function getCommissionReadiness(
  db: D1Database,
  now: Date,
): Promise<CommissionReadiness[]> {
  const at = now.toISOString();
  const [statusRows, pointerRows, prices] = await Promise.all([
    db
      .prepare(
        "SELECT commission_service_id AS id, status FROM services WHERE commission_service_id IS NOT NULL",
      )
      .all<{ id: ServiceId; status: EntryStatus }>(),
    db
      .prepare(
        "SELECT document_id, locale FROM term_publications WHERE effective_from <= ?",
      )
      .bind(at)
      .all<{ document_id: TermDocumentId; locale: Locale }>(),
    Promise.all(SERVICE_IDS.map((id) => activePrice(db, id, at))),
  ]);
  const statuses = new Map(
    statusRows.results.map((row) => [row.id, row.status]),
  );
  const effective = new Set(
    pointerRows.results.map((row) => `${row.document_id}:${row.locale}`),
  );

  return SERVICE_IDS.map((serviceId, index) => {
    const rule = prices[index] ?? null;
    const required: TermDocumentId[] = [
      "common",
      "privacy",
      SERVICE_TERM_DOCUMENT[serviceId],
    ];
    const terms = {} as CommissionReadiness["terms"];
    const open = {} as CommissionReadiness["open"];
    for (const locale of LOCALES) {
      const missing = required.filter(
        (documentId) => !effective.has(`${documentId}:${locale}`),
      );
      terms[locale] = { ready: missing.length === 0, missing };
      open[locale] = rule !== null && missing.length === 0;
    }
    return {
      serviceId,
      serviceStatus: statuses.get(serviceId) ?? null,
      price: rule ? { versionId: rule.versionId, baseTwd: rule.baseTwd } : null,
      terms,
      open,
    };
  });
}

/**
 * Everything the public wizard needs, or null when the service is closed
 * (no active price or terms). A missing or stale FX snapshot only makes US$
 * unavailable on the English wizard; prepare/submit still refuse without it.
 */
export async function loadCommissionWizard(
  db: D1Database,
  locale: Locale,
  serviceId: ServiceId,
  now: Date,
): Promise<{
  priceRule: PriceRule;
  terms: PublishedTermDocument[];
  serviceName: string;
  fxSnapshot: FxSnapshot | null;
} | null> {
  const at = now.toISOString();
  let priceRule: PriceRule;
  let terms: PublishedTermDocument[];
  try {
    [priceRule, terms] = await Promise.all([
      getActivePriceRule(db, serviceId, at),
      getActiveTerms(db, serviceId, locale, at),
    ]);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "active_price_rule_not_found" ||
      code === "active_terms_unavailable"
    ) {
      return null;
    }
    throw error;
  }
  const names = await getCommissionServiceNames(db, locale);
  let fxSnapshot: FxSnapshot | null = null;
  if (locale === "en") {
    try {
      fxSnapshot = await getUsableFxSnapshot(db, at.slice(0, 10));
    } catch (error) {
      const code = error instanceof Error ? error.message : "fx_unknown_error";
      if (code !== "fx_rate_missing" && code !== "fx_rate_stale") throw error;
      console.warn("commission_fx_unavailable", code);
    }
  }
  return {
    priceRule,
    terms,
    serviceName: names[serviceId] ?? serviceId,
    fxSnapshot,
  };
}
