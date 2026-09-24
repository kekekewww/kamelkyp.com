/**
 * View-model fixtures for public component and meta unit tests. Values mirror
 * the seeded brand/site settings (0006) closely enough to render real markup;
 * titles say "Fixture", never "Sample:", and contain no personal names.
 */

import { DEFAULT_MEDIA_CONFIG } from "../../app/lib/cms/media/urls";
import type {
  PublicBrand,
  PublicImage,
  PublicProjectCard,
  PublicRecognitionItem,
  PublicSite,
  PublicSiteContext,
  PublicWritingItem,
} from "../../app/lib/cms/public/view-models";

export function fixtureBrand(
  overrides: Partial<PublicBrand> = {},
): PublicBrand {
  return {
    brandName: "Kamel",
    tagline: "Sound, Software & Interactive Work",
    roles: ["Music Producer", "Software Developer", "Creative Technologist"],
    heroStatement: "Building systems, sound, and interactive experiences.",
    heroSubtext: "",
    primaryCta: { label: "Start a project", href: "/en/commission" },
    secondaryCta: { label: "View work", href: "/en/works" },
    shortBio: "Writing code and mixing use the same ears.",
    longBio: [{ type: "paragraph", text: "I build systems and I make sound." }],
    aboutSections: [
      {
        key: "what",
        heading: "What I make",
        body: [{ type: "paragraph", text: "Software, sound and interaction." }],
      },
      {
        key: "work",
        heading: "How I work",
        body: [{ type: "list", items: ["Brief first.", "Show early."] }],
      },
    ],
    capabilities: [
      {
        key: "software",
        index: "01",
        title: "Software Systems",
        description: "Websites, internal tools and maintainable systems.",
        items: ["Web development", "Internal systems", "Custom software"],
        categories: [
          {
            id: "term-project_category-software",
            slug: "software",
            label: "Software",
          },
        ],
      },
    ],
    locationDisplay: "Taiwan / Remote",
    contactEmail: "hello@example.com",
    portrait: null,
    logo: null,
    favicon: null,
    ...overrides,
  };
}

export function fixtureSite(overrides: Partial<PublicSite> = {}): PublicSite {
  return {
    siteTitle: "Kamel — Sound, Software & Interactive Work",
    siteDescription: "Kamel's work and services.",
    seoDescription: "Kamel's work and services: mixing and software.",
    ogImage: null,
    defaultSocialImage: null,
    footerMessage: "Tell me what you want to make.",
    copyright: "© 2026 Kamel",
    availability: { status: "unspecified", message: "" },
    homepage: {
      sections: {
        showreel: true,
        selectedWork: true,
        capabilities: true,
        recognition: true,
        services: true,
        pricing: true,
        about: true,
        writing: true,
        contact: true,
      },
      featuredProjectCount: 4,
      writingCount: 3,
      recognitionCount: 3,
      contactBandBody: "Mixing can be commissioned online.",
    },
    serviceAreas: [
      {
        key: "mixing",
        name: "Mixing",
        summary: "Full-song or vocal mixing.",
        linkLabel: "View mixing",
      },
      {
        key: "song_transition",
        name: "Song Transition",
        summary: "Transitions for dance and events.",
        linkLabel: "View song transition",
      },
      {
        key: "software",
        name: "Software & Interactive",
        summary: "Websites and prototypes.",
        linkLabel: "View software & interactive",
      },
    ],
    servicesPage: { process: ["Brief", "Quote & confirm"] },
    softwarePage: {
      engagementModels: [],
      process: [],
      inquiry: { subject: "Project inquiry", include: [] },
    },
    contactBand: {
      default: "Have a project in mind?",
      project: "Want something like this?",
      work: "Don't see something similar? Let's talk.",
    },
    ...overrides,
  };
}

export function fixtureSiteContext(
  overrides: Partial<PublicSiteContext> = {},
): PublicSiteContext {
  return {
    locale: "en",
    brand: fixtureBrand(),
    site: fixtureSite(),
    navigation: [
      { key: "work", visible: true },
      { key: "services", visible: true },
      { key: "about", visible: true },
      { key: "writing", visible: true },
    ],
    footerGroups: [],
    socialLinks: [],
    mediaConfig: DEFAULT_MEDIA_CONFIG,
    ...overrides,
  };
}

export function fixtureImage(
  overrides: Partial<PublicImage> = {},
): PublicImage {
  return {
    assetId: "asset-cover",
    src: "https://images.example.com/cover.jpg",
    alt: "Fixture cover",
    focalClass: "focal-x-50 focal-y-25",
    ...overrides,
  };
}

export function fixtureProject(
  overrides: Partial<PublicProjectCard> = {},
): PublicProjectCard {
  const slug = overrides.slug ?? "fixture-project";
  return {
    id: `id-${slug}`,
    slug,
    href: `/en/works/${slug}`,
    title: "Fixture Project",
    year: 2026,
    role: "Developer",
    shortDescription: "A fixture project.",
    primaryCategory: {
      id: "term-project_category-ai",
      slug: "ai",
      label: "AI",
    },
    categories: [{ id: "term-project_category-ai", slug: "ai", label: "AI" }],
    cover: null,
    featured: true,
    todoContent: false,
    ...overrides,
  };
}

export function fixtureRecognition(
  overrides: Partial<PublicRecognitionItem> = {},
): PublicRecognitionItem {
  return {
    id: "recognition-1",
    year: 2026,
    date: "2026-05-01",
    type: { slug: "award", label: "Award" },
    discipline: null,
    organization: "Fixture Org",
    event: "Fixture Festival",
    result: "Finalist",
    description: [],
    url: null,
    image: null,
    featured: false,
    todoContent: false,
    ...overrides,
  };
}

export function fixtureWriting(
  overrides: Partial<PublicWritingItem> = {},
): PublicWritingItem {
  return {
    id: "writing-1",
    slug: "fixture-note",
    title: "Fixture Note",
    date: "2026-06-01",
    platform: "internal",
    platformLabel: null,
    excerpt: "",
    category: null,
    href: "/en/writing/fixture-note",
    external: false,
    hasDetail: true,
    cover: null,
    featured: false,
    todoContent: false,
    ...overrides,
  };
}
