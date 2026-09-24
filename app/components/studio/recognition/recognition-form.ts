/**
 * Recognition editor model (client-safe): sections, the live publish
 * checklist computed from the form (the same zod schema and publish rules
 * the server uses) and list sort ties.
 */
import { formDataToObject } from "../../../lib/cms/forms";
import { RecognitionDraftSchema } from "../../../lib/cms/schemas/recognition";
import type { ValidationIssue } from "../../../lib/cms/types";
import {
  structuralIssues,
  validateRecognitionForPublish,
} from "../../../lib/cms/validation";

export const RECOGNITION_SECTIONS = [
  { id: "basic", label: "Basic" },
  { id: "details", label: "Details" },
  { id: "publication", label: "Publication" },
] as const;

const DETAILS = new Set([
  "description",
  "url",
  "imageId",
  "disciplineTermId",
  "projectId",
]);
const BASIC = new Set([
  "event",
  "organization",
  "result",
  "typeTermId",
  "year",
  "date",
]);

export function recognitionSectionOf(field: string): string {
  const head = field.split(".")[0] ?? field;
  if (BASIC.has(head)) return "basic";
  if (DETAILS.has(head)) return "details";
  return "publication";
}

/** Model rules for the current form (context rules come from the server). */
export function recognitionIssues(formData: FormData): ValidationIssue[] {
  const parsed = RecognitionDraftSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return structuralIssues(parsed.error);
  return validateRecognitionForPublish(parsed.data, { todoContent: false });
}

/** Rows with the same year and date are ordered manually. */
export function recognitionTieKey(row: {
  year: number | null;
  date: string | null;
}): string {
  return `${row.year ?? ""}|${row.date ?? ""}`;
}

export function yearFromDate(date: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1990 && year <= 2100 ? year : null;
}
