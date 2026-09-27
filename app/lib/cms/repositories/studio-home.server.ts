/**
 * Studio home (brief §26–27, admin-architecture §4.2): an editorial overview,
 * not analytics. Counts per type and status, the 15 latest edits, what needs
 * attention (each row links to the fix), the homepage as it is curated now,
 * and the commission queue. Every table is read here with its own queries
 * (read-only); one `db.batch` per page load.
 *
 * `collectAttention` also feeds the sidebar badge (`getStudioCounts`), so the
 * number next to HOME always equals the rows on the home list.
 */
import { studioLabel } from "../localized";
import {
  HOMEPAGE_SECTIONS,
  type HomepageSection,
} from "../schemas/site-settings";
import { settingsFromRows, settingsStatement } from "../settings.server";
import { ENTITY_TYPES, type EntityType, type EntryStatus } from "../types";

// ---- Types ---------------------------------------------------------------------

export type AttentionSeverity = "high" | "medium" | "low";

export type AttentionItem = {
  /** Stable identity, e.g. `contact-email`, `changes:project:<id>`. */
  key: string;
  severity: AttentionSeverity;
  title: string;
  detail?: string;
  href: string;
  /** Label of the link that fixes it. */
  action: string;
  count?: number;
};

export type ContentCountRow = {
  type: EntityType;
  label: string;
  href: string;
  published: number;
  draft: number;
  archived: number;
  todo: number;
};

export type RecentChange = {
  kind: EntityType | "settings" | "social";
  id: string;
  label: string;
  status: EntryStatus | null;
  updatedAt: string;
  href: string;
};

export type HomepageSummary = {
  showreel: { id: string; label: string; status: EntryStatus } | null;
  featuredProjects: Array<{ id: string; label: string; status: EntryStatus }>;
  featuredProjectLimit: number;
  featuredCounts: Record<Exclude<EntityType, "project">, number>;
  sections: { visible: HomepageSection[]; hidden: HomepageSection[] };
};

export type CommissionQueue = {
  pendingReview: number;
  awaitingDeposit: number;
  inProduction: number;
  studentReviews: number;
  cleanupDue: number;
};

export type StudioHomeModel = {
  now: string;
  counts: ContentCountRow[];
  recent: RecentChange[];
  attention: AttentionItem[];
  homepage: HomepageSummary;
  commissions: CommissionQueue;
};

// ---- Type metadata ---------------------------------------------------------------

type TypeInfo = {
  table: string;
  label: string;
  /** Plural noun for sentences ("6 sample projects"). */
  noun: [singular: string, plural: string];
  labelColumn: string;
  base: string;
  /** Localized columns that must be complete in both locales once live. */
  required: readonly string[];
};

export const TYPE_INFO: Record<EntityType, TypeInfo> = {
  project: {
    table: "projects",
    label: "Projects",
    noun: ["project", "projects"],
    labelColumn: "title_i18n",
    base: "/studio/projects",
    required: ["title_i18n", "short_description_i18n"],
  },
  music: {
    table: "music_tracks",
    label: "Music",
    noun: ["music entry", "music entries"],
    labelColumn: "title_i18n",
    base: "/studio/music",
    required: ["title_i18n", "artist_i18n"],
  },
  recognition: {
    table: "recognitions",
    label: "Recognition",
    noun: ["recognition entry", "recognition entries"],
    labelColumn: "event_i18n",
    base: "/studio/recognition",
    required: ["event_i18n"],
  },
  writing: {
    table: "writings",
    label: "Writing",
    noun: ["writing entry", "writing entries"],
    labelColumn: "title_i18n",
    base: "/studio/writing",
    required: ["title_i18n"],
  },
  service: {
    table: "services",
    label: "Services",
    noun: ["service", "services"],
    labelColumn: "name_i18n",
    base: "/studio/services",
    required: ["name_i18n", "description_i18n"],
  },
};

function editorHref(type: EntityType, id: string): string {
  return `${TYPE_INFO[type].base}/${id}`;
}

