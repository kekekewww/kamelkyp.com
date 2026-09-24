/**
 * Lifecycle engine (content-schema §1.3, §1.5, §3.1, §5.1).
 *
 * Each row carries an editable working copy and `published_json`, the frozen
 * snapshot the `<type>_snapshots` view produces at Publish. Saves bump
 * `revision` (optimistic concurrency); Publish validates the working copy and
 * freezes it in one guarded batch; placement (featured, order, showreel) is
 * live immediately and never versioned.
 */
import { findBrandViolations } from "../brand-guard.server";
import { studioLabel } from "../localized";
import { getAssets } from "../media/assets.server";
import {
  fallbackSlug,
  isValidSlug,
  nextCopySlug,
  slugify,
  uniqueSlug,
} from "../slug";
import type {
  EntityMeta,
  EntityType,
  EntryStatus,
  SluggedEntityType,
  ValidationIssue,
} from "../types";
import {
  type AssetSummary,
  hasBlockingIssues,
  structuralIssues,
  validateForPublish,
} from "../validation";
import { CmsError, mapD1Error } from "./errors";
import {
  deleteRedirectsStatement,
  publishRedirectStatements,
} from "./redirects.server";
import {
  type ContentOf,
  descriptorFor,
  type EntityDescriptor,
  metaColumns,
} from "./tables.server";
import { extractAssetRefs, syncUsages } from "./usage.server";

export type { ContentOf };

export type Loaded<T extends EntityType> = {
  meta: EntityMeta;
  content: ContentOf<T>;
  published: ContentOf<T> | null;
};

export type PublishOutcome =
  | { ok: true; meta: EntityMeta }
  | { ok: false; issues: ValidationIssue[] };

type MetaRow = {
  id: string;
  status: EntryStatus;
  todo_content: number;
  featured: number;
  featured_order: number | null;
  sort_order: number;
  revision: number;
  published_revision: number | null;
  has_snapshot: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  first_published_at: string | null;
  archived_at: string | null;
  label_json: string;
  slug?: string;
  published_slug?: string | null;
  listed?: number;
  is_showreel?: number;
  commission_service_id?: string | null;
};

type FullRow = MetaRow & { published_json: string | null; working: string };

function metaFromRow(type: EntityType, row: MetaRow): EntityMeta {
  return {
    id: row.id,
    type,
    status: row.status,
    todoContent: row.todo_content === 1,
    featured: row.featured === 1,
    featuredOrder: row.featured_order,
    sortOrder: row.sort_order,
    revision: row.revision,
    publishedRevision: row.published_revision,
    hasUnpublishedChanges:
      row.has_snapshot === 1 &&
      row.published_revision !== null &&
      row.revision !== row.published_revision,
    ...(row.slug !== undefined ? { slug: row.slug } : {}),
    ...(row.published_slug !== undefined
      ? { publishedSlug: row.published_slug }
      : {}),
    ...(row.listed !== undefined ? { listed: row.listed === 1 } : {}),
    ...(row.is_showreel !== undefined
      ? { isShowreel: row.is_showreel === 1 }
      : {}),
    ...(row.commission_service_id !== undefined
      ? { commissionServiceId: row.commission_service_id }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    firstPublishedAt: row.first_published_at,
    archivedAt: row.archived_at,
  };
}

async function loadRow<T extends EntityType>(
  db: D1Database,
  descriptor: EntityDescriptor<T>,
  id: string,
): Promise<FullRow | null> {
  return db
    .prepare(
      `SELECT ${metaColumns(descriptor as EntityDescriptor)}, t.published_json, v.snapshot AS working
       FROM ${descriptor.table} t JOIN ${descriptor.view} v ON v.id = t.id
       WHERE t.id = ?`,
    )
    .bind(id)
    .first<FullRow>();
}

async function requireRow<T extends EntityType>(
  db: D1Database,
  descriptor: EntityDescriptor<T>,
  id: string,
): Promise<FullRow> {
  const row = await loadRow(db, descriptor, id);
  if (!row) throw new CmsError("not_found");
  return row;
}

async function loadMeta(
  db: D1Database,
  type: EntityType,
  id: string,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type) as EntityDescriptor;
  const row = await db
    .prepare(
      `SELECT ${metaColumns(descriptor)} FROM ${descriptor.table} t WHERE t.id = ?`,
    )
    .bind(id)
    .first<MetaRow>();
  if (!row) throw new CmsError("not_found");
  return metaFromRow(type, row);
}

