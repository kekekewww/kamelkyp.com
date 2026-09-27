/**
 * Taxonomy terms (content-schema §2.1). Client-safe.
 * Adding a vocabulary is a code change (this enum), not a migration.
 */
import { z } from "zod";
import type { LocalizedText } from "../types";

export const VOCABULARIES = [
  "project_category",
  "recognition_type",
  "writing_category",
  "service_group",
] as const;
export type Vocabulary = (typeof VOCABULARIES)[number];

export type Term = {
  id: string;
  vocabulary: Vocabulary;
  slug: string;
  label: LocalizedText;
  data: Record<string, unknown>;
  sortOrder: number;
  archivedAt: string | null;
};

/** Terms have no draft state: both labels are required on save. */
export const TermLabelSchema = z.object({
  zh: z.string().trim().min(1).max(80),
  en: z.string().trim().min(1).max(80),
});

export const ServiceGroupDataSchema = z.object({
  area: z.enum(["mixing", "song_transition", "software"]),
});

export function isVocabulary(value: string): value is Vocabulary {
  return (VOCABULARIES as readonly string[]).includes(value);
}