function plural(type: EntityType, count: number): string {
  const [one, many] = TYPE_INFO[type].noun;
  return `${count} ${count === 1 ? one : many}`;
}

function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

// ---- Attention ------------------------------------------------------------------

type SettingsRowShape = {
  key: "brand" | "site";
  data_json: string;
  revision: number;
};
type LabelRow = {
  type: string;
  id: string;
  label_json: string;
  status: EntryStatus;
};
type LocaleRow = LabelRow & { zh_missing: number; en_missing: number };

const unionAll = (parts: string[]) => parts.join("\nUNION ALL\n");

function emptyIn(column: string, locale: "zh" | "en") {
  return `trim(COALESCE(json_extract(${column}, '$.${locale}'), '')) = ''`;
}

function attentionStatements(db: D1Database, now: Date) {
  const stale = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  return [
    settingsStatement(db),
    db.prepare(
      "SELECT id, title_i18n AS label_json, status FROM music_tracks WHERE is_showreel = 1 LIMIT 1",
    ),
    db.prepare(
      "SELECT COUNT(*) AS n FROM projects WHERE featured = 1 AND status = 'published'",
    ),
    db.prepare(
      `${unionAll(
        ENTITY_TYPES.map((type) => {
          const info = TYPE_INFO[type];
          return `SELECT '${type}' AS type, id, ${info.labelColumn} AS label_json, status, updated_at
                  FROM ${info.table}
                  WHERE status = 'published' AND published_json IS NOT NULL
                    AND published_revision IS NOT NULL AND revision <> published_revision`;
        }),
      )} ORDER BY updated_at DESC LIMIT 50`,
    ),
    db.prepare(
      `${unionAll(
        ENTITY_TYPES.map((type) => {
          const info = TYPE_INFO[type];
          const zh = info.required.map((c) => emptyIn(c, "zh")).join(" OR ");
          const en = info.required.map((c) => emptyIn(c, "en")).join(" OR ");
          return `SELECT '${type}' AS type, id, ${info.labelColumn} AS label_json, status,
                    (${zh}) AS zh_missing, (${en}) AS en_missing, updated_at
                  FROM ${info.table}
                  WHERE status = 'published' AND ((${zh}) OR (${en}))`;
        }),
      )} ORDER BY updated_at DESC LIMIT 50`,
    ),
    db.prepare(
      unionAll(
        ENTITY_TYPES.map(
          (type) =>
            `SELECT '${type}' AS type, COUNT(*) AS n FROM ${TYPE_INFO[type].table}
             WHERE todo_content = 1 AND status <> 'archived'`,
        ),
      ),
    ),
    db.prepare(
      `SELECT COUNT(DISTINCT a.id) AS n FROM media_assets a
       JOIN media_usages u ON u.asset_id = a.id
       WHERE u.scope = 'published' AND a.kind = 'image'
         AND (${emptyIn("a.alt_i18n", "zh")} OR ${emptyIn("a.alt_i18n", "en")})`,
    ),
    db
      .prepare(
        `SELECT COALESCE(SUM(state = 'pending' AND created_at < ?1), 0) AS pending,
                COALESCE(SUM(state = 'failed'), 0) AS failed
         FROM media_assets`,
      )
      .bind(stale),
    db.prepare(
      `SELECT COALESCE(SUM(status = 'pending_review'), 0) AS review,
              COALESCE(SUM(status = 'pending_deposit'), 0) AS deposit,
              COALESCE(SUM(status = 'in_production'), 0) AS production
       FROM cases`,
    ),
    db
      .prepare(
        `SELECT COALESCE(SUM(student_review_state = 'pending'), 0) AS student,
                COALESCE(SUM(cleanup_due_at IS NOT NULL AND cleanup_due_at <= ?1), 0) AS cleanup
         FROM case_runtime`,
      )
      .bind(now.toISOString()),
  ];
}

