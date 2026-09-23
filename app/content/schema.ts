import { z } from "zod";
import type { LocalizedText as CatalogLocalizedText } from "../lib/services/catalog";

/**
 * File-based content model (docs/information-architecture.md §6).
 * Every entry is authored in zh and en; nothing is auto-translated.
 * `placeholder: true` marks sample content that the UI must badge.
 */

export type LocalizedText = CatalogLocalizedText;

export const LocalizedTextSchema = z.object({
  zh: z.string().trim().min(1),
  en: z.string().trim().min(1),
}) satisfies z.ZodType<LocalizedText>;

export const PROJECT_CATEGORIES = [
  "software",
  "ai",
  "interactive",
  "music",
  "mixing",
  "research",
] as const;

export const ProjectCategorySchema = z.enum(PROJECT_CATEGORIES);
export type ProjectCategory = z.infer<typeof ProjectCategorySchema>;

/** Filter values for `/works?category=`; "all" means no filter. */
export type CategoryFilter = ProjectCategory | "all";

export const CATEGORY_LABELS: Record<CategoryFilter, LocalizedText> = {
  all: { zh: "全部", en: "All" },
  software: { zh: "軟體", en: "Software" },
  ai: { zh: "AI", en: "AI" },
  interactive: { zh: "互動", en: "Interactive" },
  music: { zh: "音樂", en: "Music" },
  mixing: { zh: "混音", en: "Mixing" },
  research: { zh: "研究", en: "Research" },
};

export const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "https_only");

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "iso_date")
  .refine((value) => !Number.isNaN(Date.parse(value)), "iso_date");

/** Local asset path or https URL. */
const ImageSrcSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      (value.startsWith("/") && !value.startsWith("//")) ||
      value.startsWith("https://"),
    "image_src",
  );

/** Guards placeholder text against invented prices or metrics (IA §6). */
const INVENTED_METRIC =
  /NT\$|US\$|%|\d[\d,.]*\s*(users?|clients?|streams?|downloads?|plays?)/i;

function localizedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(localizedStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(localizedStrings);
  }
  return [];
}

export function containsInventedMetric(value: unknown): boolean {
  return localizedStrings(value).some((text) => INVENTED_METRIC.test(text));
}

function hasSamplePrefix(title: LocalizedText): boolean {
  return title.en.startsWith("Sample:") && title.zh.startsWith("示意：");
}

// ---- Projects (IA §6.1) ----

export const PROJECT_SECTION_KINDS = [
  "context",
  "problem",
  "approach",
  "process",
  "system",
  "design",
  "result",
  "reflection",
] as const;

export const ProjectSectionSchema = z.object({
  kind: z.enum(PROJECT_SECTION_KINDS),
  heading: LocalizedTextSchema.optional(),
  body: z.array(LocalizedTextSchema).min(1),
  items: z.array(LocalizedTextSchema).optional(),
});

export const ProjectMediaSchema = z.object({
  type: z.literal("image"),
  src: ImageSrcSchema,
  alt: LocalizedTextSchema,
  caption: LocalizedTextSchema.optional(),
});

export const ProjectSchema = z
  .object({
    id: z.string().regex(/^p-\d{3}$/),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: LocalizedTextSchema,
    year: z.number().int().min(2000).max(2100),
    categories: z
      .array(ProjectCategorySchema)
      .min(1)
      .refine((list) => new Set(list).size === list.length, "unique"),
    role: LocalizedTextSchema,
    description: LocalizedTextSchema.refine(
      (text) => text.en.length <= 140,
      "description_too_long",
    ),
    featured: z.boolean(),
    services: z.array(LocalizedTextSchema),
    technologies: z.array(z.string().min(1)),
    cover: z
      .object({ src: ImageSrcSchema, alt: LocalizedTextSchema })
      .nullable(),
    media: z.array(ProjectMediaSchema),
    links: z.array(
      z.object({ label: LocalizedTextSchema, url: HttpsUrlSchema }),
    ),
    credits: z.array(
      z.object({ role: LocalizedTextSchema, name: z.string().min(1) }),
    ),
    sections: z
      .array(ProjectSectionSchema)
      .refine(
        (list) =>
          new Set(list.map((section) => section.kind)).size === list.length,
        "unique_section_kind",
      ),
    placeholder: z.boolean(),
  })
  .superRefine((project, ctx) => {
    if (!project.placeholder) return;
    if (!project.slug.startsWith("sample-")) {
      ctx.addIssue({ code: "custom", message: "placeholder_slug_prefix" });
    }
    if (!hasSamplePrefix(project.title)) {
      ctx.addIssue({ code: "custom", message: "placeholder_title_prefix" });
    }
    if (project.links.length > 0 || project.credits.length > 0) {
      ctx.addIssue({ code: "custom", message: "placeholder_links_credits" });
    }
    if (containsInventedMetric(project)) {
      ctx.addIssue({ code: "custom", message: "placeholder_invented_metric" });
    }
  });

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;
export type ProjectSectionKind = (typeof PROJECT_SECTION_KINDS)[number];

