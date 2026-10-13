/**
 * Footer link groups (wp3 spec §4.6, §4.7; content-schema "Footer link
 * groups"). Studio → Settings → Footer reads and writes `link_groups`,
 * `link_group_labels` and `links`; the public footer is composed from the
 * same rows by `composeFooterGroups`.
 *
 * Saves are live and atomic per group (one `db.batch`). A custom group's
 * links are replaced as complete `zh` + `en` pairs; a save made from an older
 * version of the group (fingerprint mismatch) is refused with 409. Built-in
 * groups derive their links, so only their label, visibility and position
 * change here; Legal is always shown, and built-in groups are never deleted.
 */
import { findBrandViolations } from "../brand-guard.server";
import { CmsError } from "../db/errors";
import { formDataToObject, readString } from "../forms";
import {
  FOOTER_SYSTEM_GROUPS,
  FOOTER_SYSTEM_KEYS,
  type FooterSystemKey,
  isSafeFooterUrl,
  orderFooterGroups,
} from "../public/footer";
import {
  FOOTER_LIMITS,
  type FooterGroupDraft,
  FooterGroupDraftSchema,
  type FooterGroupKind,
  type FooterLinkRow,
  type FooterScreenData,
  footerGroupIssues,
  footerGroupKind,
  normalizeFooterUrl,
  pairFooterLinkRows,
  type StudioFooterGroup,
} from "../schemas/footer";
import { settingsFromRows, settingsStatement } from "../settings.server";
import type { StudioActionArgs } from "../studio/auth.server";
import {
  actionError,
  actionOk,
  unknownIntent,
  withCmsErrors,
} from "../studio/responses";
import type { Locale, LocalizedText, ValidationIssue } from "../types";

export type { FooterScreenData };

/** Groups other than the built-in ones and the legacy `social` group. */
const OTHER_GROUPS = `stable_key NOT IN (${[...FOOTER_SYSTEM_KEYS, "social"]
  .map((key) => `'${key}'`)
  .join(", ")})`;

/** Where migration 0010 puts a missing built-in row, around the other groups. */
const SEED_POSITION: Record<
  FooterSystemKey,
  { edge: "MIN" | "MAX"; offset: number }
> = {
  navigate: { edge: "MIN", offset: -20 },
  services: { edge: "MIN", offset: -10 },
  find_me: { edge: "MAX", offset: 10 },
  contact: { edge: "MAX", offset: 20 },
  legal: { edge: "MAX", offset: 30 },
};

/**
 * The statements of migration 0010: recreate a missing built-in row (and its
 * default labels) around the other groups. `INSERT OR IGNORE` only, so they
 * are safe at the start of any batch.
 */
export function ensureFooterSystemGroupStatements(
  db: D1Database,
): D1PreparedStatement[] {
  const groups = FOOTER_SYSTEM_KEYS.map((key) => {
    const { edge, offset } = SEED_POSITION[key];
    return db
      .prepare(
        `INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
         SELECT ?1, ?2,
           COALESCE((SELECT ${edge}(sort_order) FROM link_groups WHERE ${OTHER_GROUPS}), 30) + ?3,
           1`,
      )
      .bind(FOOTER_SYSTEM_GROUPS[key].seedId, key, offset);
  });
  const values = FOOTER_SYSTEM_KEYS.flatMap((key) =>
    (["zh", "en"] as const).map(
      (locale) =>
        `('${key}', '${locale}', '${FOOTER_SYSTEM_GROUPS[key].label[locale]}')`,
    ),
  ).join(", ");
  const labels = db.prepare(
    `WITH x(stable_key, locale, label) AS (VALUES ${values})
     INSERT OR IGNORE INTO link_group_labels (group_id, locale, label)
     SELECT g.id, x.locale, x.label
     FROM x JOIN link_groups g ON g.stable_key = x.stable_key`,
  );
  return [...groups, labels];
}

// ---- Reads ------------------------------------------------------------------

