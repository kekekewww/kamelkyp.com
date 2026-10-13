import { expect, type Page } from "@playwright/test";

/**
 * Personal-name variants that must never appear publicly (content-architecture
 * §6): the only public identity is "Kamel".
 */
export const PERSONAL_NAME_VARIANTS: ReadonlyArray<RegExp> = [
  /楊子賢/,
  /子賢/,
  /\bkevin\s+yang\b/i,
  /\bkevin\b/i,
  /\byang\b/i,
  /yaung/i,
];

/**
 * The brand contact address is operational and flagged for review in the
 * Studio (brand.contactEmail, `contactEmailConfirmedAt: null`); it is taken
 * from the page and excluded, never hard-coded here.
 */
export function withoutContactAddresses(html: string): string {
  const addresses = new Set(
    [...html.matchAll(/mailto:([^"'?&<>\s]+)/g)].map((match) =>
      decodeURIComponent(match[1] ?? ""),
    ),
  );
  let result = html;
  for (const address of addresses) {
    if (address) result = result.split(address).join("");
  }
  return result;
}

export function personalNameHits(html: string): string[] {
  const text = withoutContactAddresses(html);
  return PERSONAL_NAME_VARIANTS.flatMap((pattern) => {
    const match = text.match(pattern);
    return match ? [match[0]] : [];
  });
}

/** Rendered DOM text + attributes of the current page carry no name variant. */
export async function expectNoPersonalName(page: Page) {
  const html = await page.content();
  expect(personalNameHits(html), page.url()).toEqual([]);
}
