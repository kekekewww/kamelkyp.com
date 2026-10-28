/**
 * Public footer composition (client-safe; wp3 spec §4.2, §4.4).
 *
 * Every footer the site shows goes through `composeFooterGroups`: the public
 * layout, the Studio's footer preview and the D1-unavailable fallback, so
 * they cannot disagree. Group order, visibility and labels are CMS data
 * (`link_groups`, `link_group_labels`); custom groups keep their links in
 * `links`. The five built-in groups derive their links at read time: site
 * navigation, service areas, enabled social links, the brand contact email
 * and the legal pages. Code keeps only site structure (paths) and UI-copy
 * defaults. The footer never shows prices.
 */
import { getSiteCopy } from "../../i18n/copy";
import { localePath, NAV_PATHS } from "../../i18n/path";
import { localize } from "../localized";
import type { NavKey, ServiceAreaKey } from "../schemas/site-settings";
import type { Locale, LocalizedText } from "../types";
import { localizeHref } from "./build-views";
import type { FooterGroup } from "./view-models";

export const FOOTER_SYSTEM_KEYS = [
  "navigate",
  "services",
  "find_me",
  "contact",
  "legal",
] as const;
export type FooterSystemKey = (typeof FOOTER_SYSTEM_KEYS)[number];

export type FooterSystemGroup = {
  key: FooterSystemKey;
  /** `link_groups.id` that migration 0010 (and the Studio) create. */
  seedId: string;
  /** Default label (UI copy) when no stored label is set. */
  label: LocalizedText;
  /** Where the group goes when it has no row: before or after the others. */
  position: "lead" | "trail";
  hideable: boolean;
};

/** The built-in groups (spec §4.2), in canonical order. */
export const FOOTER_SYSTEM_GROUPS: Readonly<
  Record<FooterSystemKey, FooterSystemGroup>
> = {
  navigate: {
    key: "navigate",
    seedId: "seed-footer-navigate",
    label: { zh: "導覽", en: "Navigate" },
    position: "lead",
    hideable: true,
  },
  services: {
    key: "services",
    seedId: "seed-footer-services",
    label: { zh: "服務", en: "Services" },
    position: "lead",
    hideable: true,
  },
  find_me: {
    key: "find_me",
    seedId: "seed-footer-find-me",
    label: { zh: "社群", en: "Find Me" },
    position: "trail",
    hideable: true,
  },
  contact: {
    key: "contact",
    seedId: "seed-footer-contact",
    label: { zh: "聯絡", en: "Contact" },
    position: "trail",
    hideable: true,
  },
  legal: {
    key: "legal",
    seedId: "seed-footer-legal",
    label: { zh: "條款與網站", en: "Legal" },
    position: "trail",
    // Terms and Privacy stay reachable from every page.
    hideable: false,
  },
};

/** Keys no custom group may use: the built-in keys and the legacy `social`. */
export const FOOTER_RESERVED_KEYS: readonly string[] = [
  ...FOOTER_SYSTEM_KEYS,
  "social",
];

export function isFooterSystemKey(key: string): key is FooterSystemKey {
  return (FOOTER_SYSTEM_KEYS as readonly string[]).includes(key);
}

/** Navigate link ids (stable React keys and test ids). */
export const NAV_LINK_IDS: Readonly<Record<NavKey, string>> = {
  work: "works",
  services: "services-overview",
  about: "about",
  writing: "writing",
};

const SERVICE_AREA_ORDER: readonly ServiceAreaKey[] = [
  "mixing",
  "song_transition",
  "software",
];

export const SERVICE_AREA_PATHS: Readonly<
  Record<ServiceAreaKey, { id: string; path: string }>
> = {
  mixing: { id: "mixing", path: "/mixing" },
  song_transition: { id: "transition", path: "/song-transition" },
  software: { id: "software", path: "/services/software" },
};

