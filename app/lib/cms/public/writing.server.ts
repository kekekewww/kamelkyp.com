/**
 * Public writing reads (content-schema §2.5). An entry with an external URL
 * and no internal content is a card that links out and has no detail page.
 * Order: date DESC, sort_order. Home: featured first, then newest.
 */
import type { Env } from "../../env.server";
import { resolveRedirect } from "../db/redirects.server";
import type { Locale } from "../types";
import {
  buildWritingItem,
  buildWritingView,
  isWritingVisible,
  writingHasDetail,
  writingHref,
} from "./build-views";
import {
  buildViewContext,
  featuredFirst,
  type ParsedRow,
  readEntities,
} from "./read.server";
import type {
  DetailResult,
  PublicWritingDetail,
  PublicWritingItem,
  ReadMode,
} from "./view-models";

function publicOrder(a: ParsedRow<"writing">, b: ParsedRow<"writing">) {
  return (
    (b.content.date ?? "").localeCompare(a.content.date ?? "") ||
    a.row.sort_order - b.row.sort_order
  );
}

export async function listPublicWriting(
  db: D1Database,
  env: Env,
  locale: Locale,
  query: { limit?: number; home?: boolean; mode?: ReadMode } = {},
): Promise<PublicWritingItem[]> {
  const mode = query.mode ?? "published";
  let rows = (await readEntities(db, "writing", mode))
    .filter(
      (item) =>
        (mode === "preview" || item.content.listed) &&
        isWritingVisible(item.content, locale),
    )
    .sort(publicOrder);
  if (query.home) {
    rows = featuredFirst(rows, query.limit ?? rows.length);
  } else if (query.limit !== undefined) {
    rows = rows.slice(0, Math.max(0, query.limit));
  }
  const context = await buildViewContext(
    db,
    env,
    "writing",
    rows.map((item) => item.content),
    mode,
  );
  return rows.map((item) =>
    buildWritingItem(item.content, locale, context, item.facts),
  );
}

export async function getPublicWriting(
  db: D1Database,
  env: Env,
  locale: Locale,
  slug: string,
  options: { mode?: ReadMode; id?: string } = {},
): Promise<DetailResult<"writing", PublicWritingDetail>> {
  const mode = options.mode ?? "published";
  const rows =
    mode === "preview" && options.id
      ? await readEntities(db, "writing", mode, {
          where: "t.id = ?",
          binds: [options.id],
        })
      : await readEntities(db, "writing", "published", {
          where: "t.published_slug = ?",
          binds: [slug],
        });
  const item = rows[0];
  if (!item) {
    if (mode === "published") {
      const target = await resolveRedirect(db, "writing", slug);
      if (target) return { kind: "redirect", to: writingHref(locale, target) };
    }
    return { kind: "missing" };
  }
  if (
    !isWritingVisible(item.content, locale) ||
    !writingHasDetail(item.content, locale)
  ) {
    return { kind: "missing" };
  }
  const context = await buildViewContext(
    db,
    env,
    "writing",
    [item.content],
    mode,
  );
  return {
    kind: "found",
    writing: buildWritingView(item.content, locale, context, item.facts),
  };
}