type AttentionFacts = {
  attention: AttentionItem[];
  settings: ReturnType<typeof settingsFromRows>;
  showreel: HomepageSummary["showreel"];
  commissions: CommissionQueue;
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function rows<T>(result: D1Result | undefined): T[] {
  return (result?.results ?? []) as T[];
}

function first<T>(result: D1Result | undefined): T | undefined {
  return rows<T>(result)[0];
}

function buildAttention(results: D1Result[]): AttentionFacts {
  const [
    settingsResult,
    showreelResult,
    featuredResult,
    changesResult,
    localeResult,
    todoResult,
    altResult,
    uploadsResult,
    casesResult,
    runtimeResult,
  ] = results;
  const settings = settingsFromRows(rows<SettingsRowShape>(settingsResult));
  const brand = settings.brand.value;
  const items: AttentionItem[] = [];

  if (!brand.contactEmailConfirmedAt) {
    items.push({
      key: "contact-email",
      severity: "high",
      title: brand.contactEmail
        ? "Review the public contact email"
        : "Add a public contact email",
      detail: brand.contactEmail
        ? "Confirm the address or change it to one under the Kamel brand."
        : "Contact sections stay hidden until an address is set.",
      href: "/studio/settings/brand#contact",
      action: "Open brand settings",
    });
  }
  if (!brand.redesignCopyAcknowledgedAt) {
    items.push({
      key: "redesign-copy",
      severity: "medium",
      title: "Review copy migrated from the redesign",
      detail:
        "About, capabilities, hero, software services and service areas went live as written.",
      href: "/studio/settings/brand#review",
      action: "Review copy",
    });
  }

  const reel = first<{ id: string; label_json: string; status: EntryStatus }>(
    showreelResult,
  );
  const showreel = reel
    ? {
        id: reel.id,
        label: studioLabel(JSON.parse(reel.label_json)),
        status: reel.status,
      }
    : null;
  if (!showreel) {
    items.push({
      key: "showreel-missing",
      severity: "medium",
      title: "No homepage showreel",
      detail: "The showreel section shows its empty player.",
      href: "/studio/homepage#showreel",
      action: "Choose a track",
    });
  } else if (showreel.status !== "published") {
    items.push({
      key: "showreel-unpublished",
      severity: "high",
      title: `Showreel “${showreel.label}” is not published`,
      detail: "Visitors see the empty player until the track is published.",
      href: editorHref("music", showreel.id),
      action: "Open the track",
    });
  }

  if ((first<{ n: number }>(featuredResult)?.n ?? 0) === 0) {
    items.push({
      key: "no-featured-projects",
      severity: "medium",
      title: "No published projects are featured",
      detail: "Selected Work stays hidden on the homepage.",
      href: "/studio/homepage#featured-project",
      action: "Feature projects",
    });
  }

  for (const row of rows<LocaleRow>(localeResult)) {
    if (!isEntityType(row.type)) continue;
    const missing = [
      row.zh_missing ? "ZH" : null,
      row.en_missing ? "EN" : null,
    ].filter(Boolean);
    items.push({
      key: `locale:${row.type}:${row.id}`,
      severity: "high",
      title: `${missing.join(" and ")} missing: ${studioLabel(JSON.parse(row.label_json))}`,
      detail: `Published, but hidden on the ${
        row.en_missing && !row.zh_missing ? "English" : "Chinese"
      } site until the required text exists in both languages.`,
      href: editorHref(row.type, row.id),
      action: "Add the translation",
    });
  }

  for (const row of rows<LabelRow>(changesResult)) {
    if (!isEntityType(row.type)) continue;
    items.push({
      key: `changes:${row.type}:${row.id}`,
      severity: "medium",
      title: `Unpublished changes: ${studioLabel(JSON.parse(row.label_json))}`,
      detail: "The live page still shows the last published version.",
      href: editorHref(row.type, row.id),
      action: "Publish or revert",
    });
  }

  const altCount = first<{ n: number }>(altResult)?.n ?? 0;
  if (altCount > 0) {
    items.push({
      key: "missing-alt",
      severity: "medium",
      title: `${altCount} ${altCount === 1 ? "image" : "images"} on live pages without alt text`,
      detail: "Add ZH and EN alt text in the media library.",
      href: "/studio/media?missingAlt=1",
      action: "Open media",
      count: altCount,
    });
  }

  for (const row of rows<{ type: string; n: number }>(todoResult)) {
    if (!isEntityType(row.type) || row.n === 0) continue;
    items.push({
      key: `todo:${row.type}`,
      severity: "low",
      title: `${plural(row.type, row.n)} still sample content`,
      detail: "TODO_CONTENT drafts never go live. Replace or archive them.",
      href: `${TYPE_INFO[row.type].base}?status=draft`,
      action: "Open drafts",
      count: row.n,
    });
  }

  const uploads = first<{ pending: number; failed: number }>(uploadsResult);
  const stuck = (uploads?.pending ?? 0) + (uploads?.failed ?? 0);
  if (stuck > 0) {
    items.push({
      key: "uploads",
      severity: "low",
      title: `${stuck} ${stuck === 1 ? "upload" : "uploads"} did not finish`,
      detail: "Retry or remove them in the media library.",
      href: "/studio/media",
      action: "Open media",
      count: stuck,
    });
  }

  const cases = first<{ review: number; deposit: number; production: number }>(
    casesResult,
  );
  const runtime = first<{ student: number; cleanup: number }>(runtimeResult);
  const commissions: CommissionQueue = {
    pendingReview: cases?.review ?? 0,
    awaitingDeposit: cases?.deposit ?? 0,
    inProduction: cases?.production ?? 0,
    studentReviews: runtime?.student ?? 0,
    cleanupDue: runtime?.cleanup ?? 0,
  };
  const caseRow = (
    key: string,
    count: number,
    severity: AttentionSeverity,
    one: string,
    many: string,
  ) => {
    if (count > 0) {
      items.push({
        key,
        severity,
        title: `${count} ${count === 1 ? one : many}`,
        href: "/studio/commissions",
        action: "Open commissions",
        count,
      });
    }
  };
  caseRow(
    "commissions-review",
    commissions.pendingReview,
    "high",
    "commission waiting for review",
    "commissions waiting for review",
  );
  caseRow(
    "student-review",
    commissions.studentReviews,
    "high",
    "student discount to check",
    "student discounts to check",
  );
  caseRow(
    "cleanup-due",
    commissions.cleanupDue,
    "medium",
    "case file cleanup due",
    "case file cleanups due",
  );

  const attention = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
        a.index - b.index,
    )
    .map(({ item }) => item);

  return { attention, settings, showreel, commissions };
}

