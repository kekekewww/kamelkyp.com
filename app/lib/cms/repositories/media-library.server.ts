/**
 * Studio media library (content-schema §2.8, §5.3; admin-architecture §2.2,
 * §4.9): listing with search and filters, asset detail with every usage,
 * metadata edits, archive, delete safety and the route handlers for
 * `/studio/media` and `/studio/media/:id`.
 *
 * Delete safety: refused while published content (or a live settings
 * document) uses the asset — a trigger enforces the same; draft-only usage
 * needs an explicit acknowledgement that lists the drafts; unused assets
 * delete after one confirm. The R2 object goes after the row; a failed object
 * delete is retried by the cron's orphan pass.
 */
import { redirect } from "react-router";
import { z } from "zod";
import type { Env } from "../../env.server";
import { findBrandViolations } from "../brand-guard.server";
import { CmsError, isCmsError, mapD1Error } from "../db/errors";
import { descriptorFor } from "../db/tables.server";
import { rebuildAllUsages } from "../db/usage.server";
import { formDataToObject, readString } from "../forms";
import { studioLabel } from "../localized";
import { getAsset, registerExternalAsset } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import { type MediaSummary, toMediaSummary } from "../media/summary";
import {
  assetUrl,
  type ImageSources,
  imageSources,
  type MediaConfig,
} from "../media/urls";
import {
  MEDIA_KINDS,
  type MediaAsset,
  type MediaAssetRow,
  type MediaKind,
  type MediaUsage,
  mediaAssetFromRow,
} from "../schemas/media-asset";
import { actionError, actionOk, unknownIntent } from "../studio/responses";
import {
  ENTITY_TYPES,
  type EntityType,
  type EntryStatus,
  type ValidationIssue,
} from "../types";
import { structuralIssues } from "../validation";

const COLUMNS =
  "a.id, a.kind, a.source, a.state, a.storage_key, a.external_url, a.provider, a.filename, a.mime_type, " +
  "a.size_bytes, a.width, a.height, a.duration_ms, a.title_i18n, a.alt_i18n, a.caption_i18n, a.credit, " +
  "a.focal_x, a.focal_y, a.preview_start_seconds, a.preview_end_seconds, a.tags_json, " +
  "a.created_at, a.updated_at, a.archived_at";

export type UsageFilter = "used" | "unused";

export interface LibraryFilters {
  q?: string;
  kind?: MediaKind;
  usage?: UsageFilter;
  missingAlt?: boolean;
  archived?: boolean;
  cursor?: string;
  limit?: number;
}

export interface LibraryRow {
  asset: MediaAsset;
  /** Distinct places (entry + field) that reference the asset. */
  usageCount: number;
  /** Usage rows in live content (blocks deletion). */
  publishedUsageCount: number;
}

type LibraryDbRow = MediaAssetRow & {
  usage_count: number;
  published_count: number;
};

