/**
 * Entity descriptors (content-architecture §3.10): one entry per lifecycle
 * table. The engine, usage index, preview and Studio counters work from these,
 * so a future content type is one table + one view + one descriptor.
 */
import type { z } from "zod";
import {
  type MusicContent,
  MusicDraftSchema,
  MusicSnapshotSchema,
  musicContentToColumns,
} from "../schemas/music";
import {
  type ProjectContent,
  ProjectDraftSchema,
  ProjectSnapshotSchema,
  projectContentToColumns,
} from "../schemas/project";
import {
  type RecognitionContent,
  RecognitionDraftSchema,
  RecognitionSnapshotSchema,
  recognitionContentToColumns,
} from "../schemas/recognition";
import {
  type ServiceContent,
  ServiceDraftSchema,
  ServiceSnapshotSchema,
  serviceContentToColumns,
} from "../schemas/service";
import {
  type WritingContent,
  WritingDraftSchema,
  WritingSnapshotSchema,
  writingContentToColumns,
} from "../schemas/writing";
import type { EntityType, LocalizedText } from "../types";

export type ContentOf<T extends EntityType> = {
  project: ProjectContent;
  music: MusicContent;
  recognition: RecognitionContent;
  writing: WritingContent;
  service: ServiceContent;
}[T];

export interface EntityDescriptor<T extends EntityType = EntityType> {
  type: T;
  table: string;
  view: string;
  /** Has `slug` / `published_slug`. */
  slugged: boolean;
  /** Publishing a changed slug writes a redirect (`slug_redirects.entity_type`). */
  redirectType: "project" | "writing" | null;
  hasListed: boolean;
  hasShowreel: boolean;
  hasCommissionLink: boolean;
  /** Column holding the display label JSON. */
  labelColumn: string;
  /** Localized columns searched by `listEntityOptions` and Studio lists. */
  searchColumns: readonly string[];
  fallbackSlugPrefix: string;
  draftSchema: z.ZodType<ContentOf<T>, unknown>;
  snapshotSchema: z.ZodType<ContentOf<T>, unknown>;
  toColumns(
    content: ContentOf<T>,
    options: { commissionLinked: boolean },
  ): Record<string, string | number | null>;
  /** The English text a new slug is generated from. */
  slugSource(content: ContentOf<T>): string;
  label(content: ContentOf<T>): LocalizedText;
}

export const ENTITY_DESCRIPTORS: { [T in EntityType]: EntityDescriptor<T> } = {
  project: {
    type: "project",
    table: "projects",
    view: "project_snapshots",
    slugged: true,
    redirectType: "project",
    hasListed: true,
    hasShowreel: false,
    hasCommissionLink: false,
    labelColumn: "title_i18n",
    searchColumns: ["title_i18n", "short_description_i18n", "role_i18n"],
    fallbackSlugPrefix: "project",
    draftSchema: ProjectDraftSchema,
    snapshotSchema: ProjectSnapshotSchema,
    toColumns: (content) => projectContentToColumns(content),
    slugSource: (content) => content.title.en,
    label: (content) => content.title,
  },
  music: {
    type: "music",
    table: "music_tracks",
    view: "music_snapshots",
    slugged: false,
    redirectType: null,
    hasListed: false,
    hasShowreel: true,
    hasCommissionLink: false,
    labelColumn: "title_i18n",
    searchColumns: ["title_i18n", "artist_i18n", "role_i18n", "genre_i18n"],
    fallbackSlugPrefix: "track",
    draftSchema: MusicDraftSchema,
    snapshotSchema: MusicSnapshotSchema,
    toColumns: (content) => musicContentToColumns(content),
    slugSource: (content) => content.title.en,
    label: (content) => content.title,
  },
  recognition: {
    type: "recognition",
    table: "recognitions",
    view: "recognition_snapshots",
    slugged: false,
    redirectType: null,
    hasListed: false,
    hasShowreel: false,
    hasCommissionLink: false,
    labelColumn: "event_i18n",
    searchColumns: ["event_i18n", "organization_i18n", "result_i18n"],
    fallbackSlugPrefix: "recognition",
    draftSchema: RecognitionDraftSchema,
    snapshotSchema: RecognitionSnapshotSchema,
    toColumns: (content) => recognitionContentToColumns(content),
    slugSource: (content) => content.event.en,
    label: (content) => content.event,
  },
  writing: {
    type: "writing",
    table: "writings",
    view: "writing_snapshots",
    slugged: true,
    redirectType: "writing",
    hasListed: true,
    hasShowreel: false,
    hasCommissionLink: false,
    labelColumn: "title_i18n",
    searchColumns: ["title_i18n", "excerpt_i18n"],
    fallbackSlugPrefix: "writing",
    draftSchema: WritingDraftSchema,
    snapshotSchema: WritingSnapshotSchema,
    toColumns: (content) => writingContentToColumns(content),
    slugSource: (content) => content.title.en,
    label: (content) => content.title,
  },
  service: {
    type: "service",
    table: "services",
    view: "service_snapshots",
    slugged: true,
    redirectType: null,
    hasListed: false,
    hasShowreel: false,
    hasCommissionLink: true,
    labelColumn: "name_i18n",
    searchColumns: ["name_i18n", "short_description_i18n", "description_i18n"],
    fallbackSlugPrefix: "service",
    draftSchema: ServiceDraftSchema,
    snapshotSchema: ServiceSnapshotSchema,
    toColumns: (content, options) =>
      serviceContentToColumns(content, {
        commissionLinked: options.commissionLinked,
      }),
    slugSource: (content) => content.name.en,
    label: (content) => content.name,
  },
};

export function descriptorFor<T extends EntityType>(
  type: T,
): EntityDescriptor<T> {
  return ENTITY_DESCRIPTORS[type] as EntityDescriptor<T>;
}

/** Meta columns selected for every lifecycle row. */
export function metaColumns(descriptor: EntityDescriptor): string {
  return [
    "t.id",
    "t.status",
    "t.todo_content",
    "t.featured",
    "t.featured_order",
    "t.sort_order",
    "t.revision",
    "t.published_revision",
    "(t.published_json IS NOT NULL) AS has_snapshot",
    "t.created_at",
    "t.updated_at",
    "t.published_at",
    "t.first_published_at",
    "t.archived_at",
    `t.${descriptor.labelColumn} AS label_json`,
    ...(descriptor.slugged ? ["t.slug", "t.published_slug"] : []),
    ...(descriptor.hasListed ? ["t.listed"] : []),
    ...(descriptor.hasShowreel ? ["t.is_showreel"] : []),
    ...(descriptor.hasCommissionLink ? ["t.commission_service_id"] : []),
  ].join(", ");
}