function parseSnapshot<T extends EntityType>(
  descriptor: EntityDescriptor<T>,
  json: string | null,
): ContentOf<T> | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = descriptor.snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("cms_snapshot_invalid", descriptor.type);
    return null;
  }
  return parsed.data;
}

function parseContent<T extends EntityType>(
  descriptor: EntityDescriptor<T>,
  input: unknown,
): ContentOf<T> {
  const parsed = descriptor.draftSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new CmsError("invalid_content", {
      issues: structuralIssues(parsed.error),
    });
  }
  return parsed.data;
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapD1Error(error);
  }
}

function categoryStatements(
  db: D1Database,
  input: {
    id: string;
    categoryIds: string[];
    guard?: { revision: number; updatedAt: string };
  },
): D1PreparedStatement[] {
  const guard = input.guard
    ? "AND EXISTS (SELECT 1 FROM projects WHERE id = ?1 AND revision = ?3 AND updated_at = ?4)"
    : "";
  const bind = (statement: D1PreparedStatement, ...extra: unknown[]) =>
    input.guard
      ? statement.bind(
          input.id,
          ...extra,
          input.guard.revision,
          input.guard.updatedAt,
        )
      : statement.bind(input.id, ...extra);
  return [
    bind(
      db.prepare(
        `DELETE FROM project_categories WHERE project_id = ?1 AND ?2 = ?2 ${guard}`,
      ),
      0,
    ),
    bind(
      db.prepare(
        `INSERT INTO project_categories (project_id, term_id, position)
         SELECT ?1, j.value, CAST(j.key AS INTEGER) FROM json_each(?2) j WHERE 1 ${guard}`,
      ),
      JSON.stringify(input.categoryIds),
    ),
  ];
}