function encodeCursor(asset: { createdAt: string; id: string }): string {
  return encodeURIComponent(`${asset.createdAt}|${asset.id}`);
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const [createdAt, id] = decodeURIComponent(cursor).split("|");
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

/** Library page: newest first; archived assets only in the archived view. */
export async function listLibrary(
  db: D1Database,
  filters: LibraryFilters = {},
): Promise<{ items: LibraryRow[]; next: string | null }> {
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const cursor = decodeCursor(filters.cursor);
  const text = filters.q?.trim().toLowerCase().slice(0, 200) || null;
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS},
         (SELECT COUNT(DISTINCT u.entity_type || '|' || u.entity_id || '|' || u.field)
            FROM media_usages u WHERE u.asset_id = a.id) AS usage_count,
         (SELECT COUNT(*) FROM media_usages u
            WHERE u.asset_id = a.id AND u.scope = 'published') AS published_count
       FROM media_assets a
       WHERE ((?1 = 1 AND a.archived_at IS NOT NULL) OR (?1 = 0 AND a.archived_at IS NULL))
         AND (?2 IS NULL OR a.kind = ?2)
         AND (?3 IS NULL OR instr(lower(a.filename || ' ' || a.title_i18n || ' ' || a.alt_i18n || ' ' ||
               a.caption_i18n || ' ' || COALESCE(a.credit, '') || ' ' || a.tags_json), ?3) > 0)
         AND (?4 IS NULL
           OR (?4 = 'used' AND EXISTS (SELECT 1 FROM media_usages u WHERE u.asset_id = a.id))
           OR (?4 = 'unused' AND NOT EXISTS (SELECT 1 FROM media_usages u WHERE u.asset_id = a.id)))
         AND (?5 = 0 OR (a.kind = 'image' AND (
               trim(COALESCE(json_extract(a.alt_i18n, '$.zh'), '')) = '' OR
               trim(COALESCE(json_extract(a.alt_i18n, '$.en'), '')) = '')))
         AND (?6 IS NULL OR a.created_at < ?6 OR (a.created_at = ?6 AND a.id < ?7))
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?8`,
    )
    .bind(
      filters.archived ? 1 : 0,
      filters.kind ?? null,
      text,
      filters.usage ?? null,
      filters.missingAlt ? 1 : 0,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      limit + 1,
    )
    .all<LibraryDbRow>();
  const items = rows.results.slice(0, limit).map((row) => ({
    asset: mediaAssetFromRow(row),
    usageCount: row.usage_count,
    publishedUsageCount: row.published_count,
  }));
  const last = items[items.length - 1];
  return {
    items,
    next: rows.results.length > limit && last ? encodeCursor(last.asset) : null,
  };
}

const SETTINGS_LABEL: Record<string, string> = {
  brand_settings: "Brand settings",
  site_settings: "Site settings",
};

type UsageDbRow = {
  entity_type: MediaUsage["entityType"];
  entity_id: string;
  field: string;
  scope: "working" | "published";
};

/** Labels and statuses of the entries behind usage rows (one query per type). */
async function describeUsages(
  db: D1Database,
  rows: UsageDbRow[],
): Promise<MediaUsage[]> {
  const labels = new Map<string, { label: string; status: EntryStatus }>();
  for (const type of ENTITY_TYPES) {
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.entity_type === type)
          .map((row) => row.entity_id),
      ),
    ];
    if (ids.length === 0) continue;
    const descriptor = descriptorFor(type as EntityType);
    const found = await db
      .prepare(
        `SELECT id, ${descriptor.labelColumn} AS label_json, status FROM ${descriptor.table}
         WHERE id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(ids))
      .all<{ id: string; label_json: string; status: EntryStatus }>();
    for (const row of found.results) {
      let label = "Untitled";
      try {
        label = studioLabel(JSON.parse(row.label_json));
      } catch {
        // Keep "Untitled".
      }
      labels.set(`${type}|${row.id}`, { label, status: row.status });
    }
  }
  return rows.map((row) => {
    const known = labels.get(`${row.entity_type}|${row.entity_id}`);
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      field: row.field,
      scope: row.scope,
      label: SETTINGS_LABEL[row.entity_type] ?? known?.label ?? "Missing entry",
      status: known?.status ?? null,
    };
  });
}

export async function listUsages(
  db: D1Database,
  assetId: string,
): Promise<MediaUsage[]> {
  const rows = await db
    .prepare(
      `SELECT entity_type, entity_id, field, scope FROM media_usages
       WHERE asset_id = ? ORDER BY entity_type, entity_id, field, scope`,
    )
    .bind(assetId)
    .all<UsageDbRow>();
  return describeUsages(db, rows.results);
}

export async function getAssetWithUsages(
  db: D1Database,
  id: string,
): Promise<{ asset: MediaAsset; usages: MediaUsage[] } | null> {
  const asset = await getAsset(db, id);
  if (!asset) return null;
  return { asset, usages: await listUsages(db, id) };
}

const textPatch = (max: number) =>
  z
    .object({
      zh: z.string().trim().max(max).default(""),
      en: z.string().trim().max(max).default(""),
    })
    .optional();

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    schema.nullable().optional(),
  );

export const AssetMetadataPatchSchema = z.object({
  title: textPatch(300),
  alt: textPatch(500),
  caption: textPatch(1000),
  credit: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(200).nullable().optional(),
  ),
  focalX: optionalNumber(z.number().min(0).max(1)),
  focalY: optionalNumber(z.number().min(0).max(1)),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  previewStartSeconds: optionalNumber(z.number().int().min(0).max(86_400)),
  previewEndSeconds: optionalNumber(z.number().int().min(1).max(86_400)),
});

export type AssetMetadataPatch = z.input<typeof AssetMetadataPatchSchema>;

function invalid(issues: ValidationIssue[]): never {
  throw new CmsError("invalid_content", { issues });
}

