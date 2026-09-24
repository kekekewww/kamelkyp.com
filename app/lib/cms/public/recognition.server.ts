/**
 * Public recognition reads (content-schema §2.4). Order: year DESC, date DESC
 * (nulls last), sort_order. Home: featured first, then newest, up to the
 * configured count. Visual grouping is the frontend's choice.
 */
import type { Env } from "../../env.server";
import type { Locale } from "../types";
import { buildRecognitionItem, isRecognitionVisible } from "./build-views";
import {
  buildViewContext,
  featuredFirst,
  type ParsedRow,
  readEntities,
} from "./read.server";
import type { PublicRecognitionItem, ReadMode } from "./view-models";

function publicOrder(a: ParsedRow<"recognition">, b: ParsedRow<"recognition">) {
  return (
    (b.content.year ?? -1) - (a.content.year ?? -1) ||
    (b.content.date ?? "").localeCompare(a.content.date ?? "") ||
    a.row.sort_order - b.row.sort_order
  );
}

export async function listPublicRecognition(
  db: D1Database,
  env: Env,
  locale: Locale,
  query: { limit?: number; home?: boolean; mode?: ReadMode } = {},
): Promise<PublicRecognitionItem[]> {
  const mode = query.mode ?? "published";
  let rows = (await readEntities(db, "recognition", mode))
    .filter((item) => isRecognitionVisible(item.content, locale))
    .sort(publicOrder);
  if (query.home) {
    rows = featuredFirst(rows, query.limit ?? rows.length);
  } else if (query.limit !== undefined) {
    rows = rows.slice(0, Math.max(0, query.limit));
  }
  const context = await buildViewContext(
    db,
    env,
    "recognition",
    rows.map((item) => item.content),
    mode,
  );
  return rows.map((item) =>
    buildRecognitionItem(item.content, locale, context, item.facts),
  );
}
