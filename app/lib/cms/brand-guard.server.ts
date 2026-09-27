/**
 * Brand guard (server only; content-architecture §6.5). The only public
 * identity is Kamel: publish validation and settings saves refuse public text
 * that contains a personal-name variant. The deny list lives in this
 * `.server.ts` module so it never reaches a client bundle.
 */
import type { BrandHit } from "./validation";

type Term = { label: string; pattern: RegExp };

/** Ordered longest-first so one string reports its most specific hit. */
const DENY_LIST: readonly Term[] = [
  { label: "楊子賢", pattern: /楊子賢/ },
  { label: "子賢", pattern: /子賢/ },
  { label: "kevinyaungputra", pattern: /kevinyaungputra/i },
  { label: "Kevin Yang", pattern: /\bkevin\s+yang\b/i },
  { label: "Yaung", pattern: /yaung/i },
  { label: "Kevin", pattern: /\bkevin\b/i },
  { label: "Yang", pattern: /\byang\b/i },
];

export function matchBrandTerm(value: string): string | null {
  for (const term of DENY_LIST) {
    if (term.pattern.test(value)) return term.label;
  }
  return null;
}

function isLocalizedText(value: unknown): value is { zh: string; en: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    typeof (value as Record<string, unknown>).zh === "string" &&
    typeof (value as Record<string, unknown>).en === "string"
  );
}

/**
 * Walks any content value and reports each string that contains a deny-list
 * term. Localized `{zh, en}` objects report the locale. `exempt` lists dotted
 * paths to skip (e.g. `contactEmail`).
 */
export function findBrandViolations(
  value: unknown,
  options: { exempt?: readonly string[] } = {},
): BrandHit[] {
  const exempt = new Set(options.exempt ?? []);
  const hits: BrandHit[] = [];

  const visit = (node: unknown, path: string) => {
    if (path && exempt.has(path)) return;
    if (typeof node === "string") {
      const term = matchBrandTerm(node);
      if (term) hits.push({ field: path, term });
      return;
    }
    if (isLocalizedText(node)) {
      for (const locale of ["zh", "en"] as const) {
        const term = matchBrandTerm(node[locale]);
        if (term) hits.push({ field: path, locale, term });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, path ? `${path}.${index}` : String(index));
      });
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    }
  };

  visit(value, "");
  return hits;
}
