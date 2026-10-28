/**
 * Project editor form model (client-safe). The same parsing and publish
 * rules run in the browser (live checklist for the dirty form) and on the
 * server (`repositories/projects.server.ts`), so the two never disagree about
 * what a field means. Field names follow `app/lib/cms/forms.ts`.
 */
import { formDataToObject, readExpectedRevision } from "../../../lib/cms/forms";
import {
  type ProjectContent,
  ProjectDraftSchema,
} from "../../../lib/cms/schemas/project";
import type { LocalizedBlocks, ValidationIssue } from "../../../lib/cms/types";
import {
  structuralIssues,
  validateForPublish,
} from "../../../lib/cms/validation";
import { ContentBlockSchema } from "../../../lib/content/block-schema";
import { editableBlocks } from "../blocks/block-model";

export type ProjectFormResult =
  | {
      ok: true;
      content: ProjectContent;
      /** Hidden `expectedRevision`; null when missing or malformed. */
      expectedRevision: number | null;
      /** "This is real content" (clears TODO_CONTENT on save). */
      clearTodoContent: boolean;
    }
  | { ok: false; issues: ValidationIssue[] };

/** FormData → draft content. Structural problems come back as issues. */
export function readProjectForm(formData: FormData): ProjectFormResult {
  const raw = formDataToObject(formData);
  const parsed = ProjectDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: structuralIssues(parsed.error) };
  }
  return {
    ok: true,
    content: parsed.data,
    expectedRevision: readExpectedRevision(formData),
    clearTodoContent: raw.clearTodoContent === true,
  };
}

/**
 * The block editor's value in a local backup (`serializeForm` entries):
 * `<name>.zh:json` and `<name>.en:json`. Restoring a backup writes only the
 * visible controls back (`useEditorForm`), so the block editor remounts with
 * this value instead. A locale the backup lacks or garbles keeps `stored`.
 * Blocks still being written stay, as the writing editor keeps them
 * (`editableBlocks`); only entries the editor cannot show are dropped.
 */
export function backupBlocks(
  fields: string,
  name: string,
  stored: LocalizedBlocks,
): LocalizedBlocks {
  let entries: unknown;
  try {
    entries = JSON.parse(fields);
  } catch {
    return stored;
  }
  if (!Array.isArray(entries)) return stored;
  const read = (locale: "zh" | "en"): LocalizedBlocks["zh"] => {
    const entry = entries.find(
      (item): item is [string, string] =>
        Array.isArray(item) &&
        item[0] === `${name}.${locale}:json` &&
        typeof item[1] === "string",
    );
    if (!entry) return stored[locale];
    let value: unknown;
    try {
      value = JSON.parse(entry[1]);
    } catch {
      return stored[locale];
    }
    if (!Array.isArray(value)) return stored[locale];
    return editableBlocks(value);
  };
  return { zh: read("zh"), en: read("en") };
}

const BODY_FIELDS: ReadonlySet<string> = new Set([
  "body.zh:json",
  "body.en:json",
]);

/** A block list without the blocks the schema refuses (unchanged when none). */
function storableBlocksJson(raw: string): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(value)) return raw;
  const kept = value.filter(
    (block) => ContentBlockSchema.safeParse(block).success,
  );
  return kept.length === value.length ? raw : JSON.stringify(kept);
}

/**
 * The form as the preview reads it. The block editor posts a block the owner
 * is still writing (a link with only its label) so that a save refuses it
 * and the block keeps its message; the preview leaves such blocks out instead
 * of refusing the whole form (422), so it keeps following everything else.
 */
export function previewFormData(formData: FormData): FormData {
  const result = new FormData();
  for (const [name, value] of formData.entries()) {
    result.append(
      name,
      BODY_FIELDS.has(name) && typeof value === "string"
        ? storableBlocksJson(value)
        : value,
    );
  }
  return result;
}

