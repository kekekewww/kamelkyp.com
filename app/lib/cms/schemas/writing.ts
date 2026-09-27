/**
 * Writing model (content-schema §2.5, §4). Client-safe.
 */
import { z } from "zod";
import type { AssetRef, LocalizedBlocks, LocalizedText } from "../types";
import {
  AssetRefDraft,
  DraftBlocksSchema,
  IdDraft,
  IsoDateDraft,
  json,
  localizedText,
  SlugDraft,
  StoredBlocksSchema,
  StoredFlag,
  StoredNullableString,
  StoredTextSchema,
  UrlDraft,
} from "./common";

export const WRITING_PLATFORMS = [
  "internal",
  "threads",
  "instagram",
  "medium",
  "devpost",
  "other",
] as const;
export type WritingPlatform = (typeof WRITING_PLATFORMS)[number];

export type WritingContent = {
  slug: string;
  listed: boolean;
  date: string | null;
  platform: WritingPlatform;
  platformLabel: string | null;
  categoryTermId: string | null;
  title: LocalizedText;
  excerpt: LocalizedText;
  content: LocalizedBlocks;
  externalUrl: string | null;
  coverImageId: AssetRef | null;
  socialImageId: AssetRef | null;
  seo: { title: LocalizedText; description: LocalizedText };
};

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const WritingDraftSchema = z
  .object({
    slug: SlugDraft,
    listed: z.boolean().default(true),
    date: IsoDateDraft,
    platform: z.enum(WRITING_PLATFORMS).default("internal"),
    platformLabel: z.preprocess(
      emptyToNull,
      z.string().trim().max(60).nullable().default(null),
    ),
    categoryTermId: IdDraft,
    title: localizedText(200),
    excerpt: localizedText(400),
    content: DraftBlocksSchema,
    externalUrl: UrlDraft,
    coverImageId: AssetRefDraft,
    socialImageId: AssetRefDraft,
    seo: z
      .object({ title: localizedText(300), description: localizedText(400) })
      .default({
        title: { zh: "", en: "" },
        description: { zh: "", en: "" },
      }),
  })
  .transform((value): WritingContent => value);

export const WritingSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    core: z.object({
      slug: z.string(),
      listed: StoredFlag,
      date: StoredNullableString,
      platform: z.enum(WRITING_PLATFORMS).catch("internal"),
      platform_label: StoredNullableString,
      category_term_id: StoredNullableString,
      title_i18n: StoredTextSchema,
      excerpt_i18n: StoredTextSchema,
      external_url: StoredNullableString,
      cover_image_id: StoredNullableString,
    }),
    content_i18n: StoredBlocksSchema,
    seo: z
      .object({
        title_i18n: StoredTextSchema,
        description_i18n: StoredTextSchema,
        social_image_id: StoredNullableString,
      })
      .default({
        title_i18n: { zh: "", en: "" },
        description_i18n: { zh: "", en: "" },
        social_image_id: null,
      }),
  })
  .transform(
    (snapshot): WritingContent => ({
      slug: snapshot.core.slug,
      listed: snapshot.core.listed,
      date: snapshot.core.date,
      platform: snapshot.core.platform,
      platformLabel: snapshot.core.platform_label,
      categoryTermId: snapshot.core.category_term_id,
      title: snapshot.core.title_i18n,
      excerpt: snapshot.core.excerpt_i18n,
      content: snapshot.content_i18n,
      externalUrl: snapshot.core.external_url,
      coverImageId: snapshot.core.cover_image_id,
      socialImageId: snapshot.seo.social_image_id,
      seo: {
        title: snapshot.seo.title_i18n,
        description: snapshot.seo.description_i18n,
      },
    }),
  );

export function writingContentToColumns(
  content: WritingContent,
): Record<string, string | number | null> {
  return {
    slug: content.slug,
    listed: content.listed ? 1 : 0,
    date: content.date,
    platform: content.platform,
    platform_label: content.platformLabel,
    category_term_id: content.categoryTermId,
    title_i18n: json(content.title),
    excerpt_i18n: json(content.excerpt),
    content_i18n: json(content.content),
    external_url: content.externalUrl,
    cover_image_id: content.coverImageId,
    social_image_id: content.socialImageId,
    seo_title_i18n: json(content.seo.title),
    seo_description_i18n: json(content.seo.description),
  };
}