async function takenSlugs(
  db: D1Database,
  descriptor: EntityDescriptor,
  base: string,
  excludeId?: string,
): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT slug AS s FROM ${descriptor.table}
         WHERE (slug = ?1 OR slug GLOB ?2) AND id IS NOT ?3
       UNION
       SELECT published_slug FROM ${descriptor.table}
         WHERE (published_slug = ?1 OR published_slug GLOB ?2) AND id IS NOT ?3`,
    )
    .bind(base, `${base}-*`, excludeId ?? null)
    .all<{ s: string | null }>();
  return new Set(
    rows.results.map((row) => row.s).filter((slug): slug is string => !!slug),
  );
}

function withSlug<T extends EntityType>(
  content: ContentOf<T>,
  slug: string,
): ContentOf<T> {
  return { ...(content as object), slug } as ContentOf<T>;
}

function slugOf(content: unknown): string {
  return (content as { slug?: string }).slug ?? "";
}

async function insertEntity<T extends EntityType>(
  db: D1Database,
  descriptor: EntityDescriptor<T>,
  content: ContentOf<T>,
  options: { todoContent: boolean; now: Date },
): Promise<EntityMeta> {
  const id = crypto.randomUUID();
  const timestamp = options.now.toISOString();
  const columns = descriptor.toColumns(content, { commissionLinked: false });
  const names = Object.keys(columns);
  const insert = db
    .prepare(
      `INSERT INTO ${descriptor.table} (id, status, todo_content, sort_order, revision, created_at, updated_at, ${names.join(", ")})
       VALUES (?1, 'draft', ?2, (SELECT COALESCE(MIN(sort_order), 10) - 10 FROM ${descriptor.table}), 0, ?3, ?3,
       ${names.map((_, index) => `?${index + 4}`).join(", ")})`,
    )
    .bind(
      id,
      options.todoContent ? 1 : 0,
      timestamp,
      ...names.map((name) => columns[name] ?? null),
    );
  const statements = [insert];
  if (descriptor.type === "project") {
    statements.push(
      ...categoryStatements(db, {
        id,
        categoryIds: (content as ContentOf<"project">).categoryIds,
      }),
    );
  }
  await run(() => db.batch(statements));
  await syncUsages(db, descriptor.type, id, {
    working: extractAssetRefs(descriptor.type, content),
    published: [],
  });
  return loadMeta(db, descriptor.type, id);
}

/** Loads the working copy and (if any) the frozen published snapshot. */
export async function getEntity<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
): Promise<Loaded<T> | null> {
  const descriptor = descriptorFor(type);
  const row = await loadRow(db, descriptor, id);
  if (!row) return null;
  const content = parseSnapshot(descriptor, row.working);
  if (!content) throw new CmsError("invalid_content");
  return {
    meta: metaFromRow(type, row),
    content,
    published: parseSnapshot(descriptor, row.published_json),
  };
}

/** Preview input: the view's output for the working copy. */
export async function getWorkingSnapshot<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
): Promise<ContentOf<T> | null> {
  const descriptor = descriptorFor(type);
  const row = await db
    .prepare(`SELECT snapshot FROM ${descriptor.view} WHERE id = ?`)
    .bind(id)
    .first<{ snapshot: string }>();
  return parseSnapshot(descriptor, row?.snapshot ?? null);
}

export async function createEntity<T extends EntityType>(
  db: D1Database,
  type: T,
  input: Partial<ContentOf<T>> | Record<string, unknown>,
  options: { todoContent?: boolean; now?: Date } = {},
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type);
  let content = parseContent(descriptor, input);
  if (descriptor.slugged) {
    const base =
      slugOf(content) ||
      slugify(descriptor.slugSource(content)) ||
      fallbackSlug(descriptor.fallbackSlugPrefix);
    const taken = await takenSlugs(db, descriptor as EntityDescriptor, base);
    content = withSlug(content, uniqueSlug(base, taken));
  }
  return insertEntity(db, descriptor, content, {
    todoContent: options.todoContent ?? false,
    now: options.now ?? new Date(),
  });
}

/** Saves the working copy. Never blocked by completeness; 409 on a stale revision. */
export async function saveEntity<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
  expectedRevision: number,
  input: ContentOf<T>,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type);
  const current = await loadMeta(db, type, id);
  let content = parseContent(descriptor, input);
  const commissionLinked = Boolean(current.commissionServiceId);

  if (descriptor.slugged) {
    const requested = slugOf(content);
    if (!requested || commissionLinked) {
      content = withSlug(content, current.slug ?? "");
    } else if (requested !== current.slug) {
      const check = await checkSlug(
        db,
        type as SluggedEntityType,
        requested,
        id,
      );
      if (!check.available) throw new CmsError("slug_taken", check.conflict);
    }
  }

  const columns = descriptor.toColumns(content, { commissionLinked });
  const names = Object.keys(columns);
  const timestamp = now.toISOString();
  const statements = [
    db
      .prepare(
        `UPDATE ${descriptor.table} SET ${names
          .map((name, index) => `${name} = ?${index + 4}`)
          .join(", ")}, revision = revision + 1, updated_at = ?3
         WHERE id = ?1 AND revision = ?2`,
      )
      .bind(
        id,
        expectedRevision,
        timestamp,
        ...names.map((name) => columns[name] ?? null),
      ),
  ];
  if (type === "project") {
    statements.push(
      ...categoryStatements(db, {
        id,
        categoryIds: (content as ContentOf<"project">).categoryIds,
        guard: { revision: expectedRevision + 1, updatedAt: timestamp },
      }),
    );
  }
  const results = await run(() => db.batch(statements));
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new CmsError("stale_revision");
  }

  const published =
    current.status === "published"
      ? await publishedRefs(db, descriptor, id)
      : [];
  await syncUsages(db, type, id, {
    working: extractAssetRefs(type, content),
    published,
  });
  return loadMeta(db, type, id);
}

async function publishedRefs<T extends EntityType>(
  db: D1Database,
  descriptor: EntityDescriptor<T>,
  id: string,
) {
  const row = await db
    .prepare(`SELECT published_json FROM ${descriptor.table} WHERE id = ?`)
    .bind(id)
    .first<{ published_json: string | null }>();
  const snapshot = parseSnapshot(descriptor, row?.published_json ?? null);
  return snapshot ? extractAssetRefs(descriptor.type, snapshot) : [];
}

async function publishIssues<T extends EntityType>(
  db: D1Database,
  descriptor: EntityDescriptor<T>,
  row: FullRow,
  content: ContentOf<T>,
): Promise<ValidationIssue[]> {
  const meta = metaFromRow(descriptor.type, row);
  const refs = extractAssetRefs(descriptor.type, content);
  const assets = await getAssets(
    db,
    refs.map((ref) => ref.assetId),
  );
  const summaries = new Map<string, AssetSummary>(
    [...assets.values()].map((asset) => [
      asset.id,
      { id: asset.id, kind: asset.kind, state: asset.state, alt: asset.alt },
    ]),
  );
  let slugAvailable: boolean | undefined;
  const slug = slugOf(content);
  if (descriptor.slugged && slug && isValidSlug(slug)) {
    slugAvailable = (
      await checkSlug(db, descriptor.type as SluggedEntityType, slug, row.id)
    ).available;
  }
  return validateForPublish(descriptor.type, content, {
    todoContent: meta.todoContent,
    assets: summaries,
    slugAvailable,
    brandViolations: findBrandViolations(content),
    snapshotBytes: new TextEncoder().encode(row.working).length,
    isShowreel: meta.isShowreel,
    commissionLinked: Boolean(meta.commissionServiceId),
  });
}

/** Publish readiness for the Studio checklist (server view of the saved copy). */
export async function validateEntity<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
): Promise<ValidationIssue[]> {
  const descriptor = descriptorFor(type);
  const row = await requireRow(db, descriptor, id);
  const content = parseSnapshot(descriptor, row.working);
  if (!content) throw new CmsError("invalid_content");
  return publishIssues(db, descriptor, row, content);
}

export async function publishEntity<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
  expectedRevision: number,
  now: Date,
): Promise<PublishOutcome> {
  const descriptor = descriptorFor(type);
  const row = await requireRow(db, descriptor, id);
  if (row.revision !== expectedRevision) throw new CmsError("stale_revision");
  if (row.status === "archived") throw new CmsError("invalid_state");
  const content = parseSnapshot(descriptor, row.working);
  if (!content) throw new CmsError("invalid_content");

  const issues = await publishIssues(db, descriptor, row, content);
  if (hasBlockingIssues(issues)) return { ok: false, issues };

  const timestamp = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  if (descriptor.redirectType) {
    statements.push(
      ...publishRedirectStatements(db, descriptor.redirectType, {
        id,
        expectedRevision,
        now: timestamp,
      }),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE ${descriptor.table} SET
           status = 'published',
           published_json = (SELECT s.snapshot FROM ${descriptor.view} s WHERE s.id = ${descriptor.table}.id),
           ${descriptor.slugged ? "published_slug = slug," : ""}
           published_revision = revision,
           published_at = ?2,
           first_published_at = COALESCE(first_published_at, ?2),
           archived_at = NULL,
           updated_at = ?2
         WHERE id = ?1 AND revision = ?3 AND todo_content = 0`,
      )
      .bind(id, timestamp, expectedRevision),
  );
  const results = await run(() => db.batch(statements));
  if ((results[results.length - 1]?.meta.changes ?? 0) === 0) {
    throw new CmsError("stale_revision");
  }
  const refs = extractAssetRefs(type, content);
  await syncUsages(db, type, id, { working: refs, published: refs });
  return { ok: true, meta: await loadMeta(db, type, id) };
}

