/**
 * Service model (content-schema §2.6, §4). Client-safe.
 *
 * Commission-linked rows (`commissionServiceId` set) carry marketing content
 * only: their price is always the active `price_versions` rule. The link is
 * seed-only and immutable, so it is never part of the save columns.
 */
import { z } from "zod";
import { SERVICE_IDS, type ServiceId } from "../../services/service-id";
import type { LocalizedText } from "../types";
import {
  IdDraft,
  json,
  localizedText,
  SlugDraft,
  StoredNullableInt,
  StoredNullableString,
  StoredTextSchema,
  storedArray,
} from "./common";

export const PRICE_MODES = [
  "fixed",
  "starting_from",
  "custom_quote",
  "contact",
] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const CURRENCIES = ["TWD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type ServiceContent = {
  slug: string;
  groupTermId: string | null;
  /** Read-only in the Studio. */
  commissionServiceId: ServiceId | null;
  name: LocalizedText;
  shortDescription: LocalizedText;
  description: LocalizedText;
  priceMode: PriceMode;
  priceAmount: number | null;
  currency: Currency | null;
  turnaround: LocalizedText;
  revisions: LocalizedText;
  deliverables: LocalizedText[];
  requirements: LocalizedText[];
  process: Array<{ title: LocalizedText; body: LocalizedText }>;
  faq: Array<{ question: LocalizedText; answer: LocalizedText }>;
  inquirySubject: LocalizedText;
};

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const ServiceDraftSchema = z
  .object({
    slug: SlugDraft,
    groupTermId: IdDraft,
    commissionServiceId: z.enum(SERVICE_IDS).nullable().default(null),
    name: localizedText(200),
    shortDescription: localizedText(280),
    description: localizedText(4000),
    priceMode: z.enum(PRICE_MODES).default("contact"),
    priceAmount: z.preprocess(
      emptyToNull,
      z.number().int().positive().max(100_000_000).nullable().default(null),
    ),
    currency: z.preprocess(
      emptyToNull,
      z.enum(CURRENCIES).nullable().default(null),
    ),
    turnaround: localizedText(200),
    revisions: localizedText(200),
    deliverables: z.array(localizedText(300)).max(30).default([]),
    requirements: z.array(localizedText(300)).max(30).default([]),
    process: z
      .array(z.object({ title: localizedText(200), body: localizedText(1000) }))
      .max(12)
      .default([]),
    faq: z
      .array(
        z.object({ question: localizedText(300), answer: localizedText(2000) }),
      )
      .max(30)
      .default([]),
    inquirySubject: localizedText(200),
  })
  .transform((value): ServiceContent => value);

const StoredProcessItem = z
  .object({ title_i18n: StoredTextSchema, body_i18n: StoredTextSchema })
  .transform((item) => ({ title: item.title_i18n, body: item.body_i18n }));
const StoredFaqItem = z
  .object({ question_i18n: StoredTextSchema, answer_i18n: StoredTextSchema })
  .transform((item) => ({
    question: item.question_i18n,
    answer: item.answer_i18n,
  }));
const StoredLocalizedItem = z.object({ zh: z.string(), en: z.string() });

export const ServiceSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    core: z.object({
      slug: z.string(),
      group_term_id: StoredNullableString,
      commission_service_id: z.enum(SERVICE_IDS).nullable().catch(null),
      name_i18n: StoredTextSchema,
      short_description_i18n: StoredTextSchema,
      description_i18n: StoredTextSchema,
      price_mode: z.enum(PRICE_MODES).catch("contact"),
      price_amount: StoredNullableInt,
      currency: z.enum(CURRENCIES).nullable().catch(null).default(null),
      inquiry_subject_i18n: StoredTextSchema,
    }),
    details: z.object({
      turnaround_i18n: StoredTextSchema,
      revisions_i18n: StoredTextSchema,
      deliverables: storedArray(StoredLocalizedItem),
      requirements: storedArray(StoredLocalizedItem),
      process: storedArray(StoredProcessItem),
      faq: storedArray(StoredFaqItem),
    }),
  })
  .transform(
    ({ core, details }): ServiceContent => ({
      slug: core.slug,
      groupTermId: core.group_term_id,
      commissionServiceId: core.commission_service_id,
      name: core.name_i18n,
      shortDescription: core.short_description_i18n,
      description: core.description_i18n,
      priceMode: core.price_mode,
      priceAmount: core.price_amount,
      currency: core.currency,
      turnaround: details.turnaround_i18n,
      revisions: details.revisions_i18n,
      deliverables: details.deliverables,
      requirements: details.requirements,
      process: details.process,
      faq: details.faq,
      inquirySubject: core.inquiry_subject_i18n,
    }),
  );

/**
 * Save columns. `commission_service_id` is never written (immutable link);
 * commission rows keep `price_mode = 'starting_from'` and no amount.
 */
export function serviceContentToColumns(
  content: ServiceContent,
  options: { commissionLinked?: boolean } = {},
): Record<string, string | number | null> {
  const linked = options.commissionLinked ?? false;
  return {
    slug: content.slug,
    group_term_id: content.groupTermId,
    name_i18n: json(content.name),
    short_description_i18n: json(content.shortDescription),
    description_i18n: json(content.description),
    price_mode: linked ? "starting_from" : content.priceMode,
    price_amount: linked ? null : content.priceAmount,
    currency: linked ? null : content.currency,
    turnaround_i18n: json(content.turnaround),
    revisions_i18n: json(content.revisions),
    deliverables_json: json(content.deliverables),
    requirements_json: json(content.requirements),
    process_json: json(
      content.process.map((item) => ({
        title_i18n: item.title,
        body_i18n: item.body,
      })),
    ),
    faq_json: json(
      content.faq.map((item) => ({
        question_i18n: item.question,
        answer_i18n: item.answer,
      })),
    ),
    inquiry_subject_i18n: json(content.inquirySubject),
  };
}
