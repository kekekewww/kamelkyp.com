import type { Locale } from "./locale";

export function localePath(locale: Locale, path = ""): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return suffix === "/" ? `/${locale}` : `/${locale}${suffix}`;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  return pathname.replace(/^\/(zh|en)(?=\/|$)/, `/${locale}`);
}