// ---- Recognition (IA §6.2) ----

export const RecognitionSchema = z
  .object({
    id: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
    event: LocalizedTextSchema,
    result: LocalizedTextSchema,
    category: ProjectCategorySchema,
    url: HttpsUrlSchema.nullable(),
    placeholder: z.boolean(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.placeholder) return;
    if (!hasSamplePrefix(entry.event)) {
      ctx.addIssue({ code: "custom", message: "placeholder_event_prefix" });
    }
    if (containsInventedMetric(entry)) {
      ctx.addIssue({ code: "custom", message: "placeholder_invented_metric" });
    }
  });

export type Recognition = z.infer<typeof RecognitionSchema>;

// ---- Writing (IA §6.3) ----

export const WRITING_KINDS = ["article", "thread", "post"] as const;

export const WritingEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(WRITING_KINDS),
    date: IsoDateSchema,
    title: LocalizedTextSchema,
    source: z.string().min(1),
    url: HttpsUrlSchema.nullable(),
    placeholder: z.boolean(),
  })
  .superRefine((entry, ctx) => {
    if (entry.url === null && !entry.placeholder) {
      ctx.addIssue({
        code: "custom",
        message: "url_required_unless_placeholder",
      });
    }
    if (entry.placeholder && !hasSamplePrefix(entry.title)) {
      ctx.addIssue({ code: "custom", message: "placeholder_title_prefix" });
    }
  });

export type WritingEntry = z.infer<typeof WritingEntrySchema>;
export type WritingKind = (typeof WRITING_KINDS)[number];

// ---- Capabilities (IA §6.4) ----

export const CapabilitySchema = z.object({
  id: z.enum(["software", "ai-creative", "interactive", "sound"]),
  index: z.enum(["01", "02", "03", "04"]),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  items: z.array(LocalizedTextSchema).min(3).max(5),
  categories: z.array(ProjectCategorySchema).min(1),
});

export type Capability = z.infer<typeof CapabilitySchema>;

// ---- Software services (IA §6.5) — never priced ----

const noPrice = (value: unknown) => !containsInventedMetric(value);

export const SoftwareServiceSchema = z
  .object({
    offerings: z
      .array(
        z.object({
          id: z.string().min(1),
          title: LocalizedTextSchema,
          description: LocalizedTextSchema,
        }),
      )
      .length(7),
    engagementModels: z
      .array(
        z.object({
          id: z.enum(["project-based", "custom-quote"]),
          label: z.string().min(1),
          title: LocalizedTextSchema,
          description: LocalizedTextSchema,
          price: LocalizedTextSchema,
        }),
      )
      .length(2),
    process: z.array(
      z.object({ index: z.string(), title: LocalizedTextSchema }),
    ),
    contact: z.object({
      email: z.string().email(),
      subject: LocalizedTextSchema,
      include: z.array(LocalizedTextSchema).min(1),
    }),
  })
  .refine(noPrice, "software_services_have_no_prices");

export type SoftwareServices = z.infer<typeof SoftwareServiceSchema>;
/** Alias matching the IA naming. */
export type SoftwareService = SoftwareServices;

// ---- About (IA §6.6) ----

const REAL_NAME = /楊子賢|Kevin Yang/;

export const AboutContentSchema = z
  .object({
    lede: LocalizedTextSchema,
    teaser: z.object({
      heading: LocalizedTextSchema,
      body: LocalizedTextSchema,
    }),
    sections: z
      .array(
        z.object({
          id: z.enum(["what", "think", "connect", "work"]),
          heading: LocalizedTextSchema,
          body: z.array(LocalizedTextSchema),
          items: z.array(LocalizedTextSchema).optional(),
        }),
      )
      .length(4),
  })
  .superRefine((about, ctx) => {
    if (localizedStrings(about).some((text) => REAL_NAME.test(text))) {
      ctx.addIssue({ code: "custom", message: "about_contains_real_name" });
    }
    const headings = [
      about.teaser.heading,
      ...about.sections.map((section) => section.heading),
    ];
    if (localizedStrings(headings).some((text) => text.includes("Kamel"))) {
      ctx.addIssue({ code: "custom", message: "about_heading_contains_kamel" });
    }
  });

export type AboutContent = z.infer<typeof AboutContentSchema>;
