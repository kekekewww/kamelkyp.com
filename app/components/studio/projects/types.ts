/**
 * Shapes shared by the projects repository (server) and the Studio screens
 * (client). Type-only, so screens never import a `.server` module.
 */
import type {
  EntityMeta,
  EntryStatus,
  LocalizedText,
  ValidationIssue,
} from "../../../lib/cms/types";

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
