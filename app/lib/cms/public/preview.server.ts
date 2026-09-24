/**
 * Studio preview reads (admin-architecture §2.4, content-architecture §3.8).
 * Only `/studio/preview/*` calls these (owner-guarded, no-store, noindex).
 *
 * - GET: the row's working copy through the same snapshot view that Publish
 *   uses, so preview and publish render through one parser. Drafts and
 *   TODO_CONTENT samples are included (badged); archived rows are not.
 * - POST (unsaved form): the editor's form parsed with the draft schema;
 *   nothing is written.
 *
 * Unlike public reads, a row whose required text is empty in the previewed
 * locale still renders (as empty), never with the other locale's text.
 */
import type { Env } from "../../env.server";
import {
  type FxSnapshot,
  getUsableFxSnapshot,
} from "../../pricing/fx-repository.server";
import { getActivePriceRule } from "../../pricing/price-repository.server";
import { type ContentOf, descriptorFor } from "../db/tables.server";
import { formDataToObject } from "../forms";
import type { EntityType, Locale } from "../types";
import {
  buildMusicItem,
  buildProjectView,
  buildRecognitionItem,
  buildServiceItem,
  buildWritingItem,
  buildWritingView,
  writingHasDetail,
} from "./build-views";
import { listProjectMusic } from "./music.server";
import { buildViewContext, readEntities } from "./read.server";
import type {
  EntryFacts,
  PublicMusicItem,
  PublicProjectDetail,
  PublicRecognitionItem,
  PublicServiceItem,
  PublicWritingDetail,
  PublicWritingItem,
} from "./view-models";

/** `?locale=zh|en` (default zh). */
export function previewLocale(request: Request): Locale {
  return new URL(request.url).searchParams.get("locale") === "en" ? "en" : "zh";
}

/** `?drafts=1`: the home preview includes drafts (working copies). */
export function previewIncludesDrafts(request: Request): boolean {
  return new URL(request.url).searchParams.get("drafts") === "1";
}

/** The FX snapshot en pages show US$ with; null when unavailable (quiet). */
export async function previewFxSnapshot(
  db: D1Database,
  locale: Locale,
  now: Date = new Date(),
): Promise<FxSnapshot | null> {
  if (locale === "zh") return null;
  try {
    return await getUsableFxSnapshot(db, now.toISOString().slice(0, 10));
  } catch {
    return null;
  }
}

type Source<T extends EntityType> = {
  content: ContentOf<T>;
  facts: EntryFacts;
  commissionServiceId?: string | null;
};

/** Thrown for an unsaved form the draft schema cannot read (→ 422). */
export class PreviewFormError extends Error {
  constructor() {
    super("preview_form_invalid");
  }
}

async function previewSource<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
  formData?: FormData | null,
): Promise<Source<T> | null> {
  const [row] = await readEntities(db, type, "preview", {
    where: "t.id = ?",
    binds: [id],
  });
  if (!row) return null;
  if (!formData) return { content: row.content, facts: row.facts };
  const parsed = descriptorFor(type).draftSchema.safeParse(
    formDataToObject(formData),
  );
  if (!parsed.success) throw new PreviewFormError();
  return { content: parsed.data, facts: row.facts };
}

export async function previewProject(
  db: D1Database,
  env: Env,
  locale: Locale,
  id: string,
  formData?: FormData | null,
): Promise<{ project: PublicProjectDetail; music: PublicMusicItem[] } | null> {
  const source = await previewSource(db, "project", id, formData);
  if (!source) return null;
  const [context, music] = await Promise.all([
    buildViewContext(db, env, "project", [source.content], "preview"),
    listProjectMusic(db, env, locale, id, { mode: "preview" }),
  ]);
  return {
    project: buildProjectView(source.content, locale, context, source.facts),
    music,
  };
}

/** Writing: the detail page when it has internal content, else its card. */
export async function previewWriting(
  db: D1Database,
  env: Env,
  locale: Locale,
  id: string,
  formData?: FormData | null,
): Promise<{
  item: PublicWritingItem;
  writing: PublicWritingDetail | null;
} | null> {
  const source = await previewSource(db, "writing", id, formData);
  if (!source) return null;
  const context = await buildViewContext(
    db,
    env,
    "writing",
    [source.content],
    "preview",
  );
  return {
    item: buildWritingItem(source.content, locale, context, source.facts),
    writing: writingHasDetail(source.content, locale)
      ? buildWritingView(source.content, locale, context, source.facts)
      : null,
  };
}

export async function previewMusic(
  db: D1Database,
  env: Env,
  locale: Locale,
  id: string,
  formData?: FormData | null,
): Promise<PublicMusicItem | null> {
  const source = await previewSource(db, "music", id, formData);
  if (!source) return null;
  const context = await buildViewContext(
    db,
    env,
    "music",
    [source.content],
    "preview",
  );
  return buildMusicItem(source.content, locale, context, source.facts);
}

export async function previewRecognition(
  db: D1Database,
  env: Env,
  locale: Locale,
  id: string,
  formData?: FormData | null,
): Promise<PublicRecognitionItem | null> {
  const source = await previewSource(db, "recognition", id, formData);
  if (!source) return null;
  const context = await buildViewContext(
    db,
    env,
    "recognition",
    [source.content],
    "preview",
  );
  return buildRecognitionItem(source.content, locale, context, source.facts);
}

/** Service: its area page view; commission rows priced from the active rule. */
export async function previewService(
  db: D1Database,
  env: Env,
  locale: Locale,
  id: string,
  options: { formData?: FormData | null; now?: Date } = {},
): Promise<{ service: PublicServiceItem } | null> {
  const source = await previewSource(db, "service", id, options.formData);
  if (!source) return null;
  const context = await buildViewContext(
    db,
    env,
    "service",
    [source.content],
    "preview",
  );
  const groupArea = source.content.groupTermId
    ? context.terms.get(source.content.groupTermId)?.data.area
    : null;
  const area =
    groupArea === "mixing" ||
    groupArea === "song_transition" ||
    groupArea === "software"
      ? groupArea
      : null;
  let commissionBaseTwd: number | null = null;
  const commissionId = source.content.commissionServiceId;
  if (commissionId) {
    try {
      const at = (options.now ?? new Date()).toISOString();
      commissionBaseTwd = (await getActivePriceRule(db, commissionId, at))
        .baseTwd;
    } catch {
      commissionBaseTwd = null;
    }
  }
  return {
    service: buildServiceItem(source.content, locale, context, {
      ...source.facts,
      area,
      commissionBaseTwd,
    }),
  };
}
