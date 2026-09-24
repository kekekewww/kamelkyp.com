/**
 * Studio music (content-schema §2.3, §5.3; admin-architecture §2.2, §4.3–4.9):
 * list filters (artist, year, role, featured, status, search), form parsing,
 * and the handlers behind `/studio/music`, `/studio/music/new` and
 * `/studio/music/:id`. Lifecycle, featuring, ordering and the single homepage
 * showreel go through the engine (`lifecycle.server.ts`).
 */
import { redirect } from "react-router";
import type { Env } from "../../env.server";
import { CmsError, isCmsError } from "../db/errors";
import {
  archiveEntity,
  createEntity,
  deleteEntity,
  duplicateEntity,
  getEntity,
  getWorkingSnapshot,
  listEntityOptions,
  publishEntity,
  reorder,
  restoreEntity,
  revertToPublished,
  saveEntity,
  setFeatured,
  setShowreel,
  unpublishEntity,
  validateEntity,
} from "../db/lifecycle.server";
import { formDataToObject, readExpectedRevision, readString } from "../forms";
import { parseLocalizedText, sameText, studioLabel } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import { type MediaSummary, toMediaSummary } from "../media/summary";
import { type MusicContent, MusicDraftSchema } from "../schemas/music";
import {
  actionError,
  actionOk,
  cmsErrorResult,
  unknownIntent,
} from "../studio/responses";
import type {
  EntityMeta,
  EntryStatus,
  LocalizedText,
  ValidationIssue,
} from "../types";
import { structuralIssues } from "../validation";

export type MusicStatusFilter =
  | "active"
  | "draft"
  | "published"
  | "archived"
  | "all";
export type MusicSort = "order" | "updated" | "year";

export interface MusicListFilters {
  q?: string;
  status?: MusicStatusFilter;
  artist?: string;
  year?: number;
  role?: string;
  featured?: boolean;
  sort?: MusicSort;
}

export interface StudioMusicRow {
  id: string;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  featuredOrder: number | null;
  sortOrder: number;
  isShowreel: boolean;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  title: LocalizedText;
  artist: LocalizedText;
  role: LocalizedText;
  genre: LocalizedText;
  year: number | null;
  durationMs: number | null;
  /** Preview audio, full audio or a YouTube link: can be the showreel. */
  showreelReady: boolean;
  /** Any playable source (publish rule). */
  playable: boolean;
  projectId: string | null;
}

const STATUS_SETS: Record<MusicStatusFilter, EntryStatus[]> = {
  active: ["draft", "published"],
  draft: ["draft"],
  published: ["published"],
  archived: ["archived"],
  all: ["draft", "published", "archived"],
};

const ORDER_BY: Record<MusicSort, string> = {
  order: "sort_order, updated_at DESC",
  updated: "updated_at DESC",
  year: "year IS NULL, year DESC, sort_order",
};

type MusicListRow = {
  id: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  featured_order: number | null;
  sort_order: number;
  is_showreel: number;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  updated_at: string;
  title_i18n: string;
  artist_i18n: string;
  role_i18n: string;
  genre_i18n: string;
  year: number | null;
  duration_ms: number | null;
  audio_preview_id: string | null;
  full_audio_id: string | null;
  youtube_url: string | null;
  spotify_url: string | null;
  soundcloud_url: string | null;
  project_id: string | null;
};

function toRow(row: MusicListRow): StudioMusicRow {
  const showreelReady = Boolean(
    row.audio_preview_id || row.full_audio_id || row.youtube_url,
  );
  return {
    id: row.id,
    status: row.status,
    todoContent: row.todo_content === 1,
    featured: row.featured === 1,
    featuredOrder: row.featured_order,
    sortOrder: row.sort_order,
    isShowreel: row.is_showreel === 1,
    hasUnpublishedChanges:
      row.has_snapshot === 1 &&
      row.published_revision !== null &&
      row.revision !== row.published_revision,
    updatedAt: row.updated_at,
    title: parseLocalizedText(row.title_i18n),
    artist: parseLocalizedText(row.artist_i18n),
    role: parseLocalizedText(row.role_i18n),
    genre: parseLocalizedText(row.genre_i18n),
    year: row.year,
    durationMs: row.duration_ms,
    showreelReady,
    playable: showreelReady || Boolean(row.spotify_url || row.soundcloud_url),
    projectId: row.project_id,
  };
}

