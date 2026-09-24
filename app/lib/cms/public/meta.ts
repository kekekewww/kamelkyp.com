/**
 * Public <head> metadata (client-safe; content-architecture §3.6). Titles,
 * descriptions, OpenGraph and JSON-LD come from brand and site settings: the
 * home page uses `siteTitle`, every other page `"<page> — <brandName>"`.
 * Structured data is one `WebSite` object named after the brand; there is no
 * Person markup and no author field anywhere.
 */
import type { MetaDescriptor } from "react-router";
import type { PublicImage, PublicSiteContext } from "./view-models";

const LAYOUT_IDS = new Set([
  "routes/public/layout",
  "routes/studio/preview/layout",
]);

const OG_LOCALE = { zh: "zh_TW", en: "en_US" } as const;
const LANGUAGE = { zh: "zh-Hant", en: "en" } as const;

/** The site context from the public (or preview) layout's loader data. */
export function siteFromMatches(
  matches: ReadonlyArray<{ id: string; loaderData?: unknown }>,
): PublicSiteContext | null {
  for (const match of matches) {
    if (!LAYOUT_IDS.has(match.id)) continue;
    const data = match.loaderData as { site?: PublicSiteContext | null } | null;
    if (data?.site) return data.site;
  }
  return null;
}

export interface PageMeta {
  /** Page title; omitted on the home page (site title). */
  title?: string | null;
  description?: string | null;
  image?: PublicImage | null;
  noindex?: boolean;
  type?: "website" | "article";
}

/** Route `meta` helper: the page's head built on the layout's site context. */
export function pageMeta(
  matches: ReadonlyArray<{ id: string; loaderData?: unknown }>,
  page: PageMeta,
): MetaDescriptor[] {
  const site = siteFromMatches(matches);
  return site ? publicMeta({ site, ...page }) : [{ title: page.title ?? "" }];
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

export function publicMeta(
  input: PageMeta & { site: PublicSiteContext },
): MetaDescriptor[] {
  const { site } = input;
  const brandName = site.brand.brandName || "Kamel";
  const title = input.title?.trim()
    ? `${input.title.trim()} — ${brandName}`
    : site.site.siteTitle || brandName;
  const description =
    input.description?.trim() || site.site.seoDescription || "";
  const image =
    input.image ?? site.site.ogImage ?? site.site.defaultSocialImage ?? null;

  const tags: MetaDescriptor[] = [{ title }];
  if (description) tags.push({ name: "description", content: description });
  if (input.noindex) tags.push({ name: "robots", content: "noindex" });

  tags.push(
    { property: "og:title", content: title },
    { property: "og:site_name", content: brandName },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:locale", content: OG_LOCALE[site.locale] },
  );
  if (description) {
    tags.push({ property: "og:description", content: description });
  }
  if (image) {
    tags.push({ property: "og:image", content: image.src });
    if (image.alt) tags.push({ property: "og:image:alt", content: image.alt });
  }
  tags.push({
    name: "twitter:card",
    content: image ? "summary_large_image" : "summary",
  });

  const siteDescription = site.site.siteDescription || description;
  tags.push({
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brandName,
      inLanguage: LANGUAGE[site.locale],
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
  }
  return tags;
}
