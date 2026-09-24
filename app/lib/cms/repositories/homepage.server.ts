/**
 * Homepage control (brief §21, admin-architecture §4.2.1). One screen curates
 * everything the home page shows without code: hero text and CTAs (brand
 * settings), availability, section visibility and counts, the contact band
 * (site settings), the showreel and the featured lists per content type.
 *
 * Everything here is live on save: placement (featured, featured order,
 * showreel) is never versioned, and settings have no draft state. Each form
 * may only write its own keys, so the hero form cannot rename the brand and
 * the sections form cannot touch SEO text.
 */
import { CmsError } from "../db/errors";
import { reorder, setFeatured, setShowreel } from "../db/lifecycle.server";
import { descriptorFor } from "../db/tables.server";
import { formDataToObject, readExpectedRevision, readString } from "../forms";
import { localize, parseLocalizedText } from "../localized";
import type { BrandSettings } from "../schemas/brand-settings";
import type { SiteSettings } from "../schemas/site-settings";
import {
  patchBrandSettings,
  patchSiteSettings,
  readSettingsWithMeta,
  type SettingsWithMeta,
} from "../settings-write.server";
import {
  actionError,
  actionOk,
  cmsErrorResult,
  unknownIntent,
} from "../studio/responses";
import { ENTITY_TYPES, type EntityType, type EntryStatus } from "../types";

export type HomepageEntry = {
  id: string;
  label: string;
  /** EN title when it differs from the ZH one. */
  secondary: string | null;
  status: EntryStatus;
  todoContent: boolean;
};

export type ShowreelEntry = HomepageEntry & { playable: boolean };

export type FeaturedGroup = {
  type: EntityType;
  items: HomepageEntry[];
  candidates: HomepageEntry[];
};

export type HomepageModel = {
  brand: SettingsWithMeta<BrandSettings>;
  site: SettingsWithMeta<SiteSettings>;
  showreel: { current: ShowreelEntry | null; candidates: ShowreelEntry[] };
  featured: Record<EntityType, FeaturedGroup>;
};

type PlacementRow = {
  id: string;
  label_json: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  playable?: number;
  is_showreel?: number;
};

function entryFromRow(row: PlacementRow): HomepageEntry {
  const label = parseLocalizedText(row.label_json);
  const zh = localize(label, "zh");
  const en = localize(label, "en");
  return {
    id: row.id,
    label: zh || en || "Untitled",
    secondary: zh && en && zh !== en ? en : null,
    status: row.status,
    todoContent: row.todo_content === 1,
  };
}

function placementStatement(db: D1Database, type: EntityType) {
  const descriptor = descriptorFor(type);
  const music = type === "music";
  return db.prepare(
    `SELECT id, ${descriptor.labelColumn} AS label_json, status, todo_content, featured
       ${
         music
           ? ", is_showreel, (audio_preview_id IS NOT NULL OR full_audio_id IS NOT NULL OR youtube_url IS NOT NULL) AS playable"
           : ""
}
     FROM ${descriptor.table}
     WHERE status <> 'archived'
     ORDER BY featured DESC, featured_order, sort_order, updated_at DESC, id
     LIMIT 300`,
  );
}

export async function getHomepageModel(db: D1Database): Promise<HomepageModel> {
  const [settings, results] = await Promise.all([
    readSettingsWithMeta(db),
    db.batch<PlacementRow>(
      ENTITY_TYPES.map((type) => placementStatement(db, type)),
    ),
  ]);

  const featured = {} as Record<EntityType, FeaturedGroup>;
  let showreel: HomepageModel["showreel"] = { current: null, candidates: [] };
  ENTITY_TYPES.forEach((type, index) => {
    const rows = results[index]?.results ?? [];
    featured[type] = {
      type,
      items: rows.filter((row) => row.featured === 1).map(entryFromRow),
      candidates: rows.filter((row) => row.featured !== 1).map(entryFromRow),
    };
    if (type === "music") {
      const tracks = rows.map((row) => ({
        ...entryFromRow(row),
        playable: row.playable === 1,
        showreel: row.is_showreel === 1,
      }));
      const current = tracks.find((track) => track.showreel) ?? null;
      showreel = {
        current: current ? withoutFlag(current) : null,
        candidates: tracks
          .filter((track) => track.playable && !track.showreel)
          .map(withoutFlag),
      };
    }
  });
  return { brand: settings.brand, site: settings.site, showreel, featured };
}