/** Title, alt text, caption, credit, focal point, tags and preview range. */
export async function updateAssetMetadata(
  db: D1Database,
  id: string,
  patch: AssetMetadataPatch,
  now: Date = new Date(),
): Promise<MediaAsset> {
  const current = await getAsset(db, id);
  if (!current) throw new CmsError("not_found");
  const parsed = AssetMetadataPatchSchema.safeParse(patch);
  if (!parsed.success) invalid(structuralIssues(parsed.error));
  const value = parsed.data;
  const next = {
    title: value.title ?? current.title,
    alt: value.alt ?? current.alt,
    caption: value.caption ?? current.caption,
    credit: value.credit !== undefined ? value.credit : current.credit,
    focalX: value.focalX !== undefined ? value.focalX : current.focalX,
    focalY: value.focalY !== undefined ? value.focalY : current.focalY,
    tags: value.tags ? [...new Set(value.tags)] : current.tags,
    previewStartSeconds:
      value.previewStartSeconds !== undefined
        ? value.previewStartSeconds
        : current.previewStartSeconds,
    previewEndSeconds:
      value.previewEndSeconds !== undefined
        ? value.previewEndSeconds
        : current.previewEndSeconds,
  };
  if (
    next.previewStartSeconds !== null &&
    next.previewEndSeconds !== null &&
    next.previewEndSeconds <= next.previewStartSeconds
  ) {
    invalid([
      {
        field: "previewEndSeconds",
        code: "invalid_value",
        severity: "error",
        message: "The preview must end after it starts.",
      },
    ]);
  }
  const brand = findBrandViolations({
    title: next.title,
    alt: next.alt,
    caption: next.caption,
    credit: next.credit,
  });
  if (brand.length > 0) {
    invalid(
      brand.map((hit) => ({
        field: hit.field,
        code: "brand_name",
        severity: "error",
        message: `Public text must use the Kamel brand only; remove "${hit.term}".`,
        ...(hit.locale ? { locale: hit.locale } : {}),
      })),
    );
  }
  await db
    .prepare(
      `UPDATE media_assets SET title_i18n = ?2, alt_i18n = ?3, caption_i18n = ?4, credit = ?5,
         focal_x = ?6, focal_y = ?7, tags_json = ?8, preview_start_seconds = ?9,
         preview_end_seconds = ?10, updated_at = ?11
       WHERE id = ?1`,
    )
    .bind(
      id,
      JSON.stringify(next.title),
      JSON.stringify(next.alt),
      JSON.stringify(next.caption),
      next.credit,
      next.focalX,
      next.focalY,
      JSON.stringify(next.tags),
      next.previewStartSeconds,
      next.previewEndSeconds,
      now.toISOString(),
    )
    .run();
  const updated = await getAsset(db, id);
  if (!updated) throw new CmsError("not_found");
  return updated;
}

export async function setAssetArchived(
  db: D1Database,
  id: string,
  archived: boolean,
  now: Date = new Date(),
): Promise<MediaAsset> {
  const timestamp = now.toISOString();
  const result = await db
    .prepare(
      archived
        ? "UPDATE media_assets SET archived_at = ?2, updated_at = ?2 WHERE id = ?1 AND archived_at IS NULL"
        : "UPDATE media_assets SET archived_at = NULL, updated_at = ?2 WHERE id = ?1",
    )
    .bind(id, timestamp)
    .run();
  const asset = await getAsset(db, id);
  if (!asset) throw new CmsError("not_found");
  if ((result.meta.changes ?? 0) === 0 && archived && !asset.archivedAt) {
    throw new CmsError("invalid_state");
  }
  return asset;
}

/** Draft-only usages need an explicit acknowledgement before deletion. */
export class DraftUsageError extends Error {
  readonly usages: MediaUsage[];

  constructor(usages: MediaUsage[]) {
    super("media_asset_in_draft_use");
    this.name = "DraftUsageError";
    this.usages = usages;
  }
}

export async function deleteAsset(
  db: D1Database,
  bucket: R2Bucket | undefined,
  id: string,
  options: { acknowledgeDraftUsages: boolean },
): Promise<void> {
  const detail = await getAssetWithUsages(db, id);
  if (!detail) throw new CmsError("not_found");
  const published = detail.usages.filter(
    (usage) => usage.scope === "published",
  );
  if (published.length > 0) {
    throw new CmsError("media_asset_in_published_use", { usages: published });
  }
  if (detail.usages.length > 0 && !options.acknowledgeDraftUsages) {
    throw new DraftUsageError(detail.usages);
  }
  try {
    await db.prepare("DELETE FROM media_assets WHERE id = ?").bind(id).run();
  } catch (error) {
    mapD1Error(error);
  }
  const { asset } = detail;
  if (bucket && asset.source === "r2" && asset.storageKey) {
    try {
      await bucket.delete(asset.storageKey);
    } catch {
      // Orphan: the nightly cleanup retries it.
    }
  }
}

// ---- Route handlers ----------------------------------------------------------