/** The attention list alone (sidebar badge). */
export async function collectAttention(
  db: D1Database,
  now: Date,
): Promise<AttentionFacts> {
  return buildAttention(await db.batch(attentionStatements(db, now)));
}

// ---- Studio home ------------------------------------------------------------------

const RECENT_LIMIT = 15;

function homeStatements(db: D1Database) {
  return [
    db.prepare(
      unionAll(
        ENTITY_TYPES.map(
          (type) =>
            `SELECT '${type}' AS type, status,
                    COALESCE(SUM(todo_content = 1 AND status <> 'archived'), 0) AS todo,
                    COUNT(*) AS n
             FROM ${TYPE_INFO[type].table} GROUP BY status`,
        ),
      ),
    ),
    // D1 allows at most five terms per compound SELECT: content in one
    // statement, settings and social links in another, merged below.
    db.prepare(
      `${unionAll(
        ENTITY_TYPES.map((type) => {
          const info = TYPE_INFO[type];
          return `SELECT '${type}' AS kind, id, ${info.labelColumn} AS label_json, status, updated_at FROM ${info.table}`;
        }),
      )} ORDER BY updated_at DESC, kind, id LIMIT ${RECENT_LIMIT}`,
    ),
    db.prepare(
      `${unionAll([
        "SELECT 'settings' AS kind, key AS id, NULL AS label_json, NULL AS status, updated_at FROM settings",
        "SELECT 'social' AS kind, id, label_i18n AS label_json, NULL AS status, updated_at FROM social_links",
      ])} ORDER BY updated_at DESC, kind, id LIMIT ${RECENT_LIMIT}`,
    ),
    db.prepare(
      `SELECT id, title_i18n AS label_json, status FROM projects
       WHERE featured = 1 AND status <> 'archived'
       ORDER BY featured_order, sort_order, id`,
    ),
    db.prepare(
      unionAll(
        (["music", "recognition", "writing", "service"] as const).map(
          (type) =>
            `SELECT '${type}' AS type, COUNT(*) AS n FROM ${TYPE_INFO[type].table}
             WHERE featured = 1 AND status <> 'archived'`,
        ),
      ),
    ),
  ];
}

