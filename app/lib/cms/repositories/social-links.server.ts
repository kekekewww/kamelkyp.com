/**
 * Social links (content-schema §2.7, admin-architecture §2.2, brief §15).
 *
 * No draft state: `enabled = 1` is public, `0` is hidden, and a save is live.
 * Rules on save: both labels, `https:` for web platforms, `mailto:` only (and
 * always) for the Email platform, a known icon key. An edit that does not
 * submit `enabled` keeps the stored value, so a link hidden on purpose (the
 * imported "Website repository" style link) stays hidden until the owner
 * turns it on.
 */
import { CmsError } from "../db/errors";
import { formDataToObject, readString } from "../forms";
import { parseLocalizedText } from "../localized";
import {
  SOCIAL_PLATFORMS,
  type SocialLink,
  SocialLinkInputSchema,
  type SocialPlatform,
} from "../schemas/social-link";
import type { StudioActionArgs } from "../studio/auth.server";
import {
  actionError,
  actionOk,
  unknownIntent,
  withCmsErrors,
} from "../studio/responses";
import type { LocalizedText, ValidationIssue } from "../types";

export type { SocialLink, SocialPlatform };

/** Icon keys (a fixed set; `null` = the platform's own icon). */
export const SOCIAL_ICON_KEYS: readonly SocialPlatform[] = SOCIAL_PLATFORMS;

export type SocialLinkDraft = {
  id?: string;
  platform: string;
  label: LocalizedText;
  url: string;
  username?: string | null;
  icon?: string | null;
  /** Omitted on an update = keep the stored value. */
  enabled?: boolean;
};

type SocialRow = {
  id: string;
  platform: SocialPlatform;
  label_i18n: string;
  url: string;
  username: string | null;
  icon: string | null;
  enabled: number;
  sort_order: number;
};

const COLUMNS =
  "id, platform, label_i18n, url, username, icon, enabled, sort_order";

function fromRow(row: SocialRow): SocialLink {
  return {
    id: row.id,
    platform: row.platform,
    label: parseLocalizedText(row.label_i18n),
    url: row.url,
    username: row.username,
    icon: row.icon,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
  };
}

function isPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

const BARE_EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

/**
 * Normalizes what the owner typed: a bare address becomes `mailto:` on the
 * Email platform; a bare host (`instagram.com/kamel`) gets `https://`.
 * Anything else is returned trimmed and judged by {@link socialLinkIssues}.
 */
export function normalizeSocialUrl(platform: string, raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (platform === "email" && BARE_EMAIL.test(value)) return `mailto:${value}`;
  if (platform !== "email" && BARE_HOST.test(value)) return `https://${value}`;
  return value;
}

function urlProblem(platform: string, url: string): string | null {
  if (!url) {
    return platform === "email"
      ? "Enter an email address."
      : "Enter the https:// address.";
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return platform === "email"
      ? "Use an email address or a mailto: link."
      : "Use a full https:// address.";
  }
  if (platform === "email") {
    if (parsed.protocol !== "mailto:" || !parsed.pathname.includes("@")) {
      return "Use an email address or a mailto: link.";
    }
    return null;
  }
  if (parsed.protocol === "mailto:") {
    return "mailto: links belong to the Email platform.";
  }
  if (parsed.protocol !== "https:") return "Use an https:// address.";
  if (parsed.username || parsed.password) {
    return "Remove the user name and password from the address.";
  }
  return null;
}

/** Save rules as Studio issues (every one blocks the save). */
export function socialLinkIssues(input: SocialLinkDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (
    field: string,
    code: ValidationIssue["code"],
    message: string,
    locale?: "zh" | "en",
  ) =>
    issues.push({
      field,
      code,
      severity: "error",
      message,
      ...(locale ? { locale } : {}),
    });

  if (!isPlatform(input.platform)) {
    error("platform", "invalid_value", "Choose a platform.");
  }
  for (const locale of ["zh", "en"] as const) {
    const value = (input.label?.[locale] ?? "").trim();
    if (!value) {
      error(
        "label",
        "required_locale",
        `Label is required in ${locale.toUpperCase()}.`,
        locale,
      );
    } else if (value.length > 80) {
      error("label", "too_long", "Keep the label under 80 characters.", locale);
    }
  }
  const problem = urlProblem(input.platform, input.url.trim());
  if (problem) error("url", "invalid_url", problem);
  else if (input.url.trim().length > 2048) {
    error("url", "too_long", "This address is too long.");
  }
  if ((input.username ?? "").trim().length > 100) {
    error("username", "too_long", "Keep the username under 100 characters.");
  }
  const icon = (input.icon ?? "").trim();
  if (icon && !isPlatform(icon)) {
    error("icon", "invalid_value", "Choose an icon from the list.");
  }
  return issues;
}

export async function listSocialLinks(db: D1Database): Promise<SocialLink[]> {
  const rows = await db
    .prepare(`SELECT ${COLUMNS} FROM social_links ORDER BY sort_order, id`)
    .all<SocialRow>();
  return rows.results.map(fromRow);
}

