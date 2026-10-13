/**
 * Footer link groups in the Studio (client-safe; wp3 spec §4.2, §4.6, §4.8).
 *
 * A footer group is a `link_groups` row with a label per locale
 * (`link_group_labels`). Built-in groups derive their links; custom groups
 * keep them in `links`, one row per locale: a bilingual link is a `zh` and an
 * `en` row with the same `sort_order`, address and visibility. Saves are live,
 * so every rule here blocks the save. Stored site paths are locale-less
 * (`/works`) and never point at the Studio or an API.
 */
import { z } from "zod";
import {
  type FooterSystemKey,
  HTTPS_ADDRESS,
  hasDotSegment,
  isFooterSystemKey,
  SAMPLE_MARKER,
  UNSAFE_PATH_CHARACTER,
} from "../public/footer";
import type { Locale, LocalizedText, ValidationIssue } from "../types";
import { localizedText } from "./common";
import type { NavKey, ServiceAreaKey } from "./site-settings";

export const FOOTER_LIMITS = {
  groupLabel: 60,
  linkLabel: 80,
  url: 2048,
  links: 50,
  customGroups: 20,
} as const;

/** Price figures (NT$, US$, TWD, USD, $4, 4 元): the footer never shows prices. */
export const PRICE_FIGURE =
  /(?:NT|US)\s*[$＄]|\bTWD\b|\bUSD\b|[$＄]\s*\d|\d\s*元/i;

/** Site paths that are not public pages (the public site never links to them). */
export const RESERVED_PATH_PREFIXES = ["/studio", "/api", "/admin"] as const;

/** The site's own hosts: an absolute address there is judged like a site path. */
const SITE_HOSTS: readonly string[] = ["kamelkyp.com", "www.kamelkyp.com"];

export type FooterGroupKind = FooterSystemKey | "custom";

export type StudioFooterLink = {
  /** First row id of the pair (client key only). */
  key: string;
  /** The stored row id per locale (the public footer's link ids). */
  rowIds: Partial<Record<Locale, string>>;
  label: LocalizedText;
  url: string;
  enabled: boolean;
  /** Load notes; they never block loading. */
  notes: string[];
};

export type StudioFooterGroup = {
  /** `link_groups.id`, or the seed id of a missing built-in row. */
  id: string;
  /** `stable_key` */
  key: string;
  kind: FooterGroupKind;
  /** False when a built-in row is missing (shown from its defaults). */
  stored: boolean;
  /** Stored label ("" per locale when none; the UI shows the default). */
  label: LocalizedText;
  enabled: boolean;
  hideable: boolean;
  /** Custom groups only; built-in groups derive their links. */
  links: StudioFooterLink[];
  /** SHA-256 hex of the stored labels and link rows (not enabled/order). */
  fingerprint: string;
};

/** What the built-in groups derive their links from (Studio footer screen). */
export type FooterScreenSources = {
  navigation: ReadonlyArray<{ key: NavKey; visible: boolean }>;
  serviceAreas: ReadonlyArray<{ key: ServiceAreaKey; name: LocalizedText }>;
  /** Enabled social links with a safe address. */
  socialLinks: ReadonlyArray<{ id: string; label: LocalizedText; url: string }>;
  contactEmail: string;
};

export type FooterScreenData = {
  /** Footer order (built-in groups without a row at their default place). */
  groups: StudioFooterGroup[];
  sources: FooterScreenSources;
};

export type FooterLinkRow = {
  id: string;
  locale: Locale;
  label: string;
  url: string;
  sortOrder: number;
  enabled: boolean;
};

/** Structural parse only (lengths up to 4× the limits); the rules are below. */
export const FooterGroupDraftSchema = z.object({
  id: z.string().trim().max(100).optional(),
  fingerprint: z.string().trim().max(128).optional(),
  label: localizedText(240),
  /** Honoured on create only (toggle-group changes it afterwards). */
  enabled: z.boolean().optional(),
  links: z
    .array(
      z.object({
        label: localizedText(320),
        url: z.string().max(8192).default(""),
        enabled: z.boolean().default(true),
      }),
    )
    .max(200)
    .optional(),
});

export type FooterGroupDraft = z.output<typeof FooterGroupDraftSchema>;

export function footerGroupKind(stableKey: string): FooterGroupKind | "social" {
  if (stableKey === "social") return "social";
  return isFooterSystemKey(stableKey) ? stableKey : "custom";
}

