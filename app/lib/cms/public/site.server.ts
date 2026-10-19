/**
 * Public site context (content-architecture §3.6): brand, site settings,
 * navigation, footer groups and media config for one locale, read with one
 * `db.batch` plus one asset lookup.
 *
 * Footer: `composeFooterGroups` (`footer.ts`) builds it from the
 * `link_groups` rows (order, visibility, labels; custom groups' `links`), the
 * site navigation and service areas, the enabled social links and
 * `brand.contactEmail`. Only the composed groups enter the loader data (the
 * social links too: they reach the page only as Find Me links), so hidden
 * groups and links never reach the served HTML.
 */
import type { Env } from "../../env.server";
import { localize } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import { DEFAULT_MEDIA_CONFIG } from "../media/urls";
import type { BrandSettings } from "../schemas/brand-settings";
import { formatCopyright, type SiteSettings } from "../schemas/site-settings";
import { settingsFromRows, settingsStatement } from "../settings.server";
import { parseFormattedText } from "../text-format";
import type { Locale } from "../types";
import { imageView, localizeHref, termRef } from "./build-views";
import {
  composeFooterGroups,
  type FooterGroupRecord,
  isSafeFooterUrl,
} from "./footer";
import { termsFromRows, termsStatement } from "./read.server";
import type {
  PublicBrand,
  PublicCta,
  PublicSite,
  PublicSiteContext,
  PublicTermRef,
  ViewContext,
} from "./view-models";

type FooterRow = {
  group_id: string;
  stable_key: string;
  sort_order: number;
  group_enabled: number;
  group_label: string | null;
  link_id: string | null;
  link_label: string | null;
  link_url: string | null;
};

type SocialRow = { id: string; label_i18n: string; url: string };

function cta(
  value: BrandSettings["primaryCta"] | null,
  locale: Locale,
): PublicCta | null {
  if (!value) return null;
  const label = localize(value.label, locale);
  return label ? { label, href: localizeHref(locale, value.href) } : null;
}

function brandView(
  brand: BrandSettings,
  locale: Locale,
  context: ViewContext,
): PublicBrand {
  const favicon = brand.faviconId ? context.assets.get(brand.faviconId) : null;
  const faviconImage = imageView(brand.faviconId, context, locale);
  return {
    brandName: brand.brandName || "Kamel",
    tagline: localize(brand.tagline, locale),
    roles: brand.roles.map((role) => localize(role, locale)).filter(Boolean),
    heroStatement: localize(brand.heroStatement, locale),
    heroSubtext: localize(brand.heroSubtext, locale),
    primaryCta: cta(brand.primaryCta, locale),
    secondaryCta: cta(brand.secondaryCta, locale),
    shortBio: localize(brand.shortBio, locale),
    longBio: parseFormattedText(localize(brand.longBio, locale)),
    aboutSections: brand.aboutSections
      .map((section) => ({
        key: section.key,
        heading: localize(section.heading, locale),
        body: parseFormattedText(localize(section.body, locale)),
      }))
      .filter((section) => section.heading),
    capabilities: brand.capabilities
      .map((capability) => ({
        key: capability.key,
        index: capability.index,
        title: localize(capability.title, locale),
        description: localize(capability.description, locale),
        items: capability.items
          .map((item) => localize(item, locale))
          .filter(Boolean),
        categories: capability.categoryIds
          .map((id) => termRef(id, context, locale))
          .filter((term): term is PublicTermRef => term !== null),
      }))
      .filter((capability) => capability.title),
    locationDisplay: localize(brand.locationDisplay, locale),
    contactEmail: brand.contactEmail,
    portrait: imageView(brand.portraitId, context, locale),
    logo: imageView(brand.logoId, context, locale),
    favicon:
      faviconImage && favicon?.mimeType === "image/png"
        ? { src: faviconImage.src, type: "image/png" }
        : null,
  };
}

function siteView(
  site: SiteSettings,
  brandName: string,
  locale: Locale,
  context: ViewContext,
  now: Date,
): PublicSite {
  const text = (value: { zh: string; en: string }) => localize(value, locale);
  return {
    siteTitle: text(site.siteTitle),
    siteDescription: text(site.siteDescription),
    seoDescription: text(site.seoDescription),
    ogImage: imageView(site.ogImageId, context, locale),
    defaultSocialImage: imageView(site.defaultSocialImageId, context, locale),
    footerMessage: text(site.footerMessage),
    copyright: formatCopyright(text(site.copyright), {
      year: now.getFullYear(),
      brand: brandName,
    }),
    availability: {
      status: site.availability.status,
      message: text(site.availability.message),
    },
    homepage: {
      sections: { ...site.homepage.sections },
      featuredProjectCount: site.homepage.featuredProjectCount,
      writingCount: site.homepage.writingCount,
      recognitionCount: site.homepage.recognitionCount,
      contactBandBody: text(site.homepage.contactBandBody),
    },
    serviceAreas: site.serviceAreas.map((area) => ({
      key: area.key,
      name: text(area.name),
      summary: text(area.summary),
      linkLabel: text(area.linkLabel),
    })),
    servicesPage: {
      process: site.servicesPage.process
        .map((step) => text(step.title))
        .filter(Boolean),
    },
    softwarePage: {
      engagementModels: site.softwarePage.engagementModels.map((model) => ({
        key: model.key,
        label: model.label,
        title: text(model.title),
        description: text(model.description),
        priceNote: text(model.priceNote),
      })),
      process: site.softwarePage.process
        .map((step) => text(step.title))
        .filter(Boolean),
      inquiry: {
        subject: text(site.softwarePage.inquiry.subject),
        include: site.softwarePage.inquiry.include
          .map((item) => text(item))
          .filter(Boolean),
      },
    },
    contactBand: {
      default: text(site.contactBand.default),
      project: text(site.contactBand.project),
      work: text(site.contactBand.work),
    },
  };
}

