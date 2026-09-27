/**
 * Services list grouping (client-safe): groups follow the taxonomy order
 * (Mixing, Song Transition, Music Production, Software Development, Creative
 * Technology, Interactive Experiences, then any group added later); rows
 * without a group come last. Empty groups are left out.
 */
import type { Term } from "../../../lib/cms/schemas/taxonomy";

export type ServiceGroupBlock<T> = { term: Term | null; rows: T[] };

export function groupServices<T extends { groupTermId: string | null }>(
  rows: readonly T[],
  terms: readonly Term[],
): ServiceGroupBlock<T>[] {
  const known = new Set(terms.map((term) => term.id));
  const blocks: ServiceGroupBlock<T>[] = terms
    .map((term) => ({
      term,
      rows: rows.filter((row) => row.groupTermId === term.id),
    }))
    .filter((block) => block.rows.length > 0);
  const loose = rows.filter(
    (row) => !row.groupTermId || !known.has(row.groupTermId),
  );
  if (loose.length > 0) blocks.push({ term: null, rows: loose });
  return blocks;
}
