/**
 * Media usage index (content-schema §2.8). Derived data: rebuilt for one
 * entity on every lifecycle action, and fully by the nightly cron and Studio
 * → Media → "Rebuild usage index". Delete safety reads the `published` scope.
 */
import type { ContentBlock } from "../../content/block-schema";
import type { BrandSettings } from "../schemas/brand-settings";
import { parseBrandSettings } from "../schemas/brand-settings";
import type { MusicContent } from "../schemas/music";
import type { ProjectContent } from "../schemas/project";
import type { RecognitionContent } from "../schemas/recognition";
import type { SiteSettings } from "../schemas/site-settings";
import { parseSiteSettings } from "../schemas/site-settings";
import type { WritingContent } from "../schemas/writing";
import type { EntityType, LocalizedBlocks, UsageEntityType } from "../types";
import { ENTITY_DESCRIPTORS } from "./tables.server";

export type AssetRefHit = { assetId: string; field: string };

function blockRefs(field: string, blocks: LocalizedBlocks): AssetRefHit[] {
  const hits: AssetRefHit[] = [];
  for (const locale of ["zh", "en"] as const) {
    for (const block of blocks[locale] as ContentBlock[]) {
      if (block.type === "media") {
        hits.push({ assetId: block.mediaId, field: `${field}.${locale}` });
      }
    }
  }
  return hits;
}

function single(field: string, id: string | null | undefined): AssetRefHit[] {
  return id ? [{ assetId: id, field }] : [];
}

