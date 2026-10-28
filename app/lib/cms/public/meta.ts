/**
 * Public <head> metadata (client-safe; content-architecture §3.6). Titles,
 * descriptions, OpenGraph and JSON-LD come from brand and site settings: the
 * home page uses `siteTitle`, every other page `"<page> — <brandName>"`.
 * Structured data is one `WebSite` object named after the brand; there is no
 * Person markup and no author field anywhere.
 *
 * With the public layout's seo context (WP4 §4.5) every indexable page also
 * gets an absolute canonical, hreflang alternates for the locales it renders
 * in, `og:url` and a built-in Kamel share card when no image is set.
 * Deployment-level noindex lives in `X-Robots-Tag` and robots.txt only, so
 * the head is the same on previews and production.
 */
import type { MetaDescriptor } from "react-router";
import { LOCALES, type Locale } from "../../i18n/locale";
import { DEFAULT_OG_IMAGE, SITE_ICON_PATHS } from "../../seo/brand-assets";
import {
  absoluteUrl,
  canonicalPath,
  HREFLANG,
  localeAlternates,
  type PublicSeoContext,
} from "../../seo/urls";
import type { PublicImage, PublicSiteContext } from "./view-models";

const PUBLIC_LAYOUT_ID = "routes/public/layout";
const LAYOUT_IDS = new Set([PUBLIC_LAYOUT_ID, "routes/studio/preview/layout"]);

const OG_LOCALE = { zh: "zh_TW", en: "en_US" } as const;

type MetaMatches = ReadonlyArray<{ id: string; loaderData?: unknown }>;

/** The site context from the public (or preview) layout's loader data. */
export function siteFromMatches(
  matches: MetaMatches,
): PublicSiteContext | null {
  for (const match of matches) {
    if (!LAYOUT_IDS.has(match.id)) continue;
    const data = match.loaderData as { site?: PublicSiteContext | null } | null;
    if (data?.site) return data.site;
  }
  return null;
}

/**
 * The seo context from the public layout only: Studio previews never get a
 * canonical (they are noindex,nofollow and Access-gated).
 */
export function seoFromMatches(matches: MetaMatches): PublicSeoContext | null {
  for (const match of matches) {
    if (match.id !== PUBLIC_LAYOUT_ID) continue;
    const data = match.loaderData as {
      seo?: PublicSeoContext | null;
    } | null;
    return data?.seo ?? null;
  }
  return null;
}

interface PageMeta {
  /** Page title; omitted on the home page (site title). */
  title?: string | null;
  description?: string | null;
  image?: PublicImage | null;
  noindex?: boolean;
  type?: "website" | "article";
  /** Locales this page renders in; default both (static pages). */
  locales?: readonly Locale[];
}

type MetaInput = {
  matches: MetaMatches;
  location: { pathname: string };
};

/**
 * Route `meta` helper: the page's head built on the layout's site and seo
 * context. The canonical comes from `location.pathname`, never from a match
 * (a layout match would give the layout's path).
 */
export function pageMeta(
  { matches, location }: MetaInput,
  page: PageMeta,
): MetaDescriptor[] {
  const site = siteFromMatches(matches);
  if (!site) return [{ title: page.title ?? "" }];
  const seo = seoFromMatches(matches);
  return publicMeta({
    site,
    ...page,
    seo: seo ? { ...seo, pathname: location.pathname } : null,
  });
}

