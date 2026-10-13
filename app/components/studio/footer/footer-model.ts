/**
 * Studio footer screen helpers (client-safe; wp3 spec §4.5, §4.6): display
 * names, kind tags, where each built-in group's links come from, and the
 * preview's input for `composeFooterGroups`, built exactly as the public read
 * builds it (so the preview and the live footer cannot disagree).
 */
import {
  FOOTER_SYSTEM_GROUPS,
  type FooterSources,
  type FooterSystemKey,
  isFooterSystemKey,
  isSafeFooterUrl,
} from "../../../lib/cms/public/footer";
import type {
  FooterGroupKind,
  FooterScreenSources,
  StudioFooterGroup,
  StudioFooterLink,
} from "../../../lib/cms/schemas/footer";
import type { Locale } from "../../../lib/cms/types";

/** The group's name in Studio copy: EN label, else ZH, else the default. */
export function footerGroupName(group: StudioFooterGroup): string {
  const en = group.label.en.trim();
  const zh = group.label.zh.trim();
  if (en || zh) return en || zh;
  return isFooterSystemKey(group.key)
    ? FOOTER_SYSTEM_GROUPS[group.key].label.en
    : "Untitled group";
}

/** The ZH name shown next to the EN one (stored, else the default). */
export function footerGroupZhName(group: StudioFooterGroup): string {
  const zh = group.label.zh.trim();
  if (zh) return zh;
  return isFooterSystemKey(group.key)
    ? FOOTER_SYSTEM_GROUPS[group.key].label.zh
    : "";
}

export const FOOTER_KIND_TAGS: Readonly<Record<FooterGroupKind, string>> = {
  navigate: "Site navigation",
  services: "Service areas",
  find_me: "From Social links",
  contact: "From Brand",
  legal: "Legal pages",
  custom: "Custom links",
};

/** Where a built-in group's links come from, with the screen that edits them. */
export const FOOTER_SOURCE_NOTES: Readonly<
  Record<FooterSystemKey, { text: string; href: string; linkLabel: string }>
> = {
  navigate: {
    text: "Links follow the header navigation (order and visibility) in Settings → Site.",
    href: "/studio/settings/site",
    linkLabel: "Open Settings → Site",
  },
  services: {
    text: "Links are the service areas named in Settings → Site → Service pages, plus Start a project.",
    href: "/studio/settings/site",
    linkLabel: "Open Settings → Site",
  },
  find_me: {
    text: "Links are the social links switched to Shown. The group is left out when none is shown.",
    href: "/studio/social",
    linkLabel: "Open Social links",
  },
  contact: {
    text: "The link is the brand contact email. The group is left out when no address is set. Hiding this group does not remove the email under the footer's lead line; that comes from Settings → Brand.",
    href: "/studio/settings/brand",
    linkLabel: "Open Settings → Brand",
  },
  legal: {
    text: "Terms and Privacy pages. This group is always shown.",
    href: "/studio/services/terms",
    linkLabel: "Open Terms",
  },
};

/** "Default: 導覽 / Navigate." for a built-in group's label hint. */
export function defaultLabelHint(key: string): string {
  if (!isFooterSystemKey(key)) return "";
  const { zh, en } = FOOTER_SYSTEM_GROUPS[key].label;
  return ` Default: ${zh} / ${en}.`;
}

/**
 * Whether the public footer shows the link in at least one language: each
 * locale reads its own stored row (a legacy pair may disagree).
 */
export function isLinkShown(link: StudioFooterLink): boolean {
  const rows = Object.values(link.rows);
  return rows.length > 0 ? rows.some((row) => row?.enabled) : link.enabled;
}

/** "N of M links shown" for a custom group. */
export function shownLinksSummary(group: StudioFooterGroup): string {
  const shown = group.links.filter(isLinkShown).length;
  const total = group.links.length;
  return `${shown} of ${total} ${total === 1 ? "link" : "links"} shown`;
}

/**
 * A group that is Shown but would render nothing: a custom group without a
 * shown link, Find Me without a shown social link, Contact without an email.
 */
export function isLeftOut(
  group: StudioFooterGroup,
  sources: FooterScreenSources,
): boolean {
  if (!group.enabled) return false;
  switch (group.kind) {
    case "custom":
      return !group.links.some(isLinkShown);
    case "find_me":
      return sources.socialLinks.length === 0;
    case "contact":
      return sources.contactEmail.trim() === "";
    default:
      return false;
  }
}

/**
 * The preview's `composeFooterGroups` input for one locale, as
 * `getPublicSiteContext` builds it: stored labels, the links whose row in
 * this locale is shown and has a label (with that row's id and address, so a
 * legacy pair that disagrees previews like the live footer), and the social
 * links with a label in this locale and a safe address. Groups keep the
 * loader's footer order.
 */
export function localizeRecords(
  groups: readonly StudioFooterGroup[],
  sources: FooterScreenSources,
  locale: Locale,
): FooterSources {
  return {
    locale,
    groups: groups.map((group, index) => ({
      id: group.id,
      key: group.key,
      sortOrder: index,
      enabled: group.enabled,
      label: group.label[locale],
      links: group.enabled
        ? group.links.flatMap((link) => {
            const row = link.rows[locale];
            return row?.enabled && link.label[locale].trim()
              ? [{ id: row.id, label: link.label[locale], url: row.url }]
              : [];
          })
        : [],
    })),
    navigation: sources.navigation,
    serviceAreas: sources.serviceAreas,
    socialLinks: sources.socialLinks.flatMap((link) => {
      const label = link.label[locale].trim();
      return label && isSafeFooterUrl(link.url)
        ? [{ id: link.id, label, url: link.url }]
        : [];
    }),
    contactEmail: sources.contactEmail,
  };
}