type GroupRow = {
  id: string;
  stable_key: string;
  sort_order: number;
  enabled: number;
};
type LabelRow = { group_id: string; locale: Locale; label: string };
type LinkRowDb = {
  id: string;
  group_id: string;
  locale: Locale;
  label: string;
  url: string;
  sort_order: number;
  enabled: number;
};
type SocialRow = { id: string; label_i18n: string; url: string };

function groupStatements(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare(
      `SELECT id, stable_key, sort_order, enabled FROM link_groups
       WHERE stable_key <> 'social' ORDER BY sort_order, id`,
    ),
    db.prepare(
      `SELECT gl.group_id, gl.locale, gl.label FROM link_group_labels gl
       JOIN link_groups g ON g.id = gl.group_id
       WHERE g.stable_key <> 'social'`,
    ),
    db.prepare(
      `SELECT l.id, l.group_id, l.locale, l.label, l.url, l.sort_order, l.enabled
       FROM links l JOIN link_groups g ON g.id = l.group_id
       WHERE g.stable_key <> 'social'
       ORDER BY l.group_id, l.sort_order, l.locale, l.id`,
    ),
  ];
}

/**
 * SHA-256 hex of the STORED labels and link rows of a group (never the UI
 * defaults; not the group's visibility or position, so toggling or moving a
 * group does not invalidate an open editor).
 */
export async function footerGroupFingerprint(
  label: LocalizedText,
  rows: readonly FooterLinkRow[],
): Promise<string> {
  const sorted = [...rows].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      compare(a.locale, b.locale) ||
      compare(a.label, b.label) ||
      compare(a.url, b.url),
  );
  const payload = JSON.stringify({
    label: [label.zh, label.en],
    links: sorted.map((row) => [
      row.locale,
      row.label,
      row.url,
      row.sortOrder,
      row.enabled,
    ]),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function buildGroups(
  groupRows: readonly GroupRow[],
  labelRows: readonly LabelRow[],
  linkRows: readonly LinkRowDb[],
): Promise<StudioFooterGroup[]> {
  const labels = new Map<string, LocalizedText>();
  for (const row of labelRows) {
    const current = labels.get(row.group_id) ?? { zh: "", en: "" };
    if (row.locale === "zh" || row.locale === "en") {
      current[row.locale] = row.label;
    }
    labels.set(row.group_id, current);
  }
  const rowsByGroup = new Map<string, FooterLinkRow[]>();
  for (const row of linkRows) {
    const rows = rowsByGroup.get(row.group_id) ?? [];
    rows.push({
      id: row.id,
      locale: row.locale,
      label: row.label,
      url: row.url,
      sortOrder: row.sort_order,
      enabled: row.enabled === 1,
    });
    rowsByGroup.set(row.group_id, rows);
  }

  type Ordered = {
    id: string;
    key: string;
    sortOrder: number;
    group: Promise<StudioFooterGroup>;
  };
  const stored: Ordered[] = groupRows.flatMap((row) => {
    const kind = footerGroupKind(row.stable_key);
    if (kind === "social") return [];
    const label = labels.get(row.id) ?? { zh: "", en: "" };
    const rows = rowsByGroup.get(row.id) ?? [];
    return [
      {
        id: row.id,
        key: row.stable_key,
        sortOrder: row.sort_order,
        group: footerGroupFingerprint(label, rows).then((fingerprint) => ({
          id: row.id,
          key: row.stable_key,
          kind,
          stored: true,
          label,
          enabled: row.enabled === 1,
          hideable: hideable(kind),
          links: kind === "custom" ? pairFooterLinkRows(rows) : [],
          fingerprint,
        })),
      },
    ];
  });
  const ordered = orderFooterGroups<Ordered>(stored, (key) => {
    const label = { zh: "", en: "" };
    return {
      id: FOOTER_SYSTEM_GROUPS[key].seedId,
      key,
      sortOrder: 0,
      group: footerGroupFingerprint(label, []).then((fingerprint) => ({
        id: FOOTER_SYSTEM_GROUPS[key].seedId,
        key,
        kind: key,
        stored: false,
        label,
        enabled: true,
        hideable: hideable(key),
        links: [],
        fingerprint,
      })),
    };
  });
  return Promise.all(ordered.map((item) => item.group));
}

function hideable(kind: FooterGroupKind): boolean {
  return kind === "custom" ? true : FOOTER_SYSTEM_GROUPS[kind].hideable;
}

/** Every footer group (not the legacy `social` one) in footer order. */
export async function listStudioFooterGroups(
  db: D1Database,
): Promise<StudioFooterGroup[]> {
  const [groups, labels, links] = await db.batch(groupStatements(db));
  return buildGroups(
    (groups?.results ?? []) as GroupRow[],
    (labels?.results ?? []) as LabelRow[],
    (links?.results ?? []) as LinkRowDb[],
  );
}

/** The footer screen: groups plus what the built-in groups derive links from. */
export async function loadFooterScreen(
  db: D1Database,
): Promise<FooterScreenData> {
  const [groups, labels, links, settings, social] = await db.batch([
    ...groupStatements(db),
    settingsStatement(db),
    db.prepare(
      "SELECT id, label_i18n, url FROM social_links WHERE enabled = 1 ORDER BY sort_order, id",
    ),
  ]);
  const { brand, site } = settingsFromRows(
    (settings?.results ?? []) as Parameters<typeof settingsFromRows>[0],
  );
  return {
    groups: await buildGroups(
      (groups?.results ?? []) as GroupRow[],
      (labels?.results ?? []) as LabelRow[],
      (links?.results ?? []) as LinkRowDb[],
    ),
    sources: {
      navigation: site.value.navigation.items.map((item) => ({ ...item })),
      serviceAreas: site.value.serviceAreas.map((area) => ({
        key: area.key,
        name: { ...area.name },
      })),
      socialLinks: ((social?.results ?? []) as SocialRow[])
        .map((row) => ({
          id: row.id,
          label: parseLabel(row.label_i18n),
          url: row.url,
        }))
        .filter((link) => isSafeFooterUrl(link.url)),
      contactEmail: brand.value.contactEmail,
    },
  };
}

function parseLabel(raw: string): LocalizedText {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      zh: typeof value?.zh === "string" ? value.zh : "",
      en: typeof value?.en === "string" ? value.en : "",
    };
  } catch {
    return { zh: "", en: "" };
  }
}

