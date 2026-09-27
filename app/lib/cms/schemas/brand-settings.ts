/**
 * Brand settings document (`settings.key = 'brand'`, content-schema §2.9).
 * Client-safe. Settings have no draft state: `BrandSettingsSchema` is the
 * full validation used on save; `parseBrandSettings` is the lenient reader
 * (every missing or invalid key falls back to its default).
 */
import { z } from "zod";
import type { LocalizedText } from "../types";

const text = (max: number) =>
  z
    .object({
      zh: z.string().max(max).default(""),
      en: z.string().max(max).default(""),
    })
    .default({ zh: "", en: "" });

/** Locale-less internal path (`/commission`) or an https URL. */
export const CtaHrefSchema = z
  .string()
  .trim()
  .max(500)
  .refine((href) => {
    if (href.startsWith("/"))
      return !href.startsWith("//") && !href.includes("\\");
    try {
      const url = new URL(href);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "href_invalid");

const CtaSchema = z.object({ label: text(60), href: CtaHrefSchema });
const AssetId = z.string().trim().min(1).max(100);

export const BrandSettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  brandName: z.string().trim().min(1).max(40).default("Kamel"),
  tagline: text(200),
  roles: z.array(text(80)).max(6).default([]),
  heroStatement: text(300),
  heroSubtext: text(600),
  primaryCta: CtaSchema.default({
    label: { zh: "", en: "" },
    href: "/commission",
  }),
  secondaryCta: CtaSchema.nullable().default(null),
  shortBio: text(2000),
  longBio: text(4000),
  aboutSections: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        heading: text(120),
        body: text(6000),
      }),
    )
    .max(8)
    .default([]),
  capabilities: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        index: z.string().trim().max(4).default(""),
        title: text(120),
        description: text(600),
        items: z.array(text(120)).min(3).max(5),
        categoryIds: z.array(z.string().min(1).max(100)).max(8).default([]),
      }),
    )
    .max(6)
    .default([]),
  locationDisplay: text(120),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .default("")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "email_invalid",
    ),
  contactEmailConfirmedAt: z.string().nullable().default(null),
  redesignCopyAcknowledgedAt: z.string().nullable().default(null),
  portraitId: AssetId.nullable().default(null),
  logoId: AssetId.nullable().default(null),
  faviconId: AssetId.nullable().default(null),
  brandAssetIds: z.array(AssetId).max(20).default([]),
});

export type BrandSettings = z.output<typeof BrandSettingsSchema>;

const empty = (): LocalizedText => ({ zh: "", en: "" });

/** Used when the row is missing (fresh local DB): the brand is always Kamel. */
export const DEFAULT_BRAND_SETTINGS: BrandSettings = Object.freeze({
  schemaVersion: 1,
  brandName: "Kamel",
  tagline: empty(),
  roles: [],
  heroStatement: empty(),
  heroSubtext: empty(),
  primaryCta: { label: empty(), href: "/commission" },
  secondaryCta: null,
  shortBio: empty(),
  longBio: empty(),
  aboutSections: [],
  capabilities: [],
  locationDisplay: empty(),
  contactEmail: "",
  contactEmailConfirmedAt: null,
  redesignCopyAcknowledgedAt: null,
  portraitId: null,
  logoId: null,
  faviconId: null,
  brandAssetIds: [],
}) as BrandSettings;

function toObject(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Key-by-key lenient read: invalid keys fall back to their defaults. */
export function parseLenient<T extends Record<string, unknown>>(
  schema: z.ZodObject,
  defaults: T,
  raw: unknown,
): T {
  const input = toObject(raw);
  if (!input) return structuredClone(defaults);
  const whole = schema.safeParse(input);
  if (whole.success) return whole.data as T;
  const result: Record<string, unknown> = structuredClone(defaults);
  for (const [key, field] of Object.entries(schema.shape)) {
    if (!(key in input)) continue;
    const parsed = (field as z.ZodType).safeParse(input[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as T;
}

export function parseBrandSettings(raw: unknown): BrandSettings {
  return parseLenient(BrandSettingsSchema, DEFAULT_BRAND_SETTINGS, raw);
}
