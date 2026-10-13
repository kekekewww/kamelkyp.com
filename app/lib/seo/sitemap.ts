/**
 * sitemap.xml output (pure; WP4 §4.6, §4.8): one `<url>` per entry and
 * rendered locale, with `xhtml:link` hreflang alternates. No changefreq and
 * no priority; one urlset (the site is far below 50,000 URLs).
 */
import { LOCALES, type Locale } from "../i18n/locale";
import { absoluteUrl, localeAlternates } from "./urls";

export interface SitemapEntry {
  /** Locale-less path: "" (home), "/works/fixture-signal-map". */
  path: string;
  /** Locales in which the path renders 200. */
  locales: readonly Locale[];
  /** ISO timestamp (the row's published_at) or null. */
  lastModified: string | null;
}

/** Public pages that render 200 in both locales whatever the data. */
export const SITEMAP_STATIC_PATHS = [
  "",
  "/works",
  "/services",
  "/mixing",
  "/song-transition",
  "/services/software",
  "/about",
  "/writing",
  "/commission",
  "/terms",
  "/privacy",
] as const;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);
}

export function buildSitemapXml(
  entries: readonly SitemapEntry[],
  origin: string,
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const entry of entries) {
    for (const locale of LOCALES) {
      if (!entry.locales.includes(locale)) continue;
      const pathname = `/${locale}${entry.path}`;
      lines.push(
        "  <url>",
        `    <loc>${xmlEscape(absoluteUrl(origin, pathname))}</loc>`,
      );
      if (entry.lastModified) {
        lines.push(`    <lastmod>${xmlEscape(entry.lastModified)}</lastmod>`);
      }
      for (const link of localeAlternates(origin, pathname, entry.locales)) {
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${xmlEscape(link.hrefLang)}" href="${xmlEscape(link.href)}"/>`,
        );
      }
      lines.push("  </url>");
    }
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}