async function findGroup(
  db: D1Database,
  id: string,
): Promise<StudioFooterGroup> {
  const group = (await listStudioFooterGroups(db)).find(
    (item) => item.id === id,
  );
  if (!group) throw new CmsError("not_found");
  return group;
}

// ---- Writes -----------------------------------------------------------------

/** A refusal with a message of its own (CmsError answers generic text). */
export class FooterRefusal extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "FooterRefusal";
    this.code = code;
    this.status = status;
  }
}

type Resolved = {
  id: string;
  key: string;
  kind: FooterGroupKind;
  /** False: a built-in row is missing; the batch recreates it first. */
  stored: boolean;
};

/**
 * An existing non-`social` row, or the seed id of a built-in group that has
 * no row with its key (recreated at the start of the write batch). Anything
 * else is 404: if the key lives under another id, the seed id is refused, or
 * the update would silently do nothing.
 */
async function resolveGroup(db: D1Database, id: string): Promise<Resolved> {
  if (!id) throw new CmsError("not_found");
  const row = await db
    .prepare("SELECT id, stable_key FROM link_groups WHERE id = ?")
    .bind(id)
    .first<{ id: string; stable_key: string }>();
  if (row) {
    const kind = footerGroupKind(row.stable_key);
    if (kind === "social") throw new CmsError("not_found");
    return { id: row.id, key: row.stable_key, kind, stored: true };
  }
  const seed = FOOTER_SYSTEM_KEYS.find(
    (key) => FOOTER_SYSTEM_GROUPS[key].seedId === id,
  );
  if (!seed) throw new CmsError("not_found");
  const taken = await db
    .prepare("SELECT 1 AS taken FROM link_groups WHERE stable_key = ?")
    .bind(seed)
    .first();
  if (taken) throw new CmsError("not_found");
  return { id, key: seed, kind: seed, stored: false };
}