export async function getSocialLink(
  db: D1Database,
  id: string,
): Promise<SocialLink | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM social_links WHERE id = ?`)
    .bind(id)
    .first<SocialRow>();
  return row ? fromRow(row) : null;
}

/** Creates (no `id`) or updates a link; the save is live. */
export async function saveSocialLink(
  db: D1Database,
  draft: SocialLinkDraft,
  now: Date = new Date(),
): Promise<SocialLink> {
  const normalized: SocialLinkDraft = {
    ...draft,
    url: normalizeSocialUrl(draft.platform, draft.url ?? ""),
  };
  const issues = socialLinkIssues(normalized);
  if (issues.length > 0) throw new CmsError("invalid_content", { issues });

  const existing = draft.id ? await getSocialLink(db, draft.id) : null;
  if (draft.id && !existing) throw new CmsError("not_found");

  const parsed = SocialLinkInputSchema.safeParse({
    platform: normalized.platform,
    label: {
      zh: normalized.label.zh.trim(),
      en: normalized.label.en.trim(),
    },
    url: normalized.url,
    username: normalized.username?.trim() || null,
    icon: normalized.icon?.trim() || null,
    enabled: draft.enabled ?? existing?.enabled ?? true,
  });
  if (!parsed.success) {
    throw new CmsError("invalid_content", {
      issues: [
        {
          field: "url",
          code: "invalid_url",
          severity: "error",
          message: "This link cannot be saved.",
        },
      ],
    });
  }
  const value = parsed.data;
  const timestamp = now.toISOString();
  const label = JSON.stringify(value.label);

  if (existing) {
    await db
      .prepare(
        `UPDATE social_links SET platform = ?2, label_i18n = ?3, url = ?4, username = ?5,
           icon = ?6, enabled = ?7, updated_at = ?8 WHERE id = ?1`,
      )
      .bind(
        existing.id,
        value.platform,
        label,
        value.url,
        value.username,
        value.icon,
        value.enabled ? 1 : 0,
        timestamp,
      )
      .run();
    return (await getSocialLink(db, existing.id)) as SocialLink;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO social_links (id, platform, label_i18n, url, username, icon, enabled, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
         (SELECT COALESCE(MAX(sort_order), -10) + 10 FROM social_links), ?8, ?8)`,
    )
    .bind(
      id,
      value.platform,
      label,
      value.url,
      value.username,
      value.icon,
      value.enabled ? 1 : 0,
      timestamp,
    )
    .run();
  return (await getSocialLink(db, id)) as SocialLink;
}

export async function setSocialLinkEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
  now: Date = new Date(),
): Promise<SocialLink> {
  const result = await db
    .prepare("UPDATE social_links SET enabled = ?, updated_at = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, now.toISOString(), id)
    .run();
  if (result.meta.changes === 0) throw new CmsError("not_found");
  return (await getSocialLink(db, id)) as SocialLink;
}

export async function deleteSocialLink(
  db: D1Database,
  id: string,
): Promise<void> {
  const result = await db
    .prepare("DELETE FROM social_links WHERE id = ?")
    .bind(id)
    .run();
  if (result.meta.changes === 0) throw new CmsError("not_found");
}

/** Positions = index × 10 for the listed ids (one statement, any length). */
export async function reorderSocialLinks(
  db: D1Database,
  ids: readonly string[],
): Promise<void> {
  await db
    .prepare(
      `UPDATE social_links
       SET sort_order = (SELECT CAST(j.key AS INTEGER) * 10 FROM json_each(?1) j WHERE j.value = social_links.id)
       WHERE id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify([...new Set(ids)]))
    .run();
}

/** `ids` form field: a JSON array of up to 500 id strings, or null. */
export function readIdList(formData: FormData): string[] | null {
  const raw = readString(formData, "ids");
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Array.isArray(value) &&
      value.length <= 500 &&
      value.every((item) => typeof item === "string" && item.length <= 100)
    ) {
      return value;
    }
  } catch {
    // Fall through: malformed list.
  }
  return null;
}

/** Form → draft. `enabled` is only set when the form submitted it. */
export function parseSocialLinkForm(formData: FormData): SocialLinkDraft {
  const raw = formDataToObject(formData);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const id = text(raw.id).trim();
  return {
    ...(id ? { id } : {}),
    platform: text(raw.platform).trim(),
    label: parseLocalizedText(raw.label ?? null),
    url: text(raw.url),
    username: text(raw.username),
    icon: text(raw.icon),
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
  };
}

export async function loadSocialLinks({ db }: { db: D1Database }) {
  return { links: await listSocialLinks(db) };
}

export async function handleSocialAction({
  db,
  formData,
  intent,
  now,
}: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now">) {
  if (!formData) return unknownIntent(intent);
  return withCmsErrors(async () => {
    switch (intent) {
      case "create": {
        const { id: _ignored, ...draft } = parseSocialLinkForm(formData);
        const link = await saveSocialLink(db, draft, now);
        return actionOk({ intent, link });
      }
      case "update": {
        const draft = parseSocialLinkForm(formData);
        if (!draft.id) throw new CmsError("not_found");
        const link = await saveSocialLink(db, draft, now);
        return actionOk({ intent, link });
      }
      case "toggle": {
        const id = readString(formData, "id") ?? "";
        const enabled = formData.getAll("enabled:bool").at(-1);
        if (typeof enabled !== "string") {
          return actionError("invalid_request", {
            message: "Say whether the link should be shown.",
          });
        }
        const link = await setSocialLinkEnabled(
          db,
          id,
          ["true", "on", "1"].includes(enabled),
          now,
        );
        return actionOk({ intent, link });
      }
      case "delete": {
        const id = readString(formData, "id") ?? "";
        await deleteSocialLink(db, id);
        return actionOk({ intent, id });
      }
      case "reorder": {
        const ids = readIdList(formData);
        if (!ids) {
          return actionError("invalid_request", {
            message: "The new order could not be read. Reload and try again.",
          });
        }
        await reorderSocialLinks(db, ids);
        return actionOk({ intent });
      }
      default:
        return unknownIntent(intent);
    }
  });
}