async function workingRefs<T extends EntityType>(
  db: D1Database,
  type: T,
  id: string,
) {
  const content = await getWorkingSnapshot(db, type, id);
  return content ? extractAssetRefs(type, content) : [];
}

/** Published → draft. Keeps the snapshot and published slug (Revert, redirects). */
export async function unpublishEntity(
  db: D1Database,
  type: EntityType,
  id: string,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type);
  const meta = await loadMeta(db, type, id);
  if (meta.status !== "published") throw new CmsError("invalid_state");
  await run(() =>
    db
      .prepare(
        `UPDATE ${descriptor.table} SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'published'`,
      )
      .bind(now.toISOString(), id)
      .run(),
  );
  await syncUsages(db, type, id, {
    working: await workingRefs(db, type, id),
    published: [],
  });
  return loadMeta(db, type, id);
}

/** Hides the row and releases its homepage slots. Commission services refuse. */
export async function archiveEntity(
  db: D1Database,
  type: EntityType,
  id: string,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type);
  const meta = await loadMeta(db, type, id);
  if (meta.status === "archived") throw new CmsError("invalid_state");
  const timestamp = now.toISOString();
  await run(() =>
    db
      .prepare(
        `UPDATE ${descriptor.table} SET status = 'archived', featured = 0, featured_order = NULL,
           ${descriptor.hasShowreel ? "is_showreel = 0," : ""}
           archived_at = ?1, updated_at = ?1
         WHERE id = ?2 AND status <> 'archived'`,
      )
      .bind(timestamp, id)
      .run(),
  );
  await syncUsages(db, type, id, {
    working: await workingRefs(db, type, id),
    published: [],
  });
  return loadMeta(db, type, id);
}

