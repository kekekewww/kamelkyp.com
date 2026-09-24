/**
 * Shared Content Studio types (client-safe). docs/content-schema.md §4.
 */
import type { ContentBlock } from "../content/block-schema";
import type { Locale } from "../i18n/locale";

export type { Locale };

export type LocalizedText = { zh: string; en: string };
export type LocalizedBlocks = { zh: ContentBlock[]; en: ContentBlock[] };

export const ENTRY_STATUSES = ["draft", "published", "archived"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTITY_TYPES = [
  "project",
  "music",
  "recognition",
  "writing",
  "service",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type SluggedEntityType = "project" | "writing" | "service";
export type UsageEntityType = EntityType | "brand_settings" | "site_settings";

/** media_assets.id */
export type AssetRef = string;

export type LinkItem = { label: LocalizedText; url: string };
export type CreditItem = { role: LocalizedText; name: string };

export type ValidationIssueCode =
  | "required"
  | "required_locale"
  | "one_locale_only"
  | "invalid_url"
  | "slug_taken"
  | "slug_invalid"
  | "todo_content"
  | "brand_name"
  | "alt_required"
  | "missing_asset"
  | "wrong_asset_kind"
  | "price_required"
  | "price_forbidden"
  | "too_long"
  | "snapshot_too_large"
  /** Structural draft problem (wrong type, malformed value). */
  | "invalid_value";

export type ValidationIssue = {
  /** Dotted path, e.g. "story.context", "gallery.2.assetId". */
  field: string;
  locale?: Locale;
  code: ValidationIssueCode;
  /** Errors block publish; warnings never do. */
  severity: "error" | "warning";
  /** English Studio copy. */
  message: string;
};

export type EntityMeta = {
  id: string;
  type: EntityType;
  status: EntryStatus;
  todoContent: boolean;
  featured: boolean;
  featuredOrder: number | null;
  sortOrder: number;
  revision: number;
  publishedRevision: number | null;
  hasUnpublishedChanges: boolean;
  slug?: string;
  publishedSlug?: string | null;
  listed?: boolean;
  isShowreel?: boolean;
  commissionServiceId?: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  archivedAt: string | null;
};
