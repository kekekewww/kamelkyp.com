/**
 * Writing editor model (client-safe): sections, the live publish checklist,
 * platform names and where an entry goes once published (content-schema
 * §2.5: internal → article page; external with a link → a card that links out).
 */
import { formDataToObject } from "../../../lib/cms/forms";
import {
  WritingDraftSchema,
  type WritingPlatform,
} from "../../../lib/cms/schemas/writing";
import type { ValidationIssue } from "../../../lib/cms/types";
import {
  structuralIssues,
  validateWritingForPublish,
} from "../../../lib/cms/validation";

export const WRITING_SECTIONS = [
  { id: "basic", label: "Basic" },
  { id: "source", label: "Source" },
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "publication", label: "Publication" },
] as const;

export const PLATFORM_OPTIONS: ReadonlyArray<{
  value: WritingPlatform;
  label: string;
}> = [
  { value: "internal", label: "Internal" },
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
  { value: "medium", label: "Medium" },
  { value: "devpost", label: "Devpost" },
  { value: "other", label: "Other" },
];

const PLATFORM_LABEL = Object.fromEntries(
  PLATFORM_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WritingPlatform, string>;

/** Example addresses for the external link field. */
export const PLATFORM_URL_HINT: Record<WritingPlatform, string> = {
  internal: "https://",
  threads: "https://www.threads.net/@…/post/…",
  instagram: "https://www.instagram.com/p/…",
  medium: "https://medium.com/@…/…",
  devpost: "https://devpost.com/software/…",
  other: "https://",
};

export function platformDisplay(
  platform: WritingPlatform,
  platformLabel: string | null,
): string {
  if (platform === "other" && platformLabel?.trim()) {
    return platformLabel.trim();
  }
  return PLATFORM_LABEL[platform] ?? platform;
}

const BASIC = new Set([
  "title",
  "slug",
  "date",
  "platform",
  "platformLabel",
  "categoryTermId",
  "excerpt",
]);
const MEDIA = new Set(["coverImageId", "socialImageId"]);

export function writingSectionOf(field: string): string {
  const head = field.split(".")[0] ?? field;
  if (BASIC.has(head)) return "basic";
  if (head === "externalUrl") return "source";
  if (head === "content") return "content";
  if (MEDIA.has(head)) return "media";
  return "publication";
}

/** Model rules for the current form (context rules come from the server). */
export function writingIssues(formData: FormData): ValidationIssue[] {
  const parsed = WritingDraftSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return structuralIssues(parsed.error);
  return validateWritingForPublish(parsed.data, { todoContent: false });
}

export type WritingRoute =
  | { kind: "article"; path: string }
  | { kind: "link"; url: string }
  | { kind: "incomplete" };

/** Where the entry goes once published. */
export function writingRoute(entry: {
  platform: WritingPlatform;
  slug: string;
  externalUrl: string | null;
}): WritingRoute {
  if (entry.platform === "internal") {
    return { kind: "article", path: `/writing/${entry.slug}` };
  }
  const url = entry.externalUrl?.trim();
  return url ? { kind: "link", url } : { kind: "incomplete" };
}

/** Rows with the same date are ordered manually. */
export function writingTieKey(row: { date: string | null }): string {
  return row.date ?? "";
}