/** Archived → draft. */
export async function restoreEntity(
  db: D1Database,
  type: EntityType,
  id: string,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type);
  const meta = await loadMeta(db, type, id);
  if (meta.status !== "archived") throw new CmsError("invalid_state");
  await run(() =>
    db
      .prepare(
        `UPDATE ${descriptor.table} SET status = 'draft', archived_at = NULL, updated_at = ? WHERE id = ? AND status = 'archived'`,
      )
      .bind(now.toISOString(), id)
      .run(),
  );
  return loadMeta(db, type, id);
}

/** Copies the snapshot back into the working columns ("Revert to published"). */
export async function revertToPublished(
  db: D1Database,
  type: EntityType,
  id: string,
  expectedRevision: number,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type) as EntityDescriptor;
  const row = await requireRow(db, descriptor, id);
  if (row.revision !== expectedRevision) throw new CmsError("stale_revision");
  const published = parseSnapshot(descriptor, row.published_json);
  if (!published) throw new CmsError("invalid_state");
  const columns = descriptor.toColumns(published, {
    commissionLinked: Boolean(row.commission_service_id),
  });
  const names = Object.keys(columns);
  const timestamp = now.toISOString();
  const statements = [
    db
      .prepare(
        `UPDATE ${descriptor.table} SET ${names
          .map((name, index) => `${name} = ?${index + 4}`)
          .join(
            ", ",
          )}, revision = revision + 1, published_revision = revision + 1, updated_at = ?3
         WHERE id = ?1 AND revision = ?2`,
      )
      .bind(
        id,
        expectedRevision,
        timestamp,
        ...names.map((name) => columns[name] ?? null),
      ),
  ];
  if (type === "project") {
    statements.push(
      ...categoryStatements(db, {
        id,
        categoryIds: (published as ContentOf<"project">).categoryIds,
        guard: { revision: expectedRevision + 1, updatedAt: timestamp },
      }),
    );
  }
  const results = await run(() => db.batch(statements));
  if ((results[0]?.meta.changes ?? 0) === 0)
    throw new CmsError("stale_revision");
  const refs = extractAssetRefs(type, published);
  await syncUsages(db, type, id, {
    working: refs,
    published: row.status === "published" ? refs : [],
  });
  return loadMeta(db, type, id);
}

