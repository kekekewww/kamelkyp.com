/**
 * `{zh, en}` helpers (client-safe). Completeness rule (content-schema §1.2):
 * a required field must be non-empty after trim in BOTH locales; there is no
 * cross-locale fallback anywhere on the public site.
 */
import type { Locale, LocalizedText } from "./types";

export const LOCALES: readonly Locale[] = ["zh", "en"];

export function emptyText(): LocalizedText {
  return { zh: "", en: "" };
}

export function sameText(value: string): LocalizedText {
  return { zh: value, en: value };
}

export function isFilled(
  text: LocalizedText | null | undefined,
  locale: Locale,
): boolean {
  return (text?.[locale] ?? "").trim().length > 0;
}

export function isComplete(text: LocalizedText | null | undefined): boolean {
  return LOCALES.every((locale) => isFilled(text, locale));
}

export function isEmptyText(text: LocalizedText | null | undefined): boolean {
  return LOCALES.every((locale) => !isFilled(text, locale));
}

export function filledLocales(
  text: LocalizedText | null | undefined,
): Locale[] {
  return LOCALES.filter((locale) => isFilled(text, locale));
}

/** The value for one locale, trimmed. Never falls back to the other locale. */
export function localize(
  text: LocalizedText | null | undefined,
  locale: Locale,
): string {
  return (text?.[locale] ?? "").trim();
}

/** Defensive parse of a stored `{zh, en}` JSON column. */
export function parseLocalizedText(raw: unknown): LocalizedText {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return emptyText();
    }
  }
  if (!value || typeof value !== "object") return emptyText();
  const record = value as Record<string, unknown>;
  return {
    zh: typeof record.zh === "string" ? record.zh : "",
    en: typeof record.en === "string" ? record.en : "",
  };
}

/** A display label for Studio lists: zh, then en, then a fallback. */
export function studioLabel(
  text: LocalizedText | null | undefined,
  fallback = "Untitled",
): string {
  return localize(text, "zh") || localize(text, "en") || fallback;
}
