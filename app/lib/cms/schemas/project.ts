/**
 * Project model (content-schema §2.2, §4). Client-safe.
 */
import { z } from "zod";
import type {
  AssetRef,
  CreditItem,
  LinkItem,
  LocalizedBlocks,
  LocalizedText,
} from "../types";
import {
  AssetRefDraft,
  CreditItemDraft,
  creditsToJson,
  DraftBlocksSchema,
  IdDraft,
  json,
  LinkItemDraft,
  linksToJson,
  localizedText,
  SlugDraft,
  StoredBlocksSchema,
  StoredCreditItem,
  StoredFlag,
  StoredLinkItem,
  StoredNullableInt,
  StoredNullableString,
  StoredStringList,
  StoredTextSchema,
  storedArray,
  YearDraft,
} from "./common";

export const STORY_KEYS = [
  "context",
  "problem",
  "approach",
  "process",
  "architecture",
  "result",
  "reflection",
] as const;
export type StoryKey = (typeof STORY_KEYS)[number];

export type ProjectContent = {
  slug: string;
  listed: boolean;
  year: number | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  title: LocalizedText;
  role: LocalizedText;
  shortDescription: LocalizedText;
  description: LocalizedText;
  tools: string[];
  technologies: string[];
  coverImageId: AssetRef | null;
  coverVideoId: AssetRef | null;
  socialImageId: AssetRef | null;
  gallery: Array<{ assetId: AssetRef; caption: LocalizedText }>;
  links: LinkItem[];
  credits: CreditItem[];
  story: Record<StoryKey, LocalizedText>;
  body: LocalizedBlocks;
  seo: { title: LocalizedText; description: LocalizedText };
};

const TagList = z.array(z.string().trim().min(1).max(60)).max(30).default([]);

const StoryDraft = z
  .object(
    Object.fromEntries(
      STORY_KEYS.map((key) => [key, localizedText(12000)]),
    ) as Record<StoryKey, ReturnType<typeof localizedText>>,
  )
  .default(
    Object.fromEntries(
      STORY_KEYS.map((key) => [key, { zh: "", en: "" }]),
    ) as Record<StoryKey, LocalizedText>,
  );

/** Primary category first, duplicates removed, at most 8. */
function normalizeCategories(primary: string | null, ids: string[]): string[] {
  const ordered = primary ? [primary, ...ids] : ids;
  return [...new Set(ordered)].slice(0, 8);
}

export const ProjectDraftSchema = z
  .object({
    slug: SlugDraft,
    listed: z.boolean().default(true),
    year: YearDraft,
    primaryCategoryId: IdDraft,
    categoryIds: z.array(z.string().trim().min(1).max(100)).max(9).default([]),
    title: localizedText(200),
    role: localizedText(200),
    shortDescription: localizedText(280),
    description: localizedText(4000),
    tools: TagList,
    technologies: TagList,
    coverImageId: AssetRefDraft,
    coverVideoId: AssetRefDraft,
    socialImageId: AssetRefDraft,
    gallery: z
      .array(
        z.object({
          assetId: z.string().trim().min(1).max(100),
          caption: localizedText(500),
        }),
      )
      .max(40)
      .default([]),
    links: z.array(LinkItemDraft).max(20).default([]),
    credits: z.array(CreditItemDraft).max(40).default([]),
    story: StoryDraft,
    body: DraftBlocksSchema,
    seo: z
      .object({ title: localizedText(300), description: localizedText(400) })
      .default({
        title: { zh: "", en: "" },
        description: { zh: "", en: "" },
      }),
  })
  .transform(
    (value): ProjectContent => ({
      ...value,
      categoryIds: normalizeCategories(
        value.primaryCategoryId,
        value.categoryIds,
      ),
    }),
  );

const StoredGalleryItem = z
  .object({
    assetId: z.string().min(1),
    caption_i18n: StoredTextSchema,
  })
  .transform((item) => ({ assetId: item.assetId, caption: item.caption_i18n }));