/** Head of a Studio preview page: never indexed, never shared. */
export function previewMeta(
  title: string | null | undefined,
): MetaDescriptor[] {
  return [
    { title: `Preview: ${title?.trim() || "Untitled"} — KAMEL STUDIO` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

function imageTags(
  image: PublicImage | null,
  input: { seo: PublicSeoContext | null; locale: Locale },
): MetaDescriptor[] {
  if (image) {
    const tags: MetaDescriptor[] = [
      { property: "og:image", content: image.src },
    ];
    // A transformation variant (srcSet present) is not the original's size.
    if (!image.srcSet && image.width && image.height) {
      tags.push(
        { property: "og:image:width", content: String(image.width) },
        { property: "og:image:height", content: String(image.height) },
      );
    }
    if (image.alt) tags.push({ property: "og:image:alt", content: image.alt });
    return tags;
  }
  if (!input.seo) return [];
  return [
    {
      property: "og:image",
      content: absoluteUrl(input.seo.origin, DEFAULT_OG_IMAGE.path),
    },
    { property: "og:image:width", content: String(DEFAULT_OG_IMAGE.width) },
    { property: "og:image:height", content: String(DEFAULT_OG_IMAGE.height) },
    { property: "og:image:type", content: DEFAULT_OG_IMAGE.type },
    { property: "og:image:alt", content: DEFAULT_OG_IMAGE.alt[input.locale] },
  ];
}

export function publicMeta(
  input: PageMeta & {
    site: PublicSiteContext;
    seo?: (PublicSeoContext & { pathname: string }) | null;
  },
): MetaDescriptor[] {
  const { site } = input;
  const seo = input.seo ?? null;
  const locale = site.locale;
  const brandName = site.brand.brandName || "Kamel";
  const home = !input.title?.trim();
  const title = input.title?.trim()
    ? `${input.title.trim()} — ${brandName}`
    : site.site.siteTitle || brandName;
  const description =
    input.description?.trim() || site.site.seoDescription || "";
  // Studio hints: the OG image is the homepage's, the default social image
  // is for pages without their own; each falls back to the other.
  const siteImage = home
    ? (site.site.ogImage ?? site.site.defaultSocialImage)
    : (site.site.defaultSocialImage ?? site.site.ogImage);
  const image = input.image ?? siteImage ?? null;
  const locales = input.locales ?? LOCALES;
  const canonical =
    seo && !input.noindex
      ? absoluteUrl(seo.origin, canonicalPath(seo.pathname))
      : null;

  const tags: MetaDescriptor[] = [{ title }];
  if (description) tags.push({ name: "description", content: description });
  if (input.noindex) tags.push({ name: "robots", content: "noindex" });
  if (seo && canonical) {
    tags.push({ tagName: "link", rel: "canonical", href: canonical });
    for (const link of localeAlternates(seo.origin, seo.pathname, locales)) {
      tags.push({
        tagName: "link",
        rel: "alternate",
        hrefLang: link.hrefLang,
        href: link.href,
      });
    }
  }

  tags.push(
    { property: "og:title", content: title },
    { property: "og:site_name", content: brandName },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:locale", content: OG_LOCALE[locale] },
  );
  if (canonical) {
    for (const other of LOCALES) {
      if (other !== locale && locales.includes(other)) {
        tags.push({
          property: "og:locale:alternate",
          content: OG_LOCALE[other],
        });
      }
    }
    tags.push({ property: "og:url", content: canonical });
  }
  if (description) {
    tags.push({ property: "og:description", content: description });
  }
  const shared = imageTags(image, { seo, locale });
  tags.push(...shared);
  tags.push({
    name: "twitter:card",
    content: shared.length > 0 ? "summary_large_image" : "summary",
  });

  const siteDescription = site.site.siteDescription || description;
  tags.push({
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brandName,
      inLanguage: HREFLANG[locale],
      ...(seo ? { url: absoluteUrl(seo.origin, `/${locale}`) } : {}),
      ...(siteDescription ? { description: siteDescription } : {}),
    },
  });

  if (site.brand.favicon) {
    tags.push({
      tagName: "link",
      rel: "icon",
      href: site.brand.favicon.src,
      type: site.brand.favicon.type,
    });
  } else {
    tags.push({
      tagName: "link",
      rel: "icon",
      href: SITE_ICON_PATHS.icon32,
      type: "image/png",
      sizes: "32x32",
    });
  }
  tags.push(
    {
      tagName: "link",
      rel: "apple-touch-icon",
      href: SITE_ICON_PATHS.appleTouch,
    },
    { tagName: "link", rel: "manifest", href: SITE_ICON_PATHS.manifest },
  );
  return tags;
}
