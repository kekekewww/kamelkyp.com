/**
 * Public view models (client-safe, content-schema §5.4). Everything here is
 * already localized for one locale: components receive props, never content
 * records. Empty collections are valid; sections hide themselves.
 */
import type { ContentBlock } from "../../content/block-schema";
import type { MediaItem } from "../../media/media-schema";
import type { MediaConfig } from "../media/urls";
import type { MediaAsset } from "../schemas/media-asset";
import type { PriceMode } from "../schemas/service";
import type {
  HomepageSection,
  NavKey,
  ServiceAreaKey,
} from "../schemas/site-settings";
import type { Term } from "../schemas/taxonomy";
import type { WritingPlatform } from "../schemas/writing";
import type { FormattedBlock } from "../text-format";
import type { Locale } from "../types";

export type ReadMode = "published" | "preview";

/** Same shape as the existing footer `FooterGroup` (structurally compatible). */
export interface FooterGroup {
  id: string;
  label: string;
  links: Array<{ id: string; label: string; url: string }>;
}

/** Facts the view builders need besides the content itself. */
export interface ViewContext {
  mediaConfig: MediaConfig;
  assets: ReadonlyMap<string, MediaAsset>;
  terms: ReadonlyMap<string, Term>;
  mode: ReadMode;
}

/** Row facts that are not part of the snapshot. */
export interface EntryFacts {
  id: string;
  featured: boolean;
  todoContent: boolean;
  publishedAt: string | null;
}

export interface PublicImage {
  assetId: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  alt: string;
  /** `focal-x-50 focal-y-25` (object-position via CSS, no inline style). */
  focalClass: string;
}

export interface PublicTermRef {
  id: string;
  slug: string;
  label: string;
}

export interface PublicProjectCard {
  id: string;
  slug: string;
  href: string;
  title: string;
  year: number | null;
  role: string;
  shortDescription: string;
  primaryCategory: PublicTermRef | null;
  categories: PublicTermRef[];
  cover: PublicImage | null;
  featured: boolean;
  /** Preview only: seeded sample content (PLACEHOLDER badge). */
  todoContent: boolean;
}

export interface PublicStorySection {
  key: string;
  blocks: FormattedBlock[];
}

export interface PublicProjectDetail extends PublicProjectCard {
  description: FormattedBlock[];
  tools: string[];
  technologies: string[];
  coverVideo: MediaItem | null;
  gallery: Array<{ image: PublicImage; caption: string }>;
  links: Array<{ label: string; url: string }>;
  credits: Array<{ role: string; name: string }>;
  story: PublicStorySection[];
  body: ContentBlock[];
  bodyMedia: MediaItem[];
  seo: { title: string; description: string };
  socialImage: PublicImage | null;
  publishedAt: string | null;
}

export interface PublicMusicItem {
  id: string;
  title: string;
  artist: string;
  role: string;
  genre: string;
  year: number | null;
  description: FormattedBlock[];
  artwork: PublicImage | null;
  media: MediaItem | null;
  durationMs: number | null;
  links: {
    spotify: string | null;
    youtube: string | null;
    soundcloud: string | null;
    other: Array<{ label: string; url: string }>;
  };
  credits: Array<{ role: string; name: string }>;
}

export interface PublicRecognitionItem {
  id: string;
  year: number | null;
  date: string | null;
  type: { slug: string; label: string } | null;
  discipline: { slug: string; label: string } | null;
  organization: string;
  event: string;
  result: string;
  description: FormattedBlock[];
  url: string | null;
  image: PublicImage | null;
  featured: boolean;
  todoContent: boolean;
}

export interface PublicWritingItem {
  id: string;
  slug: string;
  title: string;
  date: string | null;
  platform: WritingPlatform;
  platformLabel: string | null;
  excerpt: string;
  category: { slug: string; label: string } | null;
  /** Internal detail path, or the external URL for link-out entries. */
  href: string | null;
  external: boolean;
  hasDetail: boolean;
  cover: PublicImage | null;
  featured: boolean;
  todoContent: boolean;
}

export interface PublicWritingDetail extends PublicWritingItem {
  content: ContentBlock[];
  media: MediaItem[];
  seo: { title: string; description: string };
  socialImage: PublicImage | null;
  publishedAt: string | null;
}

export interface PublicServiceItem {
  id: string;
  slug: string;
  commissionServiceId: string | null;
  area: ServiceAreaKey | null;
  group: { slug: string; label: string } | null;
  name: string;
  shortDescription: string;
  description: FormattedBlock[];
  priceMode: PriceMode;
  /** Commission rows: the active price_versions base (TWD). Never invented. */
  price: { amount: number; currency: "TWD" | "USD" } | null;
  turnaround: string;
  revisions: string;
  deliverables: string[];
  requirements: string[];
  process: Array<{ title: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
  inquirySubject: string;
  featured: boolean;
  todoContent: boolean;
}

export interface CategoryFilterOption {
  id: string;
  slug: string;
  label: string;
  count: number;
}

export interface PublicCta {
  label: string;
  href: string;
}

export interface PublicBrand {
  brandName: string;
  tagline: string;
  roles: string[];
  heroStatement: string;
  heroSubtext: string;
  primaryCta: PublicCta | null;
  secondaryCta: PublicCta | null;
  shortBio: string;
  longBio: FormattedBlock[];
  aboutSections: Array<{
    key: string;
    heading: string;
    body: FormattedBlock[];
  }>;
  capabilities: Array<{
    key: string;
    index: string;
    title: string;
    description: string;
    items: string[];
    categories: PublicTermRef[];
  }>;
  locationDisplay: string;
  contactEmail: string;
  portrait: PublicImage | null;
  logo: PublicImage | null;
  favicon: { src: string; type: string } | null;
}

export interface PublicSite {
  siteTitle: string;
  siteDescription: string;
  seoDescription: string;
  ogImage: PublicImage | null;
  defaultSocialImage: PublicImage | null;
  footerMessage: string;
  copyright: string;
  availability: {
    status: "unspecified" | "available" | "limited" | "unavailable";
    message: string;
  };
  homepage: {
    sections: Record<HomepageSection, boolean>;
    featuredProjectCount: number;
    writingCount: number;
    recognitionCount: number;
    contactBandBody: string;
  };
  serviceAreas: Array<{
    key: ServiceAreaKey;
    name: string;
    summary: string;
    linkLabel: string;
  }>;
  servicesPage: { process: string[] };
  softwarePage: {
    engagementModels: Array<{
      key: string;
      label: string;
      title: string;
      description: string;
      priceNote: string;
    }>;
    process: string[];
    inquiry: { subject: string; include: string[] };
  };
  contactBand: { default: string; project: string; work: string };
}

export interface PublicSiteContext {
  locale: Locale;
  brand: PublicBrand;
  site: PublicSite;
  navigation: Array<{ key: NavKey; visible: boolean }>;
  footerGroups: FooterGroup[];
  socialLinks: Array<{
    id: string;
    platform: string;
    label: string;
    url: string;
    username: string | null;
  }>;
  mediaConfig: MediaConfig;
}

export type DetailResult<K extends string, T> =
  | ({ kind: "found" } & { [key in K]: T })
  | { kind: "redirect"; to: string }
  | { kind: "missing" };
