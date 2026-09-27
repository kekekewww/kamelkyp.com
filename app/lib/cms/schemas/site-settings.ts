/**
 * Site settings document (`settings.key = 'site'`, content-schema §2.9).
 * Client-safe. Same save/read split as brand settings.
 */
import { z } from "zod";
import type { LocalizedText } from "../types";
import { parseLenient } from "./brand-settings";

const text = (max: number) =>
  z
    .object({
      zh: z.string().max(max).default(""),
      en: z.string().max(max).default(""),
    })
    .default({ zh: "", en: "" });

export const NAV_KEYS = ["work", "services", "about", "writing"] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export const HOMEPAGE_SECTIONS = [
  "showreel",
  "selectedWork",
  "capabilities",
  "recognition",
  "services",
  "pricing",
  "about",
  "writing",
  "contact",
] as const;
export type HomepageSection = (typeof HOMEPAGE_SECTIONS)[number];

export const AVAILABILITY_STATUSES = [
  "unspecified",
  "available",
  "limited",
  "unavailable",
] as const;

export const SERVICE_AREA_KEYS = [
  "mixing",
  "song_transition",
  "software",
] as const;
export type ServiceAreaKey = (typeof SERVICE_AREA_KEYS)[number];

const AssetId = z.string().trim().min(1).max(100);

const DEFAULT_NAVIGATION = NAV_KEYS.map((key) => ({ key, visible: true }));
const DEFAULT_SECTIONS = Object.fromEntries(
  HOMEPAGE_SECTIONS.map((key) => [key, true]),
) as Record<HomepageSection, boolean>;

export const SiteSettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  siteTitle: text(120),
  siteDescription: text(400),
  seoDescription: text(400),
  ogImageId: AssetId.nullable().default(null),
  defaultSocialImageId: AssetId.nullable().default(null),
  navigation: z
    .object({
      items: z
        .array(z.object({ key: z.enum(NAV_KEYS), visible: z.boolean() }))
        .max(NAV_KEYS.length)
        .refine(
          (items) =>
            new Set(items.map((item) => item.key)).size === items.length,
          "duplicate_navigation_item",
        ),
    })
    .default({ items: DEFAULT_NAVIGATION }),
  footerMessage: text(400),
  copyright: text(120),
  availability: z
    .object({
      status: z.enum(AVAILABILITY_STATUSES),
      message: text(200),
    })
    .default({ status: "unspecified", message: { zh: "", en: "" } }),
  homepage: z
    .object({
      sections: z
        .object(
          Object.fromEntries(
            HOMEPAGE_SECTIONS.map((key) => [key, z.boolean().default(true)]),
          ) as Record<HomepageSection, z.ZodDefault<z.ZodBoolean>>,
        )
        .default(DEFAULT_SECTIONS),
      featuredProjectCount: z.number().int().min(1).max(12).default(4),
      writingCount: z.number().int().min(0).max(12).default(3),
      recognitionCount: z.number().int().min(0).max(12).default(3),
      contactBandBody: text(600),
    })
    .default({
      sections: DEFAULT_SECTIONS,
      featuredProjectCount: 4,
      writingCount: 3,
      recognitionCount: 3,
      contactBandBody: { zh: "", en: "" },
    }),
  serviceAreas: z
    .array(
      z.object({
        key: z.enum(SERVICE_AREA_KEYS),
        name: text(120),
        summary: text(400),
        linkLabel: text(120),
      }),
    )
    .max(SERVICE_AREA_KEYS.length)
    .default([]),
  servicesPage: z
    .object({ process: z.array(z.object({ title: text(120) })).max(8) })
    .default({ process: [] }),
  softwarePage: z
    .object({
      engagementModels: z
        .array(
          z.object({
            key: z.string().trim().min(1).max(40),
            label: z.string().trim().max(40),
            title: text(120),
            description: text(600),
            priceNote: text(120),
          }),
        )
        .max(6),
      process: z.array(z.object({ title: text(120) })).max(8),
      inquiry: z.object({
        subject: text(200),
        include: z.array(text(200)).max(10),
      }),
    })
    .default({
      engagementModels: [],
      process: [],
      inquiry: { subject: { zh: "", en: "" }, include: [] },
    }),
  contactBand: z
    .object({ default: text(200), project: text(200), work: text(200) })
    .default({
      default: { zh: "", en: "" },
      project: { zh: "", en: "" },
      work: { zh: "", en: "" },
    }),
});

export type SiteSettings = z.output<typeof SiteSettingsSchema>;

const empty = (): LocalizedText => ({ zh: "", en: "" });

export const DEFAULT_SITE_SETTINGS: SiteSettings = Object.freeze({
  schemaVersion: 1,
  siteTitle: empty(),
  siteDescription: empty(),
  seoDescription: empty(),
  ogImageId: null,
  defaultSocialImageId: null,
  navigation: { items: DEFAULT_NAVIGATION.map((item) => ({ ...item })) },
  footerMessage: empty(),
  copyright: { zh: "© {year} {brand}", en: "© {year} {brand}" },
  availability: { status: "unspecified", message: empty() },
  homepage: {
    sections: { ...DEFAULT_SECTIONS },
    featuredProjectCount: 4,
    writingCount: 3,
    recognitionCount: 3,
    contactBandBody: empty(),
  },
  serviceAreas: [],
  servicesPage: { process: [] },
  softwarePage: {
    engagementModels: [],
    process: [],
    inquiry: { subject: empty(), include: [] },
  },
  contactBand: { default: empty(), project: empty(), work: empty() },
}) as SiteSettings;

export function parseSiteSettings(raw: unknown): SiteSettings {
  return parseLenient(SiteSettingsSchema, DEFAULT_SITE_SETTINGS, raw);
}

/** `© {year} {brand}` → `© 2026 Kamel`. */
export function formatCopyright(
  template: string,
  values: { year: number; brand: string },
): string {
  return template
    .replaceAll("{year}", String(values.year))
    .replaceAll("{brand}", values.brand);
}