const SOURCE_NAMES: Record<FooterSystemKey, string> = {
  navigate: "the header navigation",
  services: "the service areas",
  find_me: "Social links",
  contact: "the brand contact email",
  legal: "the legal pages",
};

function brandIssues(draft: FooterGroupDraft): ValidationIssue[] {
  return findBrandViolations({
    label: draft.label,
    links: (draft.links ?? []).map((link) => ({
      label: link.label,
      url: link.url,
    })),
  }).map((hit) => ({
    field: hit.field,
    code: "brand_name",
    severity: "error",
    message: `Public text must use the Kamel brand only; remove "${hit.term}".`,
    ...(hit.locale ? { locale: hit.locale } : {}),
  }));
}

/** Trimmed labels and normalized addresses (what is stored). */
function normalizeDraft(draft: FooterGroupDraft): FooterGroupDraft {
  return {
    ...draft,
    label: { zh: draft.label.zh.trim(), en: draft.label.en.trim() },
    ...(draft.links
      ? {
          links: draft.links.map((link) => ({
            label: { zh: link.label.zh.trim(), en: link.label.en.trim() },
            url: normalizeFooterUrl(link.url ?? ""),
            enabled: link.enabled,
          })),
        }
      : {}),
  };
}

function assertValid(draft: FooterGroupDraft, kind: FooterGroupKind) {
  const issues = [...footerGroupIssues(draft, kind), ...brandIssues(draft)];
  if (issues.length > 0) throw new CmsError("invalid_content", { issues });
}

function labelStatements(
  db: D1Database,
  id: string,
  label: LocalizedText,
): D1PreparedStatement[] {
  return (["zh", "en"] as const).map((locale) =>
    db
      .prepare(
        `INSERT INTO link_group_labels (group_id, locale, label) VALUES (?1, ?2, ?3)
         ON CONFLICT(group_id, locale) DO UPDATE SET label = excluded.label`,
      )
      .bind(id, locale, label[locale]),
  );
}

/** Two rows per link (zh, en), `sort_order` = index × 10, fresh ids. */
function linkInsertStatement(
  db: D1Database,
  id: string,
  links: NonNullable<FooterGroupDraft["links"]>,
): D1PreparedStatement {
  const rows = links.flatMap((link, index) =>
    (["zh", "en"] as const).map((locale) => ({
      id: crypto.randomUUID(),
      locale,
      label: link.label[locale],
      url: link.url,
      sortOrder: index * 10,
      enabled: link.enabled ? 1 : 0,
    })),
  );
  return db
    .prepare(
      `INSERT INTO links (id, group_id, locale, label, url, sort_order, enabled)
       SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.locale'),
              json_extract(j.value, '$.label'), json_extract(j.value, '$.url'),
              json_extract(j.value, '$.sortOrder'), json_extract(j.value, '$.enabled')
       FROM json_each(?2) j`,
    )
    .bind(id, JSON.stringify(rows));
}

