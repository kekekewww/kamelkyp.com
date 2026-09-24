/**
 * Slug rules (client-safe), mirroring the table CHECKs in 0005: `[a-z0-9-]`,
 * 1–96 characters, no leading or trailing hyphen (admin-architecture §4.11).
 */

export const SLUG_MAX = 96;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug);
}

/**
 * Slug from an English title. Non-Latin text is not transliterated: a title
 * without Latin letters or digits yields "" and the caller uses
 * {@link fallbackSlug}.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  return slug.slice(0, SLUG_MAX).replace(/-+$/, "");
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `project-x1y2z3` for titles that yield no Latin slug. */
export function fallbackSlug(
  prefix: string,
  random: () => number = Math.random,
): string {
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix +=
      ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return `${prefix}-${suffix}`;
}

/** `slug-copy`, then `slug-copy-2`, `slug-copy-3`, … (never taken). */
export function nextCopySlug(slug: string, taken: ReadonlySet<string>): string {
  const base = `${slug.slice(0, SLUG_MAX - 8).replace(/-+$/, "")}-copy`;
  if (!taken.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A unique slug derived from `base` (`base`, `base-2`, `base-3`, …). */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const stem = base.slice(0, SLUG_MAX - 4).replace(/-+$/, "");
  for (let index = 2; ; index += 1) {
    const candidate = `${stem}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}
