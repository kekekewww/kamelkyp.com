/**
 * Fixtures for the P4 worker tests (services, settings, homepage, Studio
 * home, taxonomies). Storage persists between the tests of one file, so
 * every test that changes shared rows restores them first.
 */
export {
  insertExternalAsset,
  insertMusicTrack,
  insertProject,
  publishViaView,
  text,
  uniqueId,
} from "../helpers/cms";

type SettingsRow = {
  key: string;
  data_json: string;
  revision: number;
  updated_at: string;
};

export async function snapshotSettings(db: D1Database) {
  const rows = await db
    .prepare("SELECT key, data_json, revision, updated_at FROM settings")
    .all<SettingsRow>();
  return rows.results;
}

/** Puts the settings rows back and drops their media usage rows. */
export async function restoreSettings(
  db: D1Database,
  rows: readonly SettingsRow[],
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM settings"),
    db.prepare(
      "DELETE FROM media_usages WHERE entity_type IN ('brand_settings', 'site_settings')",
    ),
    ...rows.map((row) =>
      db
        .prepare(
          "INSERT INTO settings (key, data_json, revision, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind(row.key, row.data_json, row.revision, row.updated_at),
    ),
  ]);
}

/** Clears homepage placement on every lifecycle table. */
export async function clearPlacement(db: D1Database): Promise<void> {
  await db.batch(
    ["projects", "music_tracks", "recognitions", "writings", "services"].map(
      (table) =>
        db.prepare(
          `UPDATE ${table} SET featured = 0, featured_order = NULL${
            table === "music_tracks" ? ", is_showreel = 0" : ""
          }`,
        ),
    ),
  );
}