export const ProjectSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    core: z.object({
      slug: z.string(),
      listed: StoredFlag,
      year: StoredNullableInt,
      primary_category_id: StoredNullableString,
      categories: z
        .array(z.tuple([z.number(), z.string()]))
        .catch([])
        .default([]),
      title_i18n: StoredTextSchema,
      role_i18n: StoredTextSchema,
      short_description_i18n: StoredTextSchema,
      description_i18n: StoredTextSchema,
      tools: StoredStringList,
      technologies: StoredStringList,
    }),
    media: z
      .object({
        cover_image_id: StoredNullableString,
        cover_video_id: StoredNullableString,
        gallery: storedArray(StoredGalleryItem),
        social_image_id: StoredNullableString,
      })
      .default({
        cover_image_id: null,
        cover_video_id: null,
        gallery: [],
        social_image_id: null,
      }),
    story: z
      .object(
        Object.fromEntries(
          STORY_KEYS.map((key) => [`${key}_i18n`, StoredTextSchema]),
        ) as Record<`${StoryKey}_i18n`, typeof StoredTextSchema>,
      )
      .default({} as Record<`${StoryKey}_i18n`, LocalizedText>),
    extra: z
      .object({
        links: storedArray(StoredLinkItem),
        credits: storedArray(StoredCreditItem),
        body_i18n: StoredBlocksSchema,
      })
      .default({ links: [], credits: [], body_i18n: { zh: [], en: [] } }),
    seo: z
      .object({
        title_i18n: StoredTextSchema,
        description_i18n: StoredTextSchema,
      })
      .default({
        title_i18n: { zh: "", en: "" },
        description_i18n: { zh: "", en: "" },
      }),
  })
  .transform((snapshot): ProjectContent => {
    const categories = [...snapshot.core.categories]
      .sort((a, b) => a[0] - b[0])
      .map(([, id]) => id);
    return {
      slug: snapshot.core.slug,
      listed: snapshot.core.listed,
      year: snapshot.core.year,
      primaryCategoryId: snapshot.core.primary_category_id,
      categoryIds: normalizeCategories(
        snapshot.core.primary_category_id,
        categories,
      ),
      title: snapshot.core.title_i18n,
      role: snapshot.core.role_i18n,
      shortDescription: snapshot.core.short_description_i18n,
      description: snapshot.core.description_i18n,
      tools: snapshot.core.tools,
      technologies: snapshot.core.technologies,
      coverImageId: snapshot.media.cover_image_id,
      coverVideoId: snapshot.media.cover_video_id,
      socialImageId: snapshot.media.social_image_id,
      gallery: snapshot.media.gallery,
      links: snapshot.extra.links,
      credits: snapshot.extra.credits,
      story: Object.fromEntries(
        STORY_KEYS.map((key) => [
          key,
          snapshot.story[`${key}_i18n`] ?? { zh: "", en: "" },
        ]),
      ) as Record<StoryKey, LocalizedText>,
      body: snapshot.extra.body_i18n,
      seo: {
        title: snapshot.seo.title_i18n,
        description: snapshot.seo.description_i18n,
      },
    };
  });

/** Bind values for the working-copy UPDATE (categories are join rows). */
export function projectContentToColumns(
  content: ProjectContent,
): Record<string, string | number | null> {
  return {
    slug: content.slug,
    listed: content.listed ? 1 : 0,
    year: content.year,
    primary_category_id: content.primaryCategoryId,
    title_i18n: json(content.title),
    role_i18n: json(content.role),
    short_description_i18n: json(content.shortDescription),
    description_i18n: json(content.description),
    tools_json: json(content.tools),
    technologies_json: json(content.technologies),
    cover_image_id: content.coverImageId,
    cover_video_id: content.coverVideoId,
    social_image_id: content.socialImageId,
    gallery_json: json(
      content.gallery.map((item) => ({
        assetId: item.assetId,
        caption_i18n: item.caption,
      })),
    ),
    links_json: linksToJson(content.links),
    credits_json: creditsToJson(content.credits),
    ...Object.fromEntries(
      STORY_KEYS.map((key) => [`${key}_i18n`, json(content.story[key])]),
    ),
    body_i18n: json(content.body),
    seo_title_i18n: json(content.seo.title),
    seo_description_i18n: json(content.seo.description),
  };
}