/** Service link labels when the area has no name in this locale. */
export const DEFAULT_SERVICE_AREA_LABELS: Readonly<
  Record<ServiceAreaKey, LocalizedText>
> = {
  mixing: { zh: "混音", en: "Mixing" },
  song_transition: { zh: "歌曲銜接", en: "Song Transition" },
  software: { zh: "軟體與互動", en: "Software & Interactive" },
};

export const LEGAL_LINKS: ReadonlyArray<{
  id: string;
  label: LocalizedText;
  path: string;
}> = [
  { id: "terms", label: { zh: "服務條款", en: "Terms" }, path: "/terms" },
  { id: "privacy", label: { zh: "隱私說明", en: "Privacy" }, path: "/privacy" },
];

/**
 * Sample markers the seeds use (`Sample:`, `Sample paragraph:`,
 * `Placeholder for…`, `示意：`, `示意內容：`, `TODO_CONTENT`). "Sample packs"
 * without a colon is a real label and stays allowed.
 */
export const SAMPLE_MARKER =
  /^\s*(?:sample(?:\s+\w+)?\s*[:：]|placeholder\b|示意)|TODO_CONTENT/i;

/** Characters a site path may not contain (`/\host` acts like `//host`). */
export const UNSAFE_PATH_CHARACTER = /[\s\\\p{Cc}]/u;

/**
 * An `https:` address a browser reads as another site. `https:/host`,
 * `https:host` and `https:\host` parse as `https://host/`, but in an `href`
 * on an `https:` page they resolve against the page (`/host`).
 */
export const HTTPS_ADDRESS = /^https:\/\/[^/\\]/i;

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * True when the path part has a `.` or `..` segment (`%2e` included): the
 * browser resolves it, so `/en/../studio` leaves the locale prefix.
 */
export function hasDotSegment(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return pathname.split("/").some((segment) => DOT_SEGMENT.test(segment));
}

/**
 * A site path (not protocol-relative, no dot segment), an `https://` or a
 * `mailto:` URL.
 */
export function isSafeFooterUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return (
      !url.startsWith("//") &&
      !UNSAFE_PATH_CHARACTER.test(url) &&
      !hasDotSegment(url)
    );
  }
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:") return HTTPS_ADDRESS.test(url);
    return protocol === "mailto:";
  } catch {
    return false;
  }
}