/** Publish readiness the browser can judge on its own (model + TODO rules). */
export function projectPublishIssues(
  content: ProjectContent,
  context: { todoContent: boolean },
): ValidationIssue[] {
  return validateForPublish("project", content, {
    todoContent: context.todoContent,
  });
}

/**
 * Findings only the server can make: they need the media library, the other
 * rows' slugs or the brand deny list.
 */
const SERVER_ONLY_CODES = new Set<ValidationIssue["code"]>([
  "alt_required",
  "missing_asset",
  "wrong_asset_kind",
  "slug_taken",
  "brand_name",
  "snapshot_too_large",
]);

/**
 * Checklist source: while the form is dirty, model rules come from the live
 * client check and server-only findings from the last save; a clean form
 * shows the server's list as is.
 */
export function mergeIssues(
  client: readonly ValidationIssue[],
  server: readonly ValidationIssue[],
  dirty: boolean,
): ValidationIssue[] {
  if (!dirty) return [...server];
  return [
    ...client,
    ...server.filter((issue) => SERVER_ONLY_CODES.has(issue.code)),
  ];
}

export const PROJECT_SECTIONS = [
  { id: "basic", label: "Basic" },
  { id: "media", label: "Media" },
  { id: "classification", label: "Classification" },
  { id: "case-study", label: "Case study" },
  { id: "links", label: "Links" },
  { id: "credits", label: "Credits" },
  { id: "publication", label: "Publication" },
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTIONS)[number]["id"];

const SECTION_BY_ROOT: Record<string, ProjectSectionId> = {
  title: "basic",
  slug: "basic",
  year: "basic",
  role: "basic",
  shortDescription: "basic",
  description: "basic",
  coverImageId: "media",
  coverVideoId: "media",
  socialImageId: "media",
  gallery: "media",
  primaryCategoryId: "classification",
  categoryIds: "classification",
  tools: "classification",
  technologies: "classification",
  story: "case-study",
  body: "case-study",
  links: "links",
  credits: "credits",
};

/** Which editor section holds a (dotted) field path. */
export function projectSectionOf(field: string): ProjectSectionId {
  const root = field.split(".")[0] ?? "";
  return SECTION_BY_ROOT[root] ?? "publication";
}

/** Blocking issue count per section (sections without issues are omitted). */
export function sectionIssueCounts(
  issues: readonly ValidationIssue[],
): Partial<Record<ProjectSectionId, number>> {
  const counts: Partial<Record<ProjectSectionId, number>> = {};
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    const section = projectSectionOf(issue.field);
    counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

const FIELD_SECTION: Record<keyof ProjectContent, ProjectSectionId> = {
  title: "basic",
  slug: "basic",
  year: "basic",
  role: "basic",
  shortDescription: "basic",
  description: "basic",
  coverImageId: "media",
  coverVideoId: "media",
  socialImageId: "media",
  gallery: "media",
  primaryCategoryId: "classification",
  categoryIds: "classification",
  tools: "classification",
  technologies: "classification",
  story: "case-study",
  body: "case-study",
  links: "links",
  credits: "credits",
  listed: "publication",
  seo: "publication",
};

/** Sections holding unpublished changes (working copy vs live snapshot). */
export function changedProjectSections(
  working: ProjectContent,
  published: ProjectContent | null,
): ProjectSectionId[] {
  if (!published) return [];
  const changed = new Set<ProjectSectionId>();
  for (const key of Object.keys(FIELD_SECTION) as Array<keyof ProjectContent>) {
    const a = JSON.stringify(canonical(working[key]));
    const b = JSON.stringify(canonical(published[key]));
    if (a !== b) changed.add(FIELD_SECTION[key]);
  }
  return PROJECT_SECTIONS.map((section) => section.id).filter((id) =>
    changed.has(id),
  );
}

/** Deep equality of two parsed contents, independent of key order. */
export function sameProjectContent(
  a: ProjectContent,
  b: ProjectContent,
): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