/** Draft copy: slug "-copy[-n]", not featured, never the showreel. */
export async function duplicateEntity(
  db: D1Database,
  type: EntityType,
  id: string,
  now: Date,
): Promise<EntityMeta> {
  const descriptor = descriptorFor(type) as EntityDescriptor;
  const row = await requireRow(db, descriptor, id);
  let content = parseSnapshot(descriptor, row.working);
  if (!content) throw new CmsError("invalid_content");
  if (descriptor.slugged && row.slug) {
    const base = `${row.slug}-copy`;
    const taken = await takenSlugs(db, descriptor, base);
    content = withSlug(content, nextCopySlug(row.slug, taken));
  }
  return insertEntity(db, descriptor, content, {
    todoContent: row.todo_content === 1,
    now,
  });
}

/** Permanent delete: only draft/archived rows, after typing the slug (or DELETE). */
export async function deleteEntity(
  db: D1Database,
  type: EntityType,
  id: string,
  confirmation: string,
): Promise<void> {
  const descriptor = descriptorFor(type) as EntityDescriptor;
  const meta = await loadMeta(db, type, id);
  if (meta.status === "published") {
    throw new CmsError("published_entity_delete_forbidden");
  }
  const expected = descriptor.slugged ? (meta.slug ?? "") : "DELETE";
  if (confirmation.trim() !== expected) {
    throw new CmsError("confirmation_mismatch");
  }
  const statements = [
    db
      .prepare(
        "DELETE FROM media_usages WHERE entity_type = ? AND entity_id = ?",
      )
      .bind(type, id),
    ...(descriptor.redirectType
      ? [deleteRedirectsStatement(db, descriptor.redirectType, id)]
      : []),
    db.prepare(`DELETE FROM ${descriptor.table} WHERE id = ?`).bind(id),
  ];
  await run(() => db.batch(statements));
}

/** Homepage curation: live immediately; featuring appends to the order. */
export async function setFeatured(
  db: D1Database,
  type: EntityType,
  id: string,
  featured: boolean,
): Promise<void> {
  const descriptor = descriptorFor(type);
  const meta = await loadMeta(db, type, id);
  if (!featured) {
    await db
      .prepare(
        `UPDATE ${descriptor.table} SET featured = 0, featured_order = NULL WHERE id = ?`,
      )
      .bind(id)
      .run();
    return;
  }
  if (meta.status === "archived") throw new CmsError("invalid_state");
  if (meta.featured) return;
  await db
    .prepare(
      `UPDATE ${descriptor.table} SET featured = 1,
         featured_order = (SELECT COALESCE(MAX(featured_order), -10) + 10 FROM ${descriptor.table} WHERE featured = 1)
       WHERE id = ? AND featured = 0`,
    )
    .bind(id)
    .run();
}

/** Reorders any number of rows with one statement (`json_each`). */
export async function reorder(
  db: D1Database,
  type: EntityType,
  orderedIds: string[],
  field: "sort_order" | "featured_order",
): Promise<void> {
  const descriptor = descriptorFor(type);
  const ids = JSON.stringify([...new Set(orderedIds)]);
  await db
    .prepare(
      `UPDATE ${descriptor.table}
       SET ${field} = (SELECT CAST(j.key AS INTEGER) * 10 FROM json_each(?1) j WHERE j.value = ${descriptor.table}.id)
       WHERE id IN (SELECT value FROM json_each(?1))${field === "featured_order" ? " AND featured = 1" : ""}`,
    )
    .bind(ids)
    .run();
}