/** `sort_order` = index × 10 for the listed ids (one statement, any length). */
function reorderStatement(
  db: D1Database,
  ids: readonly string[],
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE link_groups
       SET sort_order = (SELECT CAST(j.key AS INTEGER) * 10 FROM json_each(?1) j WHERE j.value = link_groups.id)
       WHERE id IN (SELECT value FROM json_each(?1)) AND stable_key <> 'social'`,
    )
    .bind(JSON.stringify(ids));
}

const TRAIL_KEYS: readonly string[] = ["find_me", "contact", "legal"];

async function createFooterGroup(
  db: D1Database,
  draft: FooterGroupDraft,
): Promise<StudioFooterGroup> {
  assertValid(draft, "custom");
  const current = await listStudioFooterGroups(db);
  const customCount = current.filter((group) => group.kind === "custom").length;
  if (customCount >= FOOTER_LIMITS.customGroups) {
    throw new FooterRefusal(
      "invalid_state",
      409,
      "The footer holds at most 20 custom groups.",
    );
  }
  const id = crypto.randomUUID();
  const order = current.map((group) => group.id);
  const trail = current.findIndex((group) => TRAIL_KEYS.includes(group.key));
  order.splice(trail === -1 ? order.length : trail, 0, id);
  await db.batch([
    ...ensureFooterSystemGroupStatements(db),
    db
      .prepare(
        `INSERT INTO link_groups (id, stable_key, sort_order, enabled)
         VALUES (?1, 'custom-' || ?1, 0, ?2)`,
      )
      .bind(id, draft.enabled === false ? 0 : 1),
    ...labelStatements(db, id, draft.label),
    ...(draft.links?.length ? [linkInsertStatement(db, id, draft.links)] : []),
    reorderStatement(db, order),
  ]);
  return findGroup(db, id);
}

/** Creates (no `id`) or updates a group; the save is live. */
export async function saveFooterGroup(
  db: D1Database,
  input: FooterGroupDraft,
): Promise<StudioFooterGroup> {
  const draft = normalizeDraft(input);
  if (!draft.id) return createFooterGroup(db, draft);

  const target = await resolveGroup(db, draft.id);
  if (target.kind !== "custom" && draft.links !== undefined) {
    throw new FooterRefusal(
      "invalid_request",
      422,
      `This group's links come from ${SOURCE_NAMES[target.kind]}; only its label can change here.`,
    );
  }
  if (target.kind === "custom" && draft.links === undefined) {
    throw new FooterRefusal(
      "invalid_request",
      422,
      "The links could not be read. Reload and try again.",
    );
  }
  assertValid(draft, target.kind);
  const current = await findGroup(db, target.id);
  if (current.fingerprint !== draft.fingerprint) {
    throw new FooterRefusal(
      "stale_revision",
      409,
      "This group changed elsewhere.",
    );
  }
  await db.batch([
    ...(target.stored ? [] : ensureFooterSystemGroupStatements(db)),
    ...labelStatements(db, target.id, draft.label),
    ...(target.kind === "custom"
      ? [
          db.prepare("DELETE FROM links WHERE group_id = ?1").bind(target.id),
          linkInsertStatement(db, target.id, draft.links ?? []),
        ]
      : []),
  ]);
  return findGroup(db, target.id);
}

/** Shows or hides a group (Legal is always shown). */
export async function setFooterGroupEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
): Promise<StudioFooterGroup> {
  const target = await resolveGroup(db, id);
  if (target.key === "legal") {
    throw new FooterRefusal(
      "invalid_state",
      409,
      "The Legal group is always shown.",
    );
  }
  await db.batch([
    ...(target.stored ? [] : ensureFooterSystemGroupStatements(db)),
    db
      .prepare(
        `UPDATE link_groups SET enabled = ?2
         WHERE id = ?1 AND stable_key NOT IN ('legal', 'social')`,
      )
      .bind(target.id, enabled ? 1 : 0),
  ]);
  return findGroup(db, target.id);
}

/** Deletes a custom group with its labels and links. */
export async function deleteFooterGroup(
  db: D1Database,
  id: string,
): Promise<void> {
  const builtIn = FOOTER_SYSTEM_KEYS.some(
    (key) => FOOTER_SYSTEM_GROUPS[key].seedId === id,
  );
  const row = await db
    .prepare("SELECT stable_key FROM link_groups WHERE id = ?")
    .bind(id)
    .first<{ stable_key: string }>();
  const kind = row ? footerGroupKind(row.stable_key) : null;
  if (kind === "social" || (!row && !builtIn)) throw new CmsError("not_found");
  if (builtIn || kind !== "custom") {
    throw new FooterRefusal(
      "invalid_state",
      409,
      "Built-in groups cannot be deleted. Hide the group instead.",
    );
  }
  await db.batch([
    db.prepare("DELETE FROM links WHERE group_id = ?1").bind(id),
    db.prepare("DELETE FROM link_group_labels WHERE group_id = ?1").bind(id),
    db.prepare("DELETE FROM link_groups WHERE id = ?1").bind(id),
  ]);
}

