/**
 * Public service reads (content-schema §2.6, content-architecture §3.5).
 * Commission-linked rows are always priced from the active `price_versions`
 * rule (`getActivePriceRule`), the same rule the wizard locks into a case:
 * one source of truth, no drift between the page and the quote.
 */
import type { Env } from "../../env.server";
import { getActivePriceRule } from "../../pricing/price-repository.server";
import type { ServiceId } from "../../services/service-id";
import type { ServiceAreaKey } from "../schemas/site-settings";
import type { Term } from "../schemas/taxonomy";
import type { Locale } from "../types";
import { buildServiceItem, isServiceVisible } from "./build-views";
import {
  buildViewContext,
  loadTerms,
  type ParsedRow,
  readEntities,
} from "./read.server";
import type { PublicServiceItem, ReadMode } from "./view-models";

const AREAS = new Set<ServiceAreaKey>([
  "mixing",
  "song_transition",
  "software",
]);

function areaOf(
  groupTermId: string | null,
  terms: ReadonlyMap<string, Term>,
): ServiceAreaKey | null {
  const area = groupTermId ? terms.get(groupTermId)?.data.area : null;
  return typeof area === "string" && AREAS.has(area as ServiceAreaKey)
    ? (area as ServiceAreaKey)
    : null;
}

async function activeBaseTwd(
  db: D1Database,
  serviceId: ServiceId,
  at: string,
): Promise<number | null> {
  try {
    return (await getActivePriceRule(db, serviceId, at)).baseTwd;
  } catch {
    return null;
  }
}

async function buildItems(
  db: D1Database,
  env: Env,
  locale: Locale,
  rows: ParsedRow<"service">[],
  mode: ReadMode,
  now: Date,
): Promise<PublicServiceItem[]> {
  const context = await buildViewContext(
    db,
    env,
    "service",
    rows.map((item) => item.content),
    mode,
  );
  const at = now.toISOString();
  return Promise.all(
    rows.map(async (item) =>
      buildServiceItem(item.content, locale, context, {
        ...item.facts,
        area: areaOf(item.content.groupTermId, context.terms),
        commissionBaseTwd: item.content.commissionServiceId
          ? await activeBaseTwd(db, item.content.commissionServiceId, at)
          : null,
      }),
    ),
  );
}

export async function listPublicServices(
  db: D1Database,
  env: Env,
  locale: Locale,
  query: { area?: ServiceAreaKey; mode?: ReadMode; now?: Date } = {},
): Promise<PublicServiceItem[]> {
  const mode = query.mode ?? "published";
  const terms = await loadTerms(db);
  const groupOrder = (id: string | null) =>
    (id ? terms.get(id)?.sortOrder : undefined) ?? Number.MAX_SAFE_INTEGER;
  const rows = (await readEntities(db, "service", mode))
    .filter(
      (item) =>
        isServiceVisible(item.content, locale) &&
        (!query.area || areaOf(item.content.groupTermId, terms) === query.area),
    )
    .sort(
      (a, b) =>
        groupOrder(a.content.groupTermId) - groupOrder(b.content.groupTermId) ||
        a.row.sort_order - b.row.sort_order,
    );
  return buildItems(db, env, locale, rows, mode, query.now ?? new Date());
}

/** Marketing view of one commission service; null while it is unpublished. */
export async function getCommissionServiceView(
  db: D1Database,
  env: Env,
  locale: Locale,
  serviceId: ServiceId,
  now: Date = new Date(),
  options: { mode?: ReadMode } = {},
): Promise<PublicServiceItem | null> {
  const mode = options.mode ?? "published";
  const rows = (
    await readEntities(db, "service", mode, {
      where: "t.commission_service_id = ?",
      binds: [serviceId],
    })
  ).filter((item) => isServiceVisible(item.content, locale));
  if (rows.length === 0) return null;
  const [item] = await buildItems(db, env, locale, rows, mode, now);
  return item ?? null;
}

/**
 * "From" prices per area: the lowest active base price among published
 * commission-linked services of the area.
 */
export async function getAreaStartingPrices(
  db: D1Database,
  now: Date,
): Promise<{ mixing: number | null; song_transition: number | null }> {
  const [rows, terms] = await Promise.all([
    readEntities(db, "service", "published", {
      where: "t.commission_service_id IS NOT NULL",
    }),
    loadTerms(db),
  ]);
  const result: { mixing: number | null; song_transition: number | null } = {
    mixing: null,
    song_transition: null,
  };
  const at = now.toISOString();
  for (const item of rows) {
    const area = areaOf(item.content.groupTermId, terms);
    const serviceId = item.content.commissionServiceId;
    if ((area !== "mixing" && area !== "song_transition") || !serviceId) {
      continue;
    }
    const base = await activeBaseTwd(db, serviceId, at);
    if (base === null) continue;
    const current = result[area];
    result[area] = current === null ? base : Math.min(current, base);
  }
  return result;
}