function withoutFlag({
  showreel: _showreel,
  ...entry
}: ShowreelEntry & { showreel: boolean }): ShowreelEntry {
  return entry;
}

// ---- Actions ---------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copies only the listed dotted paths from a parsed form. */
export function pickPaths(
  source: Record<string, unknown>,
  paths: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const path of paths) {
    const segments = path.split(".");
    let node: unknown = source;
    for (const segment of segments) {
      node = isPlainObject(node) ? node[segment] : undefined;
    }
    if (node === undefined) continue;
    let target = result;
    for (const segment of segments.slice(0, -1)) {
      if (!isPlainObject(target[segment])) target[segment] = {};
      target = target[segment] as Record<string, unknown>;
    }
    target[segments[segments.length - 1] as string] = node;
  }
  return result;
}

const HERO_PATHS = [
  "roles",
  "heroStatement",
  "heroSubtext",
  "primaryCta",
  "secondaryCta",
  "secondaryCtaEnabled",
];
const SECTION_PATHS = [
  "homepage.sections",
  "homepage.featuredProjectCount",
  "homepage.writingCount",
  "homepage.recognitionCount",
];
const AVAILABILITY_PATHS = ["availability"];
const CONTACT_PATHS = ["homepage.contactBandBody", "contactBand"];

function isEntityType(value: string | null): value is EntityType {
  return !!value && (ENTITY_TYPES as readonly string[]).includes(value);
}

function readIds(formData: FormData): string[] | null {
  try {
    const parsed = JSON.parse(readString(formData, "ids") ?? "");
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function requireRevision(formData: FormData): number {
  const revision = readExpectedRevision(formData);
  if (revision === null) throw new CmsError("stale_revision");
  return revision;
}

const LIVE = "Saved. Live on the homepage now.";

export async function handleHomepageAction({
  db,
  formData,
  intent,
  now,
}: {
  db: D1Database;
  formData: FormData | null;
  intent: string | null;
  now: Date;
}) {
  const data = formData ?? new FormData();
  try {
    switch (intent) {
      case "save-hero": {
        const saved = await patchBrandSettings(
          db,
          requireRevision(data),
          pickPaths(formDataToObject(data), HERO_PATHS),
          now,
        );
        return actionOk({ revision: saved.revision, message: LIVE });
      }
      case "save-sections":
      case "save-availability":
      case "save-contact": {
        const paths =
          intent === "save-sections"
            ? SECTION_PATHS
            : intent === "save-availability"
              ? AVAILABILITY_PATHS
              : CONTACT_PATHS;
        const saved = await patchSiteSettings(
          db,
          requireRevision(data),
          pickPaths(formDataToObject(data), paths),
          now,
        );
        return actionOk({ revision: saved.revision, message: LIVE });
      }
      case "set-showreel": {
        const id = (readString(data, "id") ?? "").trim();
        if (!id) {
          return actionError("invalid_content", {
            status: 422,
            message: "Choose a track.",
          });
        }
        await setShowreel(db, id);
        return actionOk({ message: "Showreel set" });
      }
      case "clear-showreel":
        await setShowreel(db, null);
        return actionOk({ message: "Showreel cleared" });
      case "feature":
      case "unfeature":
      case "reorder-featured": {
        const type = readString(data, "type");
        if (!isEntityType(type)) {
          return actionError("invalid_content", {
            status: 422,
            message: "Unknown content type.",
          });
        }
        if (intent === "reorder-featured") {
          const ids = readIds(data);
          if (!ids) {
            return actionError("invalid_content", {
              status: 422,
              message: "The new order could not be read.",
            });
          }
          await reorder(db, type, ids, "featured_order");
          return actionOk({ message: "Order saved" });
        }
        const id = (readString(data, "id") ?? "").trim();
        if (!id) throw new CmsError("not_found");
        await setFeatured(db, type, id, intent === "feature");
        return actionOk({
          message:
            intent === "feature"
              ? "Added to the homepage"
              : "Removed from the homepage",
        });
      }
      default:
        return unknownIntent(intent);
    }
  } catch (error) {
    return cmsErrorResult(error);
  }
}