/**
 * Stores the full footer order. The list must name exactly the groups the
 * screen shows (stored rows and missing built-ins); otherwise the footer
 * changed elsewhere and the order is refused.
 */
export async function reorderFooterGroups(
  db: D1Database,
  ids: readonly string[],
): Promise<void> {
  const current = (await listStudioFooterGroups(db)).map((group) => group.id);
  const wanted = new Set(ids);
  if (
    wanted.size !== ids.length ||
    wanted.size !== current.length ||
    !current.every((id) => wanted.has(id))
  ) {
    throw new FooterRefusal(
      "stale_revision",
      409,
      "The footer changed elsewhere. Reload and try again.",
    );
  }
  await db.batch([
    ...ensureFooterSystemGroupStatements(db),
    reorderStatement(db, ids),
  ]);
}

// ---- Forms and actions --------------------------------------------------------

/** Form → draft (structural parse only; the save rules run in the repository). */
export function parseFooterGroupForm(formData: FormData): FooterGroupDraft {
  const raw = formDataToObject(formData);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const fingerprint =
    typeof raw.fingerprint === "string" ? raw.fingerprint.trim() : "";
  const parsed = FooterGroupDraftSchema.safeParse({
    ...(id ? { id } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    label: raw.label ?? undefined,
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(raw.links === undefined || raw.links === null
      ? {}
      : { links: raw.links }),
  });
  if (!parsed.success) {
    throw new FooterRefusal(
      "invalid_request",
      422,
      "The group could not be read. Reload and try again.",
    );
  }
  return parsed.data;
}

/** `ids` form field: a JSON array of up to 500 id strings, or null. */
function readIds(formData: FormData): string[] | null {
  try {
    const value = JSON.parse(readString(formData, "ids") ?? "");
    return Array.isArray(value) &&
      value.length <= 500 &&
      value.every((item) => typeof item === "string" && item.length <= 100)
      ? value
      : null;
  } catch {
    return null;
  }
}

function refusalResult(error: unknown) {
  if (error instanceof FooterRefusal) {
    return actionError(error.code, {
      status: error.status,
      message: error.message,
    });
  }
  throw error;
}

export async function handleFooterAction({
  db,
  formData,
  intent,
}: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now">) {
  if (!formData) return unknownIntent(intent);
  return withCmsErrors(async () => {
    try {
      switch (intent) {
        case "save-group": {
          const group = await saveFooterGroup(
            db,
            parseFooterGroupForm(formData),
          );
          return actionOk({ intent, group });
        }
        case "toggle-group": {
          const enabled = formData.getAll("enabled:bool").at(-1);
          if (typeof enabled !== "string") {
            return actionError("invalid_request", {
              message: "Say whether the group should be shown.",
            });
          }
          const group = await setFooterGroupEnabled(
            db,
            (readString(formData, "id") ?? "").trim(),
            ["true", "on", "1"].includes(enabled),
          );
          return actionOk({ intent, group });
        }
        case "delete-group": {
          const id = (readString(formData, "id") ?? "").trim();
          await deleteFooterGroup(db, id);
          return actionOk({ intent, id });
        }
        case "reorder": {
          const ids = readIds(formData);
          if (!ids) {
            return actionError("invalid_request", {
              message: "The new order could not be read. Reload and try again.",
            });
          }
          await reorderFooterGroups(db, ids);
          return actionOk({ intent });
        }
        default:
          return unknownIntent(intent);
      }
    } catch (error) {
      return refusalResult(error);
    }
  });
}
