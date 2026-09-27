/**
 * Studio → Settings → Taxonomies (content-architecture §3.10, admin §2.2,
 * §4.9). Vocabulary values are rows: categories, recognition types, service
 * groups and writing categories are added, renamed, reordered and archived
 * here. Save is live (terms have no draft state); delete only when unused,
 * otherwise archive (hidden from pickers and public filters).
 */
import { formDataToObject, readString } from "../forms";
import {
  isVocabulary,
  type Term,
  VOCABULARIES,
  type Vocabulary,
} from "../schemas/taxonomy";
import {
  actionError,
  actionOk,
  cmsErrorResult,
  unknownIntent,
} from "../studio/responses";
import {
  archiveTerm,
  countTermUsage,
  createTerm,
  deleteTerm,
  listTerms,
  reorderTerms,
  restoreTerm,
  updateTerm,
} from "../taxonomy.server";
import type { LocalizedText } from "../types";

export type TaxonomyTermRow = Term & { usage: number };

export const VOCABULARY_LABELS: Record<Vocabulary, string> = {
  project_category: "Project categories",
  recognition_type: "Recognition types",
  service_group: "Service groups",
  writing_category: "Writing categories",
};

export function parseVocabulary(value: string | null | undefined): Vocabulary {
  return value && isVocabulary(value) ? value : VOCABULARIES[0];
}

export async function loadTaxonomyScreen(
  db: D1Database,
  vocabularyParam: string | null | undefined,
) {
  const vocabulary = parseVocabulary(vocabularyParam);
  const terms = await listTerms(db, vocabulary, { includeArchived: true });
  const usage = await Promise.all(
    terms.map((term) => countTermUsage(db, term.id)),
  );
  return {
    vocabulary,
    vocabularies: VOCABULARIES.map((key) => ({
      key,
      label: VOCABULARY_LABELS[key],
    })),
    terms: terms.map(
      (term, index): TaxonomyTermRow => ({ ...term, usage: usage[index] ?? 0 }),
    ),
  };
}

function readLabel(formData: FormData): LocalizedText {
  return {
    zh: (readString(formData, "label.zh") ?? "").trim(),
    en: (readString(formData, "label.en") ?? "").trim(),
  };
}

function readData(formData: FormData): object | undefined {
  const tree = formDataToObject(formData);
  return tree.data && typeof tree.data === "object"
    ? (tree.data as object)
    : undefined;
}

function readIds(formData: FormData): string[] | null {
  try {
    const parsed = JSON.parse(readString(formData, "ids") ?? "");
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function handleTaxonomyAction({
  db,
  formData,
  intent,
  now,
}: {
  db: D1Database;
  formData: FormData | null;
  intent: string | null;
  now: Date;
}) {
  const data = formData ?? new FormData();
  const id = (readString(data, "id") ?? "").trim();
  try {
    switch (intent) {
      case "create": {
        const vocabulary = parseVocabulary(readString(data, "vocabulary"));
        const term = await createTerm(
          db,
          vocabulary,
          {
            label: readLabel(data),
            slug: (readString(data, "slug") ?? "").trim() || undefined,
            data: readData(data),
          },
          now,
        );
        return actionOk({ term, message: `Added “${term.label.en}”` });
      }
      case "update": {
        const slug = readString(data, "slug");
        const term = await updateTerm(
          db,
          id,
          {
            label: readLabel(data),
            ...(slug !== null ? { slug } : {}),
            ...(readData(data) ? { data: readData(data) } : {}),
          },
          now,
        );
        return actionOk({ term, message: "Saved" });
      }
      case "archive":
        await archiveTerm(db, id, now);
        return actionOk({
          message: "Archived: hidden from pickers and filters",
        });
      case "restore":
        await restoreTerm(db, id);
        return actionOk({ message: "Restored" });
      case "delete":
        await deleteTerm(db, id);
        return actionOk({ message: "Deleted" });
      case "reorder": {
        const ids = readIds(data);
        if (!ids) {
          return actionError("invalid_content", {
            status: 422,
            message: "The new order could not be read.",
          });
        }
        await reorderTerms(
          db,
          parseVocabulary(readString(data, "vocabulary")),
          ids,
        );
        return actionOk({ message: "Order saved" });
      }
      default:
        return unknownIntent(intent);
    }
  } catch (error) {
    return cmsErrorResult(error);
  }
}