export async function listStudioMusic(
  db: D1Database,
  filters: MusicListFilters = {},
): Promise<StudioMusicRow[]> {
  const statuses = STATUS_SETS[filters.status ?? "active"];
  const q = filters.q?.trim().toLowerCase().slice(0, 200) || null;
  const artist = filters.artist?.trim().toLowerCase() || null;
  const role = filters.role?.trim().toLowerCase() || null;
  const rows = await db
    .prepare(
      `SELECT id, status, todo_content, featured, featured_order, sort_order, is_showreel,
         revision, published_revision, (published_json IS NOT NULL) AS has_snapshot, updated_at,
         title_i18n, artist_i18n, role_i18n, genre_i18n, year, duration_ms,
         audio_preview_id, full_audio_id, youtube_url, spotify_url, soundcloud_url, project_id
       FROM music_tracks
       WHERE status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(lower(title_i18n || ' ' || artist_i18n || ' ' || role_i18n || ' ' ||
               genre_i18n || ' ' || description_i18n), ?2) > 0)
         AND (?3 IS NULL
           OR lower(trim(COALESCE(json_extract(artist_i18n, '$.zh'), ''))) = ?3
           OR lower(trim(COALESCE(json_extract(artist_i18n, '$.en'), ''))) = ?3)
         AND (?4 IS NULL OR year = ?4)
         AND (?5 IS NULL
           OR lower(trim(COALESCE(json_extract(role_i18n, '$.zh'), ''))) = ?5
           OR lower(trim(COALESCE(json_extract(role_i18n, '$.en'), ''))) = ?5)
         AND (?6 = 0 OR featured = 1)
       ORDER BY ${ORDER_BY[filters.sort ?? "order"]}
       LIMIT 500`,
    )
    .bind(
      JSON.stringify(statuses),
      q,
      artist,
      filters.year ?? null,
      role,
      filters.featured ? 1 : 0,
    )
    .all<MusicListRow>();
  return rows.results.map(toRow);
}

function distinctLabels(values: LocalizedText[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const label = value.en.trim() || value.zh.trim();
    if (label && !seen.has(label.toLowerCase())) {
      seen.set(label.toLowerCase(), label);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Filter options: years, artists and roles in use (EN label, else ZH). */
export async function getMusicFacets(db: D1Database) {
  const [years, labels] = await db.batch<
    { year: number } | { artist_i18n: string; role_i18n: string }
  >([
    db.prepare(
      "SELECT DISTINCT year FROM music_tracks WHERE year IS NOT NULL ORDER BY year DESC",
    ),
    db.prepare(
      "SELECT artist_i18n, role_i18n FROM music_tracks WHERE status <> 'archived' LIMIT 1000",
    ),
  ]);
  const rows = (labels?.results ?? []) as Array<{
    artist_i18n: string;
    role_i18n: string;
  }>;
  return {
    years: ((years?.results ?? []) as Array<{ year: number }>).map(
      (row) => row.year,
    ),
    artists: distinctLabels(
      rows.map((row) => parseLocalizedText(row.artist_i18n)),
    ),
    roles: distinctLabels(rows.map((row) => parseLocalizedText(row.role_i18n))),
  };
}

export interface ShowreelSummary {
  id: string;
  title: string;
  status: EntryStatus;
  /** Preview audio, full audio or a YouTube link. */
  ready: boolean;
}

export async function getShowreelSummary(
  db: D1Database,
): Promise<ShowreelSummary | null> {
  const row = await db
    .prepare(
      `SELECT id, title_i18n, status, audio_preview_id, full_audio_id, youtube_url
       FROM music_tracks WHERE is_showreel = 1 LIMIT 1`,
    )
    .first<{
      id: string;
      title_i18n: string;
      status: EntryStatus;
      audio_preview_id: string | null;
      full_audio_id: string | null;
      youtube_url: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    title: studioLabel(parseLocalizedText(row.title_i18n)),
    status: row.status,
    ready: Boolean(
      row.audio_preview_id || row.full_audio_id || row.youtube_url,
    ),
  };
}

// ---- Form parsing ------------------------------------------------------------

/**
 * `3:15` → 195 000 ms, `1:02:03`, or plain seconds. Empty → null;
 * unreadable → undefined.
 */
export function parseDuration(value: string): number | null | undefined {
  const text = value.trim();
  if (!text) return null;
  if (/^[0-9]{1,6}$/.test(text)) return Number(text) * 1000;
  const short = /^([0-9]{1,4}):([0-5][0-9])$/.exec(text);
  if (short) return (Number(short[1]) * 60 + Number(short[2])) * 1000;
  const long = /^([0-9]{1,2}):([0-5][0-9]):([0-5][0-9])$/.exec(text);
  if (long) {
    return (
      (Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3])) * 1000
    );
  }
  return undefined;
}

function blankText(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  return !String(record.zh ?? "").trim() && !String(record.en ?? "").trim();
}

/** Rows the owner added but left completely empty are not content. */
function dropBlankRows(raw: Record<string, unknown>) {
  if (Array.isArray(raw.credits)) {
    raw.credits = raw.credits.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (String((item as { name?: unknown }).name ?? "").trim() ||
          !blankText((item as { role?: unknown }).role)),
    );
  }
  if (Array.isArray(raw.otherLinks)) {
    raw.otherLinks = raw.otherLinks.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (String((item as { url?: unknown }).url ?? "").trim() ||
          !blankText((item as { label?: unknown }).label)),
    );
  }
}

