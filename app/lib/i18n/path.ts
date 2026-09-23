import type { Locale } from "./locale";

export function localePath(locale: Locale, path = ""): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return suffix === "/" ? `/${locale}` : `/${locale}${suffix}`;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  return pathname.replace(/^\/(zh|en)(?=\/|$)/, `/${locale}`);
}

export type NavSection =
  | "home"
  | "work"
  | "services"
  | "about"
  | "writing"
  | "cta";

/** Path prefixes (after `/:lang`) that mark each primary-nav item active (IA §2.1). */
const NAV_PREFIXES: Record<Exclude<NavSection, "home" | "cta">, string[]> = {
  work: ["/works"],
  services: ["/services", "/mixing", "/song-transition"],
  about: ["/about"],
  writing: ["/writing"],
};

function withinPrefix(rest: string, prefix: string): boolean {
  return rest === prefix || rest.startsWith(`${prefix}/`);
}

/** Whether `pathname` belongs to a primary-nav `section` (aria-current="page"). */
export function isNavSectionActive(
  pathname: string,
  section: NavSection,
): boolean {
  const rest = pathname.replace(/^\/(zh|en)(?=\/|$)/, "").replace(/\/$/, "");
  if (section === "home") return rest === "";
  if (section === "cta") return rest === "/commission";
  return NAV_PREFIXES[section].some((prefix) => withinPrefix(rest, prefix));
}

/**
 * Legacy `/:lang/other[/:slug]` → `/:lang/writing[/:slug]`, query string kept
 * (IA §1). Returns null for anything that is not a legacy writing path.
 */
export function legacyWritingTarget(
  pathname: string,
  search = "",
): string | null {
  const match = /^\/(zh|en)\/other(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  const [, locale, slug] = match;
  const target = slug ? `/${locale}/writing/${slug}` : `/${locale}/writing`;
  return `${target}${search}`;
}