export interface LibraryItemView {
  summary: MediaSummary;
  source: MediaAsset["source"];
  provider: MediaAsset["provider"];
  createdAt: string;
  archived: boolean;
  usageCount: number;
  publishedUsageCount: number;
  missingAlt: boolean;
}

export interface MediaAnalysisStatus {
  /** Host of the configured media base URL. */
  host: string | null;
  /** Web Audio analysis runs for audio on that host (its CORS rule exists). */
  enabled: boolean;
  corsHosts: string[];
}

export function mediaAnalysisStatus(config: MediaConfig): MediaAnalysisStatus {
  const host = config.publicBaseUrl
    ? new URL(config.publicBaseUrl).hostname
    : null;
  return {
    host,
    enabled: host !== null && config.corsHosts.includes(host),
    corsHosts: [...config.corsHosts],
  };
}

function missingAlt(asset: MediaAsset): boolean {
  return (
    asset.kind === "image" && (!asset.alt.zh.trim() || !asset.alt.en.trim())
  );
}

function toItemView(row: LibraryRow, config: MediaConfig): LibraryItemView {
  return {
    summary: toMediaSummary(row.asset, config),
    source: row.asset.source,
    provider: row.asset.provider,
    createdAt: row.asset.createdAt,
    archived: row.asset.archivedAt !== null,
    usageCount: row.usageCount,
    publishedUsageCount: row.publishedUsageCount,
    missingAlt: missingAlt(row.asset),
  };
}

export function readLibraryFilters(url: URL) {
  const kind = url.searchParams.get("kind");
  const usage = url.searchParams.get("usage");
  return {
    q: url.searchParams.get("q")?.slice(0, 200) ?? "",
    kind: (MEDIA_KINDS as readonly string[]).includes(kind ?? "")
      ? (kind as MediaKind)
      : null,
    usage: (usage === "used" || usage === "unused"
      ? usage
      : null) as UsageFilter | null,
    missingAlt: url.searchParams.get("missingAlt") === "1",
    archived: url.searchParams.get("archived") === "1",
    cursor: url.searchParams.get("cursor") ?? null,
  };
}

export async function loadMediaLibrary({
  request,
  db,
  env,
}: {
  request: Request;
  db: D1Database;
  env: Env;
}) {
  const config = readMediaConfig(env);
  const filters = readLibraryFilters(new URL(request.url));
  const page = await listLibrary(db, {
    q: filters.q || undefined,
    kind: filters.kind ?? undefined,
    usage: filters.usage ?? undefined,
    missingAlt: filters.missingAlt,
    archived: filters.archived,
    cursor: filters.cursor ?? undefined,
  });
  const pending = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM media_assets WHERE state <> 'ready' AND archived_at IS NULL",
    )
    .first<{ n: number }>();
  const analysis = mediaAnalysisStatus(config);
  return {
    items: page.items.map((row) => toItemView(row, config)),
    next: page.next,
    filters,
    pendingCount: pending?.n ?? 0,
    uploads: {
      enabled: config.uploadsEnabled,
      host: config.uploadsEnabled ? analysis.host : null,
    },
    analysis,
  };
}

export type MediaLibraryData = Awaited<ReturnType<typeof loadMediaLibrary>>;

interface ActionArgs {
  db: D1Database;
  env: Env;
  formData: FormData | null;
  intent: string | null;
  now: Date;
}

const RegisterFormSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  title: z
    .object({
      zh: z.string().trim().max(300).default(""),
      en: z.string().trim().max(300).default(""),
    })
    .default({ zh: "", en: "" }),
  alt: z
    .object({
      zh: z.string().trim().max(300).default(""),
      en: z.string().trim().max(300).default(""),
    })
    .default({ zh: "", en: "" }),
});

/** FormData → metadata patch (`title.zh`, `focalX:number`, `tags:json`, …). */
export function parseAssetMetadataForm(formData: FormData): AssetMetadataPatch {
  const raw = formDataToObject(formData) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "alt",
    "caption",
    "credit",
    "focalX",
    "focalY",
    "tags",
    "previewStartSeconds",
    "previewEndSeconds",
  ]) {
    if (key in raw) patch[key] = raw[key];
  }
  return patch as AssetMetadataPatch;
}

function deleteError(error: unknown) {
  if (error instanceof DraftUsageError) {
    return actionError("media_asset_in_draft_use", {
      status: 409,
      message: `Drafts use this asset: ${error.usages
        .map((usage) => usage.label)
        .filter((label, index, all) => all.indexOf(label) === index)
        .join(", ")}. Confirm to delete it and clear those references.`,
      details: { usages: error.usages },
    });
  }
  if (isCmsError(error) && error.code === "media_asset_in_published_use") {
    const usages =
      (error.details as { usages?: MediaUsage[] } | undefined)?.usages ?? [];
    const names = [...new Set(usages.map((usage) => usage.label))];
    return actionError(error.code, {
      status: 409,
      message: names.length
        ? `Published content uses this asset. Unpublish or replace it in: ${names.join(", ")}.`
        : undefined,
      details: { usages },
    });
  }
  return null;
}