export function parseMusicForm(formData: FormData): {
  content: MusicContent;
  expectedRevision: number | null;
  clearTodoContent: boolean;
} {
  const raw = formDataToObject(formData) as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  if (typeof raw.duration === "string") {
    const durationMs = parseDuration(raw.duration);
    if (durationMs === undefined) {
      issues.push({
        field: "duration",
        code: "invalid_value",
        severity: "error",
        message: "Use minutes:seconds, for example 3:15.",
      });
    } else {
      raw.durationMs = durationMs;
    }
  }
  dropBlankRows(raw);
  const parsed = MusicDraftSchema.safeParse(raw);
  if (!parsed.success) issues.push(...structuralIssues(parsed.error));
  if (issues.length > 0 || !parsed.success) {
    throw new CmsError("invalid_content", { issues });
  }
  return {
    content: parsed.data,
    expectedRevision: readExpectedRevision(formData),
    clearTodoContent: raw.clearTodoContent === true,
  };
}

// ---- Handlers ------------------------------------------------------------------

export interface MusicActionArgs {
  db: D1Database;
  env: Env;
  formData: FormData | null;
  intent: string | null;
  now: Date;
  params?: Record<string, string | undefined>;
}

async function run(operation: () => Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (isCmsError(error)) return cmsErrorResult(error);
    throw error;
  }
}

function formOf(args: MusicActionArgs): FormData {
  return args.formData ?? new FormData();
}

function requireId(args: MusicActionArgs): string {
  const id = args.params?.id ?? readString(formOf(args), "id");
  if (!id) throw new CmsError("not_found");
  return id;
}

async function assertShowreelReady(db: D1Database, id: string) {
  const content = await getWorkingSnapshot(db, "music", id);
  if (!content) throw new CmsError("not_found");
  if (!(content.audioPreviewId || content.fullAudioId || content.youtubeUrl)) {
    return actionError("invalid_state", {
      status: 409,
      message:
        "Add preview audio, full audio or a YouTube link before making this the homepage showreel.",
    });
  }
  return null;
}

async function setShowreelAction(db: D1Database, id: string) {
  const refused = await assertShowreelReady(db, id);
  if (refused) return refused;
  await setShowreel(db, id);
  return actionOk({ showreel: await getShowreelSummary(db) });
}

async function clearShowreelAction(db: D1Database, id: string | null) {
  const current = await getShowreelSummary(db);
  if (current && (!id || current.id === id)) await setShowreel(db, null);
  return actionOk({ showreel: null });
}

function titleFrom(formData: FormData): LocalizedText {
  const zh = readString(formData, "title.zh")?.trim() ?? "";
  const en = readString(formData, "title.en")?.trim() ?? "";
  return { zh: zh.slice(0, 200), en: en.slice(0, 200) };
}