const BARE_EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;
const LOCALE_SEGMENT = /^\/(?:zh|en)(?=[/?#]|$)/;
const SCHEME = /^(?:https|mailto):/i;

/**
 * What the owner typed → what is stored: a bare email becomes `mailto:`, a
 * bare host gets `https://`, a localized site path loses its locale segment
 * (`/zh/works` → `/works`, `/en` → `/`), `HTTPS:`/`MAILTO:` are written in
 * lower case. Anything else is only trimmed and judged by
 * {@link footerUrlProblem}.
 */
export function normalizeFooterUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (BARE_EMAIL.test(value)) return `mailto:${value}`;
  if (BARE_HOST.test(value)) return `https://${value}`;
  const segment = LOCALE_SEGMENT.exec(value);
  if (segment) {
    const rest = value.slice(segment[0].length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return value.replace(SCHEME, (scheme) => scheme.toLowerCase());
}

const PATH_MESSAGE = "Link to a public page of the site.";
const FORMAT_MESSAGE =
  "Use an https:// address, an email address or a site path such as /works.";

function isReservedPath(path: string): boolean {
  let value = path.toLowerCase();
  try {
    value = decodeURI(value);
  } catch {
    // Malformed escapes: judge the raw text.
  }
  return RESERVED_PATH_PREFIXES.some(
    (prefix) =>
      value === prefix ||
      (value.startsWith(prefix) && /^[/?#]/.test(value.slice(prefix.length))),
  );
}

function urlIssue(
  url: string,
): { code: "invalid_url" | "too_long"; message: string } | null {
  if (!url) return { code: "invalid_url", message: "Enter an address." };
  if (url.length > FOOTER_LIMITS.url) {
    return { code: "too_long", message: "This address is too long." };
  }
  if (url.startsWith("/")) {
    // Dot segments are refused: the public footer prefixes the locale, and
    // `/en/../studio` would resolve to the Studio.
    return url.startsWith("//") ||
      UNSAFE_PATH_CHARACTER.test(url) ||
      hasDotSegment(url) ||
      isReservedPath(url)
      ? { code: "invalid_url", message: PATH_MESSAGE }
      : null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "invalid_url", message: FORMAT_MESSAGE };
  }
  if (parsed.protocol === "mailto:") {
    return parsed.pathname.includes("@")
      ? null
      : { code: "invalid_url", message: FORMAT_MESSAGE };
  }
  if (parsed.protocol !== "https:" || !HTTPS_ADDRESS.test(url)) {
    return { code: "invalid_url", message: FORMAT_MESSAGE };
  }
  if (parsed.username || parsed.password) {
    return {
      code: "invalid_url",
      message: "Remove the user name and password from the address.",
    };
  }
  if (SITE_HOSTS.includes(parsed.hostname) && isReservedPath(parsed.pathname)) {
    return { code: "invalid_url", message: PATH_MESSAGE };
  }
  return null;
}

/** The problem with a (normalized) address, or null when it can be saved. */
export function footerUrlProblem(url: string): string | null {
  return urlIssue(url)?.message ?? null;
}

const LOCALES: readonly Locale[] = ["zh", "en"];

/** Save rules (spec §4.8); every issue is an error. The brand guard runs on the server. */
export function footerGroupIssues(
  draft: FooterGroupDraft,
  kind: FooterGroupKind,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (
    field: string,
    code: ValidationIssue["code"],
    message: string,
    locale?: Locale,
  ) =>
    issues.push({
      field,
      code,
      severity: "error",
      message,
      ...(locale ? { locale } : {}),
    });

  const text = (
    field: string,
    value: LocalizedText | undefined,
    max: number,
    tooLong: string,
  ) => {
    for (const locale of LOCALES) {
      const current = (value?.[locale] ?? "").trim();
      if (!current) {
        add(
          field,
          "required_locale",
          `Label is required in ${locale.toUpperCase()}.`,
          locale,
        );
      } else if (current.length > max) {
        add(field, "too_long", tooLong, locale);
      } else if (PRICE_FIGURE.test(current)) {
        add(
          field,
          "price_forbidden",
          "Footer links never show prices. Remove the amount.",
          locale,
        );
      } else if (SAMPLE_MARKER.test(current)) {
        add(
          field,
          "todo_content",
          "Sample text cannot appear on the public site.",
          locale,
        );
      }
    }
  };

  text(
    "label",
    draft.label,
    FOOTER_LIMITS.groupLabel,
    "Keep the group label under 60 characters.",
  );
  if (kind !== "custom") return issues;

  const links = draft.links ?? [];
  if (links.length > FOOTER_LIMITS.links) {
    add("links", "invalid_value", "At most 50 links in a group.");
    return issues;
  }
  links.forEach((link, index) => {
    text(
      `links.${index}.label`,
      link.label,
      FOOTER_LIMITS.linkLabel,
      "Keep the label under 80 characters.",
    );
    const problem = urlIssue(normalizeFooterUrl(link.url ?? ""));
    if (problem) add(`links.${index}.url`, problem.code, problem.message);
  });
  return issues;
}

const byId = (a: FooterLinkRow, b: FooterLinkRow) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Stored rows → logical links: rows that share a `sort_order` pair the i-th
 * `zh` row with the i-th `en` row (each by id). Leftovers become one-locale
 * links with a note; saving always writes complete pairs.
 */
export function pairFooterLinkRows(
  rows: readonly FooterLinkRow[],
): StudioFooterLink[] {
  const slots = new Map<number, FooterLinkRow[]>();
  for (const row of rows) {
    slots.set(row.sortOrder, [...(slots.get(row.sortOrder) ?? []), row]);
  }
  const links: StudioFooterLink[] = [];
  for (const sortOrder of [...slots.keys()].sort((a, b) => a - b)) {
    const slot = slots.get(sortOrder) ?? [];
    const zh = slot.filter((row) => row.locale === "zh").sort(byId);
    const en = slot.filter((row) => row.locale === "en").sort(byId);
    for (let index = 0; index < Math.max(zh.length, en.length); index += 1) {
      const zhRow = zh[index];
      const enRow = en[index];
      const first = zhRow ?? enRow;
      if (!first) continue;
      const notes: string[] = [];
      if (!enRow) notes.push("EN label missing; add it before saving.");
      if (!zhRow) notes.push("ZH label missing; add it before saving.");
      if (zhRow && enRow && zhRow.url !== enRow.url) {
        notes.push(
          "ZH and EN pointed to different addresses; saving keeps the ZH address.",
        );
      }
      if (zhRow && enRow && zhRow.enabled !== enRow.enabled) {
        notes.push(
          "Shown in one language only; saving applies one setting to both.",
        );
      }
      links.push({
        key: first.id,
        rowIds: {
          ...(zhRow ? { zh: zhRow.id } : {}),
          ...(enRow ? { en: enRow.id } : {}),
        },
        label: { zh: zhRow?.label ?? "", en: enRow?.label ?? "" },
        url: first.url,
        enabled: first.enabled,
        notes,
      });
    }
  }
  return links;
}