function dedupe(hits: AssetRefHit[]): AssetRefHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.assetId}\u0000${hit.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every asset a content value references, with the field it is used in. */
export function extractAssetRefs(
  type: UsageEntityType,
  content: unknown,
): AssetRefHit[] {
  if (!content) return [];
  switch (type) {
    case "project": {
      const project = content as ProjectContent;
      return dedupe([
        ...single("coverImageId", project.coverImageId),
        ...single("coverVideoId", project.coverVideoId),
        ...single("socialImageId", project.socialImageId),
        ...project.gallery.map((item) => ({
          assetId: item.assetId,
          field: "gallery",
        })),
        ...blockRefs("body", project.body),
      ]);
    }
    case "music": {
      const music = content as MusicContent;
      return dedupe([
        ...single("artworkId", music.artworkId),
        ...single("audioPreviewId", music.audioPreviewId),
        ...single("fullAudioId", music.fullAudioId),
      ]);
    }
    case "recognition":
      return single("imageId", (content as RecognitionContent).imageId);
    case "writing": {
      const writing = content as WritingContent;
      return dedupe([
        ...single("coverImageId", writing.coverImageId),
        ...single("socialImageId", writing.socialImageId),
        ...blockRefs("content", writing.content),
      ]);
    }
    case "service":
      return [];
    case "brand_settings": {
      const brand = content as BrandSettings;
      return dedupe([
        ...single("portraitId", brand.portraitId),
        ...single("logoId", brand.logoId),
        ...single("faviconId", brand.faviconId),
        ...brand.brandAssetIds.map((assetId) => ({
          assetId,
          field: "brandAssetIds",
        })),
      ]);
    }
    case "site_settings": {
      const site = content as SiteSettings;
      return dedupe([
        ...single("ogImageId", site.ogImageId),
        ...single("defaultSocialImageId", site.defaultSocialImageId),
      ]);
    }
  }
}

type UsageRow = {
  a: string;
  t: UsageEntityType;
  e: string;
  f: string;
  s: "working" | "published";
};

function insertRows(db: D1Database, rows: UsageRow[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < rows.length; start += 400) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO media_usages (asset_id, entity_type, entity_id, field, scope)
           SELECT json_extract(j.value, '$.a'), json_extract(j.value, '$.t'),
                  json_extract(j.value, '$.e'), json_extract(j.value, '$.f'),
                  json_extract(j.value, '$.s')
           FROM json_each(?1) j
           WHERE json_extract(j.value, '$.a') IN (SELECT id FROM media_assets)`,
        )
        .bind(JSON.stringify(rows.slice(start, start + 400))),
    );
  }
  return statements;
}

/** Statements that replace one entity's usage rows (for inclusion in a batch). */
export function syncUsageStatements(
  db: D1Database,
  entityType: UsageEntityType,
  entityId: string,
  refs: { working: AssetRefHit[]; published: AssetRefHit[] },
): D1PreparedStatement[] {
  const rows: UsageRow[] = [
    ...refs.working.map((hit) => ({
      a: hit.assetId,
      t: entityType,
      e: entityId,
      f: hit.field,
      s: "working" as const,
    })),
    ...refs.published.map((hit) => ({
      a: hit.assetId,
      t: entityType,
      e: entityId,
      f: hit.field,
      s: "published" as const,
    })),
  ];
  return [
    db
      .prepare(
        "DELETE FROM media_usages WHERE entity_type = ? AND entity_id = ?",
      )
      .bind(entityType, entityId),
    ...insertRows(db, rows),
  ];
}

export async function syncUsages(
  db: D1Database,
  entityType: UsageEntityType,
  entityId: string,
  refs: { working: AssetRefHit[]; published: AssetRefHit[] },
): Promise<void> {
  await db.batch(syncUsageStatements(db, entityType, entityId, refs));
}

/** Full rebuild from every working copy, live snapshot and settings document. */
export async function rebuildAllUsages(
  db: D1Database,
): Promise<{ assets: number; usages: number }> {
  const rows: UsageRow[] = [];

  for (const type of Object.keys(ENTITY_DESCRIPTORS) as EntityType[]) {
    const descriptor = ENTITY_DESCRIPTORS[type];
    const result = await db
      .prepare(
        `SELECT t.id, t.status, t.published_json, v.snapshot FROM ${descriptor.table} t
         JOIN ${descriptor.view} v ON v.id = t.id`,
      )
      .all<{
        id: string;
        status: string;
        published_json: string | null;
        snapshot: string;
      }>();
    for (const row of result.results) {
      const working = descriptor.snapshotSchema.safeParse(
        JSON.parse(row.snapshot),
      );
      if (working.success) {
        for (const hit of extractAssetRefs(type, working.data)) {
          rows.push({
            a: hit.assetId,
            t: type,
            e: row.id,
            f: hit.field,
            s: "working",
          });
        }
      }
      if (row.status === "published" && row.published_json) {
        const published = descriptor.snapshotSchema.safeParse(
          JSON.parse(row.published_json),
        );
        if (published.success) {
          for (const hit of extractAssetRefs(type, published.data)) {
            rows.push({
              a: hit.assetId,
              t: type,
              e: row.id,
              f: hit.field,
              s: "published",
            });
          }
        }
      }
    }
  }

  const settings = await db
    .prepare("SELECT key, data_json FROM settings")
    .all<{ key: "brand" | "site"; data_json: string }>();
  for (const row of settings.results) {
    const type = row.key === "brand" ? "brand_settings" : "site_settings";
    const value =
      row.key === "brand"
        ? parseBrandSettings(row.data_json)
        : parseSiteSettings(row.data_json);
    for (const hit of extractAssetRefs(type, value)) {
      // Settings are live on save: their references count as published.
      for (const scope of ["working", "published"] as const) {
        rows.push({
          a: hit.assetId,
          t: type,
          e: row.key,
          f: hit.field,
          s: scope,
        });
      }
    }
  }

  await db.batch([
    db.prepare("DELETE FROM media_usages"),
    ...insertRows(db, rows),
  ]);
  const counts = await db
    .prepare(
      "SELECT COUNT(*) AS usages, COUNT(DISTINCT asset_id) AS assets FROM media_usages",
    )
    .first<{ usages: number; assets: number }>();
  return { assets: counts?.assets ?? 0, usages: counts?.usages ?? 0 };
}