async function createTrack(args: MusicActionArgs): Promise<never> {
  const form = formOf(args);
  const meta = await createEntity(
    args.db,
    "music",
    {
      title: titleFrom(form),
      // The owner's own work is credited to the brand.
      artist: sameText("Kamel"),
    },
    { now: args.now },
  );
  throw redirect(`/studio/music/${meta.id}`, 303);
}

/** `/studio/music/new` action: create, then open the editor. */
export async function handleMusicCreate(args: MusicActionArgs) {
  if (args.intent && args.intent !== "create")
    return unknownIntent(args.intent);
  return run(() => createTrack(args));
}

function parseIds(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.length <= 1000 &&
      parsed.every((item) => typeof item === "string" && item.length <= 100)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** `/studio/music` actions. */
export async function handleMusicListAction(args: MusicActionArgs) {
  const { db, now, intent } = args;
  switch (intent) {
    case "create":
      return run(() => createTrack(args));
    case "reorder":
      return run(async () => {
        const ids = parseIds(readString(formOf(args), "ids"));
        if (!ids) {
          return actionError("invalid_request", {
            status: 422,
            message: "The new order could not be read. Reload and try again.",
          });
        }
        await reorder(db, "music", ids, "sort_order");
        return actionOk({ order: ids });
      });
    case "feature":
    case "unfeature":
      return run(async () => {
        await setFeatured(db, "music", requireId(args), intent === "feature");
        return actionOk({});
      });
    case "archive":
      return run(async () =>
        actionOk({
          meta: await archiveEntity(db, "music", requireId(args), now),
        }),
      );
    case "restore":
      return run(async () =>
        actionOk({
          meta: await restoreEntity(db, "music", requireId(args), now),
        }),
      );
    case "duplicate":
      return run(async () => {
        const meta = await duplicateEntity(db, "music", requireId(args), now);
        return actionOk({ id: meta.id });
      });
    case "set-showreel":
      return run(() => setShowreelAction(db, requireId(args)));
    case "clear-showreel":
      return run(() =>
        clearShowreelAction(db, readString(formOf(args), "id") ?? null),
      );
    default:
      return unknownIntent(intent);
  }
}

function readFilters(url: URL) {
  const status = url.searchParams.get("status");
  const sort = url.searchParams.get("sort");
  const year = Number(url.searchParams.get("year"));
  return {
    q: url.searchParams.get("q")?.slice(0, 200) ?? "",
    status: (status && status in STATUS_SETS
      ? status
      : "active") as MusicStatusFilter,
    artist: url.searchParams.get("artist")?.slice(0, 200) ?? "",
    year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null,
    role: url.searchParams.get("role")?.slice(0, 200) ?? "",
    featured: url.searchParams.get("featured") === "1",
    sort: (sort === "updated" || sort === "year" ? sort : "order") as MusicSort,
  };
}

export async function loadMusicList({
  request,
  db,
}: {
  request: Request;
  db: D1Database;
}) {
  const filters = readFilters(new URL(request.url));
  const [rows, facets, showreel] = await Promise.all([
    listStudioMusic(db, {
      q: filters.q || undefined,
      status: filters.status,
      artist: filters.artist || undefined,
      year: filters.year ?? undefined,
      role: filters.role || undefined,
      featured: filters.featured,
      sort: filters.sort,
    }),
    getMusicFacets(db),
    getShowreelSummary(db),
  ]);
  const manualOrder =
    filters.sort === "order" &&
    !filters.q &&
    filters.status === "active" &&
    !filters.artist &&
    filters.year === null &&
    !filters.role &&
    !filters.featured;
  return { rows, facets, filters, showreel, manualOrder };
}

export type MusicListData = Awaited<ReturnType<typeof loadMusicList>>;

export async function loadMusicEditor({
  params,
  db,
  env,
}: {
  params: Record<string, string | undefined>;
  db: D1Database;
  env: Env;
}) {
  const id = params.id ?? "";
  const loaded = await getEntity(db, "music", id);
  if (!loaded) throw new Response("Not Found", { status: 404 });
  const config = readMediaConfig(env);
  const refs = [loaded.content, loaded.published]
    .filter((content): content is MusicContent => Boolean(content))
    .flatMap((content) => [
      content.artworkId,
      content.audioPreviewId,
      content.fullAudioId,
    ])
    .filter((ref): ref is string => Boolean(ref));
  const [issues, assetMap, projectOptions, showreel] = await Promise.all([
    validateEntity(db, "music", id),
    getAssets(db, refs),
    listEntityOptions(db, "project", {
      statuses: ["draft", "published", "archived"],
      limit: 200,
    }),
    getShowreelSummary(db),
  ]);
  const assets: Record<string, MediaSummary> = {};
  for (const [assetId, asset] of assetMap) {
    assets[assetId] = toMediaSummary(asset, config);
  }
  return {
    meta: loaded.meta,
    content: loaded.content,
    publishedContent: loaded.published,
    issues,
    assets,
    projectOptions,
    showreel,
    previewUrl: `/studio/preview/music/${id}`,
  };
}

export type MusicEditorData = Awaited<ReturnType<typeof loadMusicEditor>>;

function missingRevision() {
  return actionError("stale_revision", {
    status: 409,
    message: "Reload this entry, then save again.",
  });
}

async function saveFromForm(
  args: MusicActionArgs,
  id: string,
): Promise<EntityMeta | ReturnType<typeof missingRevision>> {
  const parsed = parseMusicForm(formOf(args));
  if (parsed.expectedRevision === null) return missingRevision();
  return saveEntity(
    args.db,
    "music",
    id,
    parsed.expectedRevision,
    parsed.content,
    args.now,
    { clearTodoContent: parsed.clearTodoContent },
  );
}

function isMeta(value: unknown): value is EntityMeta {
  return Boolean(value && typeof value === "object" && "revision" in value);
}

/** `/studio/music/:id` actions. */
export async function handleMusicEditorAction(args: MusicActionArgs) {
  const { db, now, intent } = args;
  const id = args.params?.id ?? "";
  switch (intent) {
    case "save":
      return run(async () => {
        const saved = await saveFromForm(args, id);
        if (!isMeta(saved)) return saved;
        return actionOk({
          meta: saved,
          issues: await validateEntity(db, "music", id),
        });
      });
    case "publish":
      return run(async () => {
        const saved = await saveFromForm(args, id);
        if (!isMeta(saved)) return saved;
        const outcome = await publishEntity(
          db,
          "music",
          id,
          saved.revision,
          now,
        );
        if (!outcome.ok) {
          return actionOk({
            published: false,
            meta: saved,
            issues: outcome.issues,
          });
        }
        return actionOk({
          published: true,
          meta: outcome.meta,
          issues: await validateEntity(db, "music", id),
        });
      });
    case "unpublish":
      return run(async () =>
        actionOk({ meta: await unpublishEntity(db, "music", id, now) }),
      );
    case "archive":
      return run(async () =>
        actionOk({ meta: await archiveEntity(db, "music", id, now) }),
      );
    case "restore":
      return run(async () =>
        actionOk({
          meta: await restoreEntity(db, "music", id, now),
          reset: true,
        }),
      );
    case "revert":
      return run(async () => {
        const expected = readExpectedRevision(formOf(args));
        if (expected === null) return missingRevision();
        return actionOk({
          meta: await revertToPublished(db, "music", id, expected, now),
          reset: true,
        });
      });
    case "duplicate":
      return run(async () => {
        const meta = await duplicateEntity(db, "music", id, now);
        throw redirect(`/studio/music/${meta.id}?duplicated=1`, 303);
      });
    case "delete":
      return run(async () => {
        await deleteEntity(
          db,
          "music",
          id,
          readString(formOf(args), "confirm") ?? "",
        );
        throw redirect("/studio/music?deleted=1", 303);
      });
    case "feature":
    case "unfeature":
      return run(async () => {
        await setFeatured(db, "music", id, intent === "feature");
        return actionOk({});
      });
    case "set-showreel":
      return run(() => setShowreelAction(db, id));
    case "clear-showreel":
      return run(() => clearShowreelAction(db, id));
    default:
      return unknownIntent(intent);
  }
}
