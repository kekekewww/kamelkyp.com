/**
 * Canonical and hreflang URLs (client-safe; WP4 §4.4). Public paths start
 * with the locale (`/zh`, `/en`); the alternates of a page are the same path
 * in every locale it renders in, plus `x-default` on the negotiation
 * fallback. hreflang values match `<html lang>`.
 */
import { LOCALES, type Locale } from "../i18n/locale";
import { switchLocalePath } from "../i18n/path";

/** Public layout loader data: the absolute origin of this deployment. */
export interface PublicSeoContext {
  origin: string;
}

/** Equal to `<html lang>` (app/root.tsx). */
export const HREFLANG: Record<Locale, string> = { zh: "zh-Hant", en: "en" };

/** Equal to the `/` negotiation fallback (locale-cookie.server.ts). */
export const X_DEFAULT_LOCALE: Locale = "en";

/**
 * The one spelling of a public path. React Router matches segments
 * case-insensitively and after percent-decoding, so `/en/ABOUT` and
 * `/en/%61bout` render `/en/about`; every public path is lowercase ASCII
 * (locales, static segments, slugs per `isValidSlug`), so each segment is
 * decoded, lowercased and re-encoded. Strips trailing slashes (never the
 * root); queries and hashes are not paths.
 */
export function canonicalPath(pathname: string): string {
  const path = pathname.split("/").map(canonicalSegment).join("/");
  return path.replace(/\/+$/, "") || "/";
}

function canonicalSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment).toLowerCase());
  } catch {
    // A malformed escape: React Router keeps the segment as is (and 404s).
    return segment;
  }
}

export function absoluteUrl(origin: string, path: string): string {
  return `${origin}${path}`;
}

/**
 * The hreflang set of a `/zh|/en` path: one link per rendered locale (in
 * LOCALES order) plus x-default. Empty when fewer than two locales render,
 * so a one-locale page has no alternates.
 */
export function localeAlternates(
  origin: string,
  pathname: string,
  locales: readonly Locale[],
): Array<{ hrefLang: string; href: string }> {
  const rendered = LOCALES.filter((locale) => locales.includes(locale));
  if (rendered.length < 2) return [];
  const path = canonicalPath(pathname);
  const href = (locale: Locale) =>
    absoluteUrl(origin, switchLocalePath(path, locale));
  const fallback = rendered.includes(X_DEFAULT_LOCALE)
    ? X_DEFAULT_LOCALE
    : (rendered[0] as Locale);
  return [
    ...rendered.map((locale) => ({
      hrefLang: HREFLANG[locale],
      href: href(locale),
    })),
    { hrefLang: "x-default", href: href(fallback) },
  ];
}
