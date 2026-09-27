/**
 * Settings reads (content-schema §2.9, §5.2). Writes live in
 * `settings-write.server.ts` (P4). A missing row (fresh local DB before the
 * seeds) returns the defaults: brand "Kamel", all text empty.
 */
import {
  type BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  parseBrandSettings,
} from "./schemas/brand-settings";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  type SiteSettings,
} from "./schemas/site-settings";

export type SettingsDocument<T> = { value: T; revision: number };

type SettingsRow = {
  key: "brand" | "site";
  data_json: string;
  revision: number;
};

export function settingsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    "SELECT key, data_json, revision FROM settings WHERE key IN ('brand', 'site')",
  );
}

/** Both documents from one statement's rows (usable inside a `db.batch`). */
export function settingsFromRows(rows: readonly SettingsRow[]): {
  brand: SettingsDocument<BrandSettings>;
  site: SettingsDocument<SiteSettings>;
} {
  const brandRow = rows.find((row) => row.key === "brand");
  const siteRow = rows.find((row) => row.key === "site");
  return {
    brand: brandRow
      ? {
          value: parseBrandSettings(brandRow.data_json),
          revision: brandRow.revision,
        }
      : { value: structuredClone(DEFAULT_BRAND_SETTINGS), revision: 0 },
    site: siteRow
      ? {
          value: parseSiteSettings(siteRow.data_json),
          revision: siteRow.revision,
        }
      : { value: structuredClone(DEFAULT_SITE_SETTINGS), revision: 0 },
  };
}

export async function getSettings(db: D1Database) {
  const rows = await settingsStatement(db).all<SettingsRow>();
  return settingsFromRows(rows.results);
}

export async function getBrandSettings(
  db: D1Database,
): Promise<SettingsDocument<BrandSettings>> {
  return (await getSettings(db)).brand;
}

export async function getSiteSettings(
  db: D1Database,
): Promise<SettingsDocument<SiteSettings>> {
  return (await getSettings(db)).site;
}