const LOCALIZED_PATH = /^\/(?:zh|en)(?=[/?#]|$)/;

/**
 * Stored site paths are locale-less (`/works`) and get the page's locale;
 * legacy localized paths (`/zh/…`) and absolute URLs pass unchanged.
 */
export function footerHref(locale: Locale, url: string): string {
  if (!url.startsWith("/") || LOCALIZED_PATH.test(url)) return url;
  return localizeHref(locale, url);
}

/** One `link_groups` row for one locale (what the public read folds). */
export type FooterGroupRecord = {
  /** `link_groups.id` */
  id: string;
  /** `stable_key` */
  key: string;
  sortOrder: number;
  enabled: boolean;
  /** Stored label for this locale ("" when none). */
  label: string;
  /** Enabled rows for this locale, in order. */
  links: Array<{ id: string; label: string; url: string }>;
};

export type FooterSources = {
  locale: Locale;
  groups: readonly FooterGroupRecord[];
  navigation: ReadonlyArray<{ key: NavKey; visible: boolean }>;
  serviceAreas: ReadonlyArray<{ key: ServiceAreaKey; name: LocalizedText }>;
  /** Enabled, localized and safe social links. */
  socialLinks: ReadonlyArray<{ id: string; label: string; url: string }>;
  contactEmail: string;
};

function compareRecords(
  a: { id: string; sortOrder: number },
  b: { id: string; sortOrder: number },
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Footer order: stored groups by `(sortOrder, id)` (the legacy `social`
 * group dropped), a built-in group without a row inserted as `virtual(key)`:
 * missing Navigate/Services first, missing Find Me/Contact/Legal last.
 */
export function orderFooterGroups<
  T extends { id: string; key: string; sortOrder: number },
>(records: readonly T[], virtual: (key: FooterSystemKey) => T): T[] {
  const stored = records
    .filter((record) => record.key !== "social")
    .sort(compareRecords);
  const present = new Set(stored.map((record) => record.key));
  const missing = (position: FooterSystemGroup["position"]) =>
    FOOTER_SYSTEM_KEYS.filter(
      (key) =>
        FOOTER_SYSTEM_GROUPS[key].position === position && !present.has(key),
    ).map(virtual);
  return [...missing("lead"), ...stored, ...missing("trail")];
}

type SystemLinkSources = Omit<FooterSources, "groups">;

/** The links a built-in group shows for one locale. */
export function systemGroupLinks(
  key: FooterSystemKey,
  sources: SystemLinkSources,
): FooterGroup["links"] {
  const { locale } = sources;
  const copy = getSiteCopy(locale);
  switch (key) {
    case "navigate":
      return sources.navigation
        .filter((item) => item.visible && item.key in NAV_PATHS)
        .map((item) => ({
          id: NAV_LINK_IDS[item.key],
          label: copy[item.key],
          url: localePath(locale, NAV_PATHS[item.key]),
        }));
    case "services": {
      const names = new Map(
        sources.serviceAreas.map((area) => [area.key, area.name]),
      );
      return [
        ...SERVICE_AREA_ORDER.map((area) => ({
          id: SERVICE_AREA_PATHS[area].id,
          label:
            localize(names.get(area), locale) ||
            DEFAULT_SERVICE_AREA_LABELS[area][locale],
          url: localePath(locale, SERVICE_AREA_PATHS[area].path),
        })),
        {
          id: "commission",
          label: copy.cta,
          url: localePath(locale, "/commission"),
        },
      ];
    }
    case "find_me":
      return sources.socialLinks.map((link) => ({ ...link }));
    case "contact": {
      const email = sources.contactEmail.trim();
      return email
        ? [{ id: "email", label: email, url: `mailto:${email}` }]
        : [];
    }
    case "legal":
      return LEGAL_LINKS.map((link) => ({
        id: link.id,
        label: link.label[locale],
        url: localePath(locale, link.path),
      }));
  }
}

function customLinks(
  record: FooterGroupRecord,
  locale: Locale,
): FooterGroup["links"] {
  return record.links.flatMap((link) => {
    const label = link.label.trim();
    if (!label || SAMPLE_MARKER.test(label) || !isSafeFooterUrl(link.url)) {
      return [];
    }
    return [{ id: link.id, label, url: footerHref(locale, link.url) }];
  });
}

/**
 * The footer for one locale (spec §4.4): groups in stored order, hidden
 * groups and groups without links left out (Legal is always shown), labels
 * from the CMS (built-in groups fall back to their default; a custom group
 * without a label in this locale is left out, never a raw key).
 */
export function composeFooterGroups(sources: FooterSources): FooterGroup[] {
  const { locale } = sources;
  const ordered = orderFooterGroups<FooterGroupRecord>(
    sources.groups,
    (key) => ({
      id: FOOTER_SYSTEM_GROUPS[key].seedId,
      key,
      sortOrder: 0,
      enabled: true,
      label: "",
      links: [],
    }),
  );
  const groups: FooterGroup[] = [];
  for (const record of ordered) {
    if (!record.enabled && record.key !== "legal") continue;
    const label = record.label.trim();
    if (isFooterSystemKey(record.key)) {
      const links = systemGroupLinks(record.key, sources);
      if (links.length === 0) continue;
      groups.push({
        id: record.key,
        label: label || FOOTER_SYSTEM_GROUPS[record.key].label[locale],
        links,
      });
      continue;
    }
    if (!label || SAMPLE_MARKER.test(label)) continue;
    const links = customLinks(record, locale);
    if (links.length > 0) groups.push({ id: record.id, label, links });
  }
  return groups;
}