async function run(operation: () => Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    const mapped = deleteError(error);
    if (mapped) return mapped;
    if (isCmsError(error)) {
      const issues = (error.details as { issues?: ValidationIssue[] })?.issues;
      return actionError(error.code, {
        status: error.status,
        ...(issues ? { issues } : {}),
      });
    }
    throw error;
  }
}

function requireId(formData: FormData | null): string {
  const id = formData ? readString(formData, "id") : null;
  if (!id) throw new CmsError("not_found");
  return id;
}

function acknowledged(formData: FormData | null): boolean {
  if (!formData) return false;
  const values = formData.getAll("acknowledgeDraftUsages:bool");
  const last = values[values.length - 1];
  return last === "true" || last === "on" || last === "1";
}

/** `/studio/media` actions. */
export async function handleMediaLibraryAction({
  db,
  env,
  formData,
  intent,
  now,
}: ActionArgs) {
  const config = readMediaConfig(env);
  switch (intent) {
    case "register-url":
      return run(async () => {
        const parsed = RegisterFormSchema.safeParse(
          formDataToObject(formData ?? new FormData()),
        );
        if (!parsed.success) invalid(structuralIssues(parsed.error));
        const asset = await registerExternalAsset(db, parsed.data, config, now);
        return actionOk({ asset: toMediaSummary(asset, config) });
      });
    case "update":
      return run(async () => {
        const asset = await updateAssetMetadata(
          db,
          requireId(formData),
          parseAssetMetadataForm(formData ?? new FormData()),
          now,
        );
        return actionOk({ asset: toMediaSummary(asset, config) });
      });
    case "archive":
    case "restore":
      return run(async () => {
        const asset = await setAssetArchived(
          db,
          requireId(formData),
          intent === "archive",
          now,
        );
        return actionOk({ asset: toMediaSummary(asset, config) });
      });
    case "delete":
      return run(async () => {
        const id = requireId(formData);
        await deleteAsset(db, env.MEDIA, id, {
          acknowledgeDraftUsages: acknowledged(formData),
        });
        return actionOk({ deleted: id });
      });
    case "rebuild-usages":
      return run(async () => actionOk(await rebuildAllUsages(db)));
    default:
      return unknownIntent(intent);
  }
}

export interface MediaDetailData {
  asset: MediaAsset;
  summary: MediaSummary;
  usages: MediaUsage[];
  publicUrl: string | null;
  image: ImageSources | null;
  analysis: MediaAnalysisStatus;
  /** Audio on a CORS-configured host (or same origin) may be analysed. */
  analysable: boolean;
}

export async function loadMediaDetail({
  params,
  db,
  env,
}: {
  params: Record<string, string | undefined>;
  db: D1Database;
  env: Env;
}): Promise<MediaDetailData> {
  const config = readMediaConfig(env);
  const detail = await getAssetWithUsages(db, params.id ?? "");
  if (!detail) throw new Response("Not Found", { status: 404 });
  const publicUrl = assetUrl(detail.asset, config);
  let analysable = false;
  if (publicUrl && detail.asset.kind === "audio") {
    analysable = config.corsHosts.includes(new URL(publicUrl).hostname);
  }
  return {
    asset: detail.asset,
    summary: toMediaSummary(detail.asset, config),
    usages: detail.usages,
    publicUrl,
    image:
      detail.asset.kind === "image"
        ? imageSources(detail.asset, config, { widths: [480, 960] })
        : null,
    analysis: mediaAnalysisStatus(config),
    analysable,
  };
}

/** `/studio/media/:id` actions; delete leaves for the library. */
export async function handleMediaDetailAction(args: ActionArgs) {
  if (args.intent === "delete") {
    const result = await handleMediaLibraryAction(args);
    const payload = (result as { data?: { ok?: boolean } }).data;
    if (payload?.ok) {
      const name = readString(args.formData ?? new FormData(), "filename");
      throw redirect(
        `/studio/media${name ? `?deleted=${encodeURIComponent(name)}` : ""}`,
      );
    }
    return result;
  }
  if (
    args.intent === "update" ||
    args.intent === "archive" ||
    args.intent === "restore"
  ) {
    return handleMediaLibraryAction(args);
  }
  return unknownIntent(args.intent);
}
