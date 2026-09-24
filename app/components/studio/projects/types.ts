/**
 * Shapes shared by the projects repository (server) and the Studio screens
 * (client). Type-only, so screens never import a `.server` module.
 */
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { ProjectContent } from "../../../lib/cms/schemas/project";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type {
  EntityMeta,
  EntryStatus,
  LocalizedText,
  ValidationIssue,
} from "../../../lib/cms/types";
import type { ProjectSectionId } from "./project-form";
import type { ProjectListQuery } from "./project-list";

/** `/studio/projects` loader data. */
export interface ProjectsListData {
  query: ProjectListQuery;
  rows: StudioProjectRow[];
  /** Homepage "Selected work" candidates in featured order. */
  featured: StudioProjectRow[];
  facets: { years: number[]; categories: Term[] };
  /** Every category label, archived ones included (row meta). */
  categoryLabels: Record<string, LocalizedText>;
  /** Manual order, no search or filter: reordering is available. */
  manualOrder: boolean;
  /** Site setting: how many featured projects the homepage shows. */
  featuredLimit: number;
  /** Server clock (relative times render the same on server and client). */
  now: string;
}

/** `/studio/projects/:id` loader data. */
export interface ProjectEditorData {
  meta: EntityMeta;
  content: ProjectContent;
  /** Server publish check of the saved working copy. */
  issues: ValidationIssue[];
  terms: Term[];
  /** Summaries of the assets the working copy references, by id. */
  assets: Record<string, MediaSummary>;
  /** Music tracks that point at this project (read-only here). */
  music: Array<{ id: string; label: string; status: EntryStatus }>;
  /** Old public slugs that 301 to this project. */
  redirects: Array<{ fromSlug: string; createdAt: string }>;
  /** Sections whose working copy differs from the live version. */
  changedSections: ProjectSectionId[];
  urls: { preview: string; live: { zh: string; en: string } | null };
  featuredLimit: number;
  now: string;
}

export interface StudioProjectRow {
  id: string;
  title: LocalizedText;
  /** ZH title, else EN, else "" (the row shows "Untitled"). */
  label: string;
  /** EN title when it differs from the label. */
  secondary: string | null;
  slug: string;
  publishedSlug: string | null;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  featuredOrder: number | null;
  sortOrder: number;
  hasUnpublishedChanges: boolean;
  listed: boolean;
  year: number | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  updatedAt: string;
}

/** Loose view of every projects action result (fetchers read it). */
export interface ProjectActionData {
  ok: boolean;
  intent?: string;
  code?: string;
  message?: string;
  issues?: ValidationIssue[];
  meta?: EntityMeta;
  /** publish: false when validation refused (the draft is still saved). */
  published?: boolean;
  status?: EntryStatus;
  wasPublished?: boolean;
  republished?: boolean;
  featured?: boolean;
  deleted?: boolean;
  /** Client navigation target (delete → list, duplicate → the copy). */
  redirectTo?: string;
  id?: string;
  slug?: string;
  label?: string;
}
