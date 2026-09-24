/**
 * Public site context (content-architecture §3.6): brand, site settings,
 * navigation, footer groups, social links and media config for one locale,
 * read with one `db.batch` plus one asset lookup.
 *
 * Footer composition: site-structure groups from code (navigate, services,
 * legal), editable D1 link groups (except the legacy "social" group, which
 * became `social_links`), "Find me" from enabled social links (omitted when
 * none) and "Contact" computed from `brand.contactEmail`.
 */
import { getDefaultFooterGroups } from "../../content/footer-repository.server";
import type { Env } from "../../env.server";
import { localize } from "../localized";
import { getAssets } from "../media/assets.server";
import { readMediaConfig } from "../media/config.server";
import type { BrandSettings } from "../schemas/brand-settings";
import { formatCopyright, type SiteSettings } from "../schemas/site-settings";
import { settingsFromRows, settingsStatement } from "../settings.server";
import { parseFormattedText } from "../text-format";
import type { Locale } from "../types";
import { imageView, localizeHref, termRef } from "./build-views";
import { termsFromRows, termsStatement } from "./read.server";
import type {
  FooterGroup,
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
  group_label: string | null;
  link_id: string;
  label: string;
  url: string;
};

type SocialRow = {
  id: string;
  platform: string;
  label_i18n: string;
  url: string;
  username: string | null;
};

function isSafeFooterUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return ["https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

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

function composeFooter(input: {
  locale: Locale;
  rows: FooterRow[];
  socialLinks: PublicSiteContext["socialLinks"];
  contactEmail: string;
}): FooterGroup[] {
  const defaults = getDefaultFooterGroups(input.locale);
  const fallback = (id: string) => defaults.find((group) => group.id === id);
  const groups: FooterGroup[] = [];
  const push = (group: FooterGroup | undefined) => {
    if (group && group.links.length > 0) groups.push(group);
  };

  push(fallback("navigate"));
  push(fallback("services"));

  const stored = new Map<string, FooterGroup>();
  for (const row of input.rows) {
    if (!isSafeFooterUrl(row.url)) continue;
    const group = stored.get(row.group_id) ?? {
      id: row.group_id,
      label:
        row.group_label ??
        fallback(row.stable_key)?.label ??
        row.stable_key.replaceAll("_", " "),
      links: [],
    };
    group.links.push({ id: row.link_id, label: row.label, url: row.url });
    stored.set(row.group_id, group);
  }
  for (const group of stored.values()) push(group);

  const findMeLabel = input.locale === "zh" ? "社群" : "Find Me";
  push({
    id: "find_me",
    label: findMeLabel,
    links: input.socialLinks.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
    })),
  });

  const contact = fallback("contact");
  if (contact && input.contactEmail) {
    push({
      id: "contact",
      label: contact.label,
      links: [
        {
          id: "email",
          label: input.contactEmail,
          url: `mailto:${input.contactEmail}`,
        },
      ],
    });
  }

  push(fallback("legal"));
  return groups;
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
        "SELECT id, platform, label_i18n, url, username FROM social_links WHERE enabled = 1 ORDER BY sort_order, id",
      ),
      db
        .prepare(
          `SELECT g.id AS group_id, g.stable_key, gl.label AS group_label,
                  l.id AS link_id, l.label, l.url
           FROM link_groups g
           JOIN links l ON l.group_id = g.id
           LEFT JOIN link_group_labels gl ON gl.group_id = g.id AND gl.locale = l.locale
           WHERE g.enabled = 1 AND l.enabled = 1 AND l.locale = ? AND g.stable_key <> 'social'
           ORDER BY g.sort_order, l.sort_order`,
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
  const socialLinks = ((socialResult?.results ?? []) as SocialRow[])
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      label: localize(JSON.parse(row.label_i18n), locale),
      url: row.url,
      username: row.username,
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
    footerGroups: composeFooter({
      locale,
      rows: (footerResult?.results ?? []) as FooterRow[],
      socialLinks,
      contactEmail: brand.value.contactEmail,
    }),
    socialLinks,
    mediaConfig: context.mediaConfig,
  };
}