/** Exactly one homepage showreel (or none). */
export async function setShowreel(
  db: D1Database,
  trackId: string | null,
): Promise<void> {
  if (trackId) {
    const meta = await loadMeta(db, "music", trackId);
    if (meta.status === "archived") throw new CmsError("invalid_state");
  }
  await run(() =>
    db.batch([
      db.prepare(
        "UPDATE music_tracks SET is_showreel = 0 WHERE is_showreel = 1",
      ),
      ...(trackId
        ? [
            db
              .prepare(
                "UPDATE music_tracks SET is_showreel = 1 WHERE id = ? AND status <> 'archived'",
              )
              .bind(trackId),
          ]
        : []),
    ]),
  );
}

/** Picker options (relations, homepage "Add…"). Label = zh, then en. */
export async function listEntityOptions(
  db: D1Database,
  type: EntityType,
  options: { q?: string; statuses?: EntryStatus[]; limit?: number } = {},
): Promise<Array<{ id: string; label: string; status: EntryStatus }>> {
  const descriptor = descriptorFor(type);
  const statuses = options.statuses ?? ["draft", "published"];
  const q = options.q?.trim().toLowerCase() || null;
  const search = descriptor.searchColumns
    .map((column) => `lower(${column})`)
    .join(" || ' ' || ");
  const rows = await db
    .prepare(
      `SELECT id, ${descriptor.labelColumn} AS label_json, status FROM ${descriptor.table}
       WHERE status IN (SELECT value FROM json_each(?1))
         AND (?2 IS NULL OR instr(${search}, ?2) > 0)
       ORDER BY sort_order, updated_at DESC LIMIT ?3`,
    )
    .bind(JSON.stringify(statuses), q, Math.min(options.limit ?? 50, 200))
    .all<{ id: string; label_json: string; status: EntryStatus }>();
  return rows.results.map((row) => ({
    id: row.id,
    label: studioLabel(JSON.parse(row.label_json)),
    status: row.status,
  }));
}

export type SlugConflict = {
  id: string;
  label: string;
  status: EntryStatus;
  kind: "working" | "published" | "redirect";
};

/** Live slug check: another row's working or live slug blocks; a redirect warns. */
export async function checkSlug(
  db: D1Database,
  type: SluggedEntityType,
  slug: string,
  excludeId?: string,
): Promise<{ available: boolean; conflict?: SlugConflict }> {
  if (!isValidSlug(slug)) return { available: false };
  const descriptor = descriptorFor(type);
  const exclude = excludeId ?? null;
  const find = async (column: "slug" | "published_slug") =>
    db
      .prepare(
        `SELECT id, ${descriptor.labelColumn} AS label_json, status FROM ${descriptor.table}
         WHERE ${column} = ? AND id IS NOT ? LIMIT 1`,
      )
      .bind(slug, exclude)
      .first<{ id: string; label_json: string; status: EntryStatus }>();
  const toConflict = (
    row: { id: string; label_json: string; status: EntryStatus },
    kind: SlugConflict["kind"],
  ): SlugConflict => ({
    id: row.id,
    label: studioLabel(JSON.parse(row.label_json)),
    status: row.status,
    kind,
  });

  const working = await find("slug");
  if (working)
    return { available: false, conflict: toConflict(working, "working") };
  const published = await find("published_slug");
  if (published) {
    return { available: false, conflict: toConflict(published, "published") };
  }
  if (descriptor.redirectType) {
    const redirect = await db
      .prepare(
        `SELECT e.id, e.${descriptor.labelColumn} AS label_json, e.status FROM slug_redirects r
         JOIN ${descriptor.table} e ON e.id = r.entity_id
         WHERE r.entity_type = ? AND r.from_slug = ? AND r.entity_id IS NOT ?`,
      )
      .bind(descriptor.redirectType, slug, exclude)
      .first<{ id: string; label_json: string; status: EntryStatus }>();
    if (redirect) {
      return { available: true, conflict: toConflict(redirect, "redirect") };
    }
  }
  return { available: true };
}
