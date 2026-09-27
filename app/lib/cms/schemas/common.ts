/**
 * Shared zod building blocks for Content Studio models (client-safe).
 *
 * Draft schemas refuse only values that cannot be stored safely (over-long
 * text, malformed structure, bad slug characters, years outside 1990–2100);
 * completeness is checked at publish time by `validation.ts`.
 * Snapshot schemas read `<type>_snapshots` view JSON and are lenient about
 * missing keys (defaults) so that older snapshots keep rendering.
 */
import { z } from "zod";
import {
  type ContentBlock,
  ContentBlockSchema,
} from "../../content/block-schema";
import { isValidSlug } from "../slug";
import type { LocalizedBlocks, LocalizedText } from "../types";

export const EMPTY_TEXT: LocalizedText = Object.freeze({ zh: "", en: "" });

/** `{zh, en}` with a per-locale length cap; missing locales become "". */
export function localizedText(max: number) {
  return z
    .object({
      zh: z.string().max(max).default(""),
      en: z.string().max(max).default(""),
    })
    .default({ zh: "", en: "" });
}

/** Stored `{zh, en}` (snapshot side): anything missing becomes "". */
export const StoredTextSchema = z
  .object({
    zh: z.string().catch(""),
    en: z.string().catch(""),
  })
  .catch({ zh: "", en: "" })
  .default({ zh: "", en: "" });

/** Block arrays: invalid blocks are dropped one by one, max 300. */
const LenientBlocksSchema = z
  .array(z.unknown())
  .catch([])
  .default([])
  .transform((items): ContentBlock[] =>
    items
      .map((item) => ContentBlockSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data as ContentBlock)
      .slice(0, 300),
  );

export const StoredBlocksSchema = z
  .object({ zh: LenientBlocksSchema, en: LenientBlocksSchema })
  .catch({ zh: [], en: [] })
  .default({ zh: [], en: [] })
  .transform((value): LocalizedBlocks => ({ zh: value.zh, en: value.en }));

/** Draft block bodies are validated strictly (the block editor emits valid blocks). */
export const DraftBlocksSchema = z
  .object({
    zh: z.array(ContentBlockSchema).max(300).default([]),
    en: z.array(ContentBlockSchema).max(300).default([]),
  })
  .default({ zh: [], en: [] });

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** A media asset id or null ("" from a form counts as null). */
export const AssetRefDraft = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).max(100).nullable().default(null),
);

/** Any foreign id (taxonomy term, project) or null. */
export const IdDraft = AssetRefDraft;

export const YearDraft = z.preprocess(
  emptyToNull,
  z.number().int().min(1990).max(2100).nullable().default(null),
);

export const IsoDateDraft = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid")
    .nullable()
    .default(null),
);

/** URLs are stored as typed; https is a publish rule (invalid_url). */
export const UrlDraft = z.preprocess(
  emptyToNull,
  z.string().trim().max(2048).nullable().default(null),
);

export const SlugDraft = z
  .string()
  .trim()
  .toLowerCase()
  .max(96)
  .default("")
  .refine((slug) => slug === "" || isValidSlug(slug), "slug_invalid");

export const NonNegativeIntDraft = z.preprocess(
  emptyToNull,
  z.number().int().min(0).max(1_000_000_000).nullable().default(null),
);

export const LinkItemDraft = z.object({
  label: localizedText(200),
  url: z.string().trim().max(2048).default(""),
});

export const CreditItemDraft = z.object({
  role: localizedText(200),
  name: z.string().trim().max(200).default(""),
});

export const StoredLinkItem = z
  .object({
    label_i18n: StoredTextSchema,
    url: z.string().catch(""),
  })
  .transform((item) => ({ label: item.label_i18n, url: item.url }));

export const StoredCreditItem = z
  .object({
    role_i18n: StoredTextSchema,
    name: z.string().catch(""),
  })
  .transform((item) => ({ role: item.role_i18n, name: item.name }));

export function storedArray<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((items) =>
      items
        .map((value) => item.safeParse(value))
        .filter((result) => result.success)
        .map((result) => result.data as z.output<T>),
    );
}

export const StoredStringList = z
  .array(z.unknown())
  .catch([])
  .default([])
  .transform((items) =>
    items.filter((item): item is string => typeof item === "string"),
  );

export const StoredNullableString = z
  .string()
  .nullable()
  .catch(null)
  .default(null);
export const StoredNullableInt = z
  .number()
  .int()
  .nullable()
  .catch(null)
  .default(null);

/** `listed` is 0/1 in SQL JSON; booleans are accepted too. */
export const StoredFlag = z
  .union([z.number(), z.boolean()])
  .catch(1)
  .default(1)
  .transform((value) => value === true || value === 1);

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function linksToJson(items: { label: LocalizedText; url: string }[]) {
  return json(items.map((item) => ({ label_i18n: item.label, url: item.url })));
}

export function creditsToJson(items: { role: LocalizedText; name: string }[]) {
  return json(items.map((item) => ({ role_i18n: item.role, name: item.name })));
}

export function isHttpsUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