const SETTINGS_LABEL: Record<string, string> = {
  brand: "Brand settings",
  site: "Site settings",
};

export async function getStudioHome(
  db: D1Database,
  now: Date,
): Promise<StudioHomeModel> {
  const attentionPart = attentionStatements(db, now);
  const results = await db.batch([...attentionPart, ...homeStatements(db)]);
  const facts = buildAttention(results.slice(0, attentionPart.length));
  const [
    countsResult,
    recentContentResult,
    recentOtherResult,
    featuredResult,
    featuredCountsResult,
  ] = results.slice(attentionPart.length);

  const counts: ContentCountRow[] = ENTITY_TYPES.map((type) => ({
    type,
    label: TYPE_INFO[type].label,
    href: TYPE_INFO[type].base,
    published: 0,
    draft: 0,
    archived: 0,
    todo: 0,
  }));
  for (const row of rows<{
    type: string;
    status: EntryStatus;
    todo: number;
    n: number;
  }>(countsResult)) {
    const target = counts.find((count) => count.type === row.type);
    if (!target) continue;
    target[row.status] += row.n;
    target.todo += row.todo;
  }

  type RecentRow = {
    kind: string;
    id: string;
    label_json: string | null;
    status: EntryStatus | null;
    updated_at: string;
  };
  const recentRows = [
    ...rows<RecentRow>(recentContentResult),
    ...rows<RecentRow>(recentOtherResult),
  ]
    .sort(
      (a, b) =>
        b.updated_at.localeCompare(a.updated_at) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, RECENT_LIMIT);
  const recent: RecentChange[] = recentRows.map((row) => {
    if (isEntityType(row.kind)) {
      return {
        kind: row.kind,
        id: row.id,
        label: studioLabel(JSON.parse(row.label_json ?? "{}")),
        status: row.status,
        updatedAt: row.updated_at,
        href: editorHref(row.kind, row.id),
      };
    }
    if (row.kind === "settings") {
      return {
        kind: "settings",
        id: row.id,
        label: SETTINGS_LABEL[row.id] ?? "Settings",
        status: null,
        updatedAt: row.updated_at,
        href: `/studio/settings/${row.id === "site" ? "site" : "brand"}`,
      };
    }
    return {
      kind: "social",
      id: row.id,
      label: studioLabel(JSON.parse(row.label_json ?? "{}"), "Social link"),
      status: null,
      updatedAt: row.updated_at,
      href: "/studio/social",
    };
  });

  const featuredCounts = { music: 0, recognition: 0, writing: 0, service: 0 };
  for (const row of rows<{ type: keyof typeof featuredCounts; n: number }>(
    featuredCountsResult,
  )) {
    if (row.type in featuredCounts) featuredCounts[row.type] = row.n;
  }

  const site = facts.settings.site.value;
  const homepage: HomepageSummary = {
    showreel: facts.showreel,
    featuredProjects: rows<{
      id: string;
      label_json: string;
      status: EntryStatus;
    }>(featuredResult).map((row) => ({
      id: row.id,
      label: studioLabel(JSON.parse(row.label_json)),
      status: row.status,
    })),
    featuredProjectLimit: site.homepage.featuredProjectCount,
    featuredCounts,
    sections: {
      visible: HOMEPAGE_SECTIONS.filter((key) => site.homepage.sections[key]),
      hidden: HOMEPAGE_SECTIONS.filter((key) => !site.homepage.sections[key]),
    },
  };

  return {
    now: now.toISOString(),
    counts,
    recent,
    attention: facts.attention,
    homepage,
    commissions: facts.commissions,
  };
}
