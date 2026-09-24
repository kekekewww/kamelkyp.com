/**
 * Worker-test helpers for the Content Studio schema (migrations 0005–0008).
 * Rows are inserted with plain SQL so tests exercise the database rules
 * (CHECKs, triggers, views) independently of the lifecycle engine.
 */

const NOW = "2026-09-24T00:00:00Z";

let counter = 0;
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function text(zh: string, en = zh): string {
  return JSON.stringify({ zh, en });
}

export async function insertProject(
  db: D1Database,
  input: {
    id?: string;
    slug?: string;
    title?: string;
    todoContent?: boolean;
    categoryId?: string | null;
    coverImageId?: string | null;
  } = {},
): Promise<string> {
  const id = input.id ?? uniqueId("project");
  await db
    .prepare(
      "INSERT INTO projects (id, slug, todo_content, year, primary_category_id, title_i18n, " +
        "short_description_i18n, cover_image_id, created_at, updated_at) " +
        "VALUES (?, ?, ?, 2026, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.slug ?? id,
      input.todoContent ? 1 : 0,
      input.categoryId === undefined
        ? "term-project_category-software"
        : input.categoryId,
      text(input.title ?? "Fixture project"),
      text("Fixture summary"),
      input.coverImageId ?? null,
      NOW,
      NOW,
    )
    .run();
  return id;
}

/** Publishes through the snapshot view, exactly like the engine does. */
export async function publishViaView(
  db: D1Database,
  table: "projects" | "writings" | "services" | "music_tracks" | "recognitions",
  id: string,
): Promise<D1Result> {
  const view = {
    projects: "project_snapshots",
    writings: "writing_snapshots",
    services: "service_snapshots",
    music_tracks: "music_snapshots",
    recognitions: "recognition_snapshots",
  }[table];
  const slugged =
    table === "projects" || table === "writings" || table === "services";
  return db
    .prepare(
      `UPDATE ${table} SET status = 'published', ` +
        `published_json = (SELECT s.snapshot FROM ${view} s WHERE s.id = ${table}.id), ` +
        (slugged ? "published_slug = slug, " : "") +
        "published_revision = revision, published_at = ?2, first_published_at = ?2 " +
        "WHERE id = ?1",
    )
    .bind(id, NOW)
    .run();
}

export async function insertExternalAsset(
  db: D1Database,
  input: { id?: string; kind?: string; url?: string; alt?: string } = {},
): Promise<string> {
  const id = input.id ?? uniqueId("asset");
  await db
    .prepare(
      "INSERT INTO media_assets (id, kind, source, state, external_url, provider, filename, " +
        "alt_i18n, created_at, updated_at) VALUES (?, ?, 'external', 'ready', ?, 'direct', ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.kind ?? "image",
      input.url ?? `https://images.example.com/${id}.jpg`,
      `${id}.jpg`,
      text(input.alt ?? "Alt text"),
      NOW,
      NOW,
    )
    .run();
  return id;
}

export async function insertMusicTrack(
  db: D1Database,
  input: { id?: string; showreel?: boolean; audioPreviewId?: string } = {},
): Promise<string> {
  const id = input.id ?? uniqueId("track");
  await db
    .prepare(
      "INSERT INTO music_tracks (id, title_i18n, artist_i18n, audio_preview_id, is_showreel, " +
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      text("Fixture track"),
      text("Kamel"),
      input.audioPreviewId ?? null,
      input.showreel ? 1 : 0,
      NOW,
      NOW,
    )
    .run();
  return id;
}

/** Applies the named migration files (by filename prefix) from TEST_MIGRATIONS. */
export async function applyMigrationQueries(
  db: D1Database,
  migrations: { name: string; queries: string[] }[],
  names: string[],
): Promise<void> {
  for (const migration of migrations) {
    if (!names.some((name) => migration.name.startsWith(name))) continue;
    for (const query of migration.queries) {
      await db.prepare(query).run();
    }
  }
}