/** Footer rows (one per group, plus one per link of a shown group) → records. */
function footerRecords(rows: readonly FooterRow[]): FooterGroupRecord[] {
  const records = new Map<string, FooterGroupRecord>();
  for (const row of rows) {
    const record = records.get(row.group_id) ?? {
      id: row.group_id,
      key: row.stable_key,
      sortOrder: row.sort_order,
      enabled: row.group_enabled === 1,
      label: row.group_label ?? "",
      links: [],
    };
    if (row.link_id !== null) {
      record.links.push({
        id: row.link_id,
        label: row.link_label ?? "",
        url: row.link_url ?? "",
      });
    }
    records.set(row.group_id, record);
  }
  return [...records.values()];
}

/**
 * The site context without D1 (the settings defaults: brand "Kamel", empty
 * text, the code footer structure). Used when the database cannot be read,
 * so a public page never renders broken; sections that need text hide.
 */
export function fallbackSiteContext(
  env: Env | null,
  locale: Locale,
  options: { now?: Date } = {},
): PublicSiteContext {
  const { brand, site } = settingsFromRows([]);
  const context: ViewContext = {
    mediaConfig: env ? readMediaConfig(env) : DEFAULT_MEDIA_CONFIG,
    assets: new Map(),
    terms: new Map(),
    mode: "published",
  };
  const brandPublic = brandView(brand.value, locale, context);
  return {
    locale,
    brand: brandPublic,
    site: siteView(
      site.value,
      brandPublic.brandName,
      locale,
      context,
      options.now ?? new Date(),
    ),
    navigation: site.value.navigation.items.map((item) => ({ ...item })),
    footerGroups: composeFooterGroups({
      locale,
      groups: [],
      navigation: site.value.navigation.items,
      serviceAreas: site.value.serviceAreas,
      socialLinks: [],
      contactEmail: brand.value.contactEmail,
    }),
    mediaConfig: context.mediaConfig,
  };
}

export async function getPublicSiteContext(
  db: D1Database,
  env: Env,
  locale: Locale,
  options: { now?: Date } = {},
): Promise<PublicSiteContext> {
  const [settingsResult, termsResult, socialResult, footerResult] =
    await db.batch([
      settingsStatement(db),
      termsStatement(db),
      db.prepare(
        "SELECT id, label_i18n, url FROM social_links WHERE enabled = 1 ORDER BY sort_order, id",
      ),
      db
        .prepare(
          `SELECT g.id AS group_id, g.stable_key, g.sort_order, g.enabled AS group_enabled,
                  gl.label AS group_label, l.id AS link_id, l.label AS link_label, l.url AS link_url
           FROM link_groups g
           LEFT JOIN link_group_labels gl ON gl.group_id = g.id AND gl.locale = ?1
           LEFT JOIN links l ON l.group_id = g.id AND g.enabled = 1 AND l.locale = ?1 AND l.enabled = 1
           WHERE g.stable_key <> 'social'
           ORDER BY g.sort_order, g.id, l.sort_order, l.id`,
        )
        .bind(locale),
    ]);
  const { brand, site } = settingsFromRows(
    (settingsResult?.results ?? []) as Parameters<typeof settingsFromRows>[0],
  );
  const assets = await getAssets(
    db,
    [
      brand.value.portraitId,
      brand.value.logoId,
      brand.value.faviconId,
      site.value.ogImageId,
      site.value.defaultSocialImageId,
    ].filter((id): id is string => Boolean(id)),
  );
  const context: ViewContext = {
    mediaConfig: readMediaConfig(env),
    assets,
    terms: termsFromRows(
      (termsResult?.results ?? []) as Parameters<typeof termsFromRows>[0],
    ),
    mode: "published",
  };

  const brandPublic = brandView(brand.value, locale, context);
  // Only the Find Me group's links carry them to the page.
  const socialLinks = ((socialResult?.results ?? []) as SocialRow[])
    .map((row) => ({
      id: row.id,
      label: localize(JSON.parse(row.label_i18n), locale),
      url: row.url,
    }))
    .filter((link) => link.label && isSafeFooterUrl(link.url));

  return {
    locale,
    brand: brandPublic,
    site: siteView(
      site.value,
      brandPublic.brandName,
      locale,
      context,
      options.now ?? new Date(),
    ),
    navigation: site.value.navigation.items.map((item) => ({ ...item })),
    footerGroups: composeFooterGroups({
      locale,
      groups: footerRecords((footerResult?.results ?? []) as FooterRow[]),
      navigation: site.value.navigation.items,
      serviceAreas: site.value.serviceAreas,
      socialLinks,
      contactEmail: brand.value.contactEmail,
    }),
    mediaConfig: context.mediaConfig,
  };
}
