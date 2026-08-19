import type { Locale } from "./locale";

const COOKIE_NAME = "kamel_locale";

export function parseLocaleCookie(header: string | null): Locale | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];

  return value === "zh" || value === "en" ? value : null;
}

export function getPreferredLocale(input: {
  cookieHeader: string | null;
  acceptLanguage: string | null;
}): Locale {
  const cookie = parseLocaleCookie(input.cookieHeader);
  if (cookie) return cookie;
  return input.acceptLanguage?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function serializeLocaleCookie(locale: Locale): string {
  return [
    `${COOKIE_NAME}=${locale}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}
