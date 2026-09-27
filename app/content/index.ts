import type { Locale } from "../lib/i18n/locale";
import { PROJECTS } from "./projects";
import { RECOGNITION } from "./recognition";
import {
  CATEGORY_LABELS,
  type CategoryFilter,
  type LocalizedText,
  PROJECT_CATEGORIES,
  type Project,
  type ProjectCategory,
  type Recognition,
  type WritingEntry,
  type WritingKind,
} from "./schema";
import { WRITING } from "./writing";

export { ABOUT } from "./about";
export { CAPABILITIES } from "./capabilities";
export * from "./schema";
export { SOFTWARE_SERVICES } from "./software-services";
export { PROJECTS, RECOGNITION, WRITING };

/** Pick the locale's string. */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale];
}

// ---- Projects ----

export function listProjects({
  category,
  featured,
}: {
  category?: CategoryFilter;
  featured?: boolean;
} = {}): Project[] {
  return PROJECTS.filter(
    (project) =>
      (category === undefined ||
        category === "all" ||
        project.categories.includes(category)) &&
      (featured === undefined || project.featured === featured),
  );
}

export function getProject(slug: string): Project | null {
  return PROJECTS.find((project) => project.slug === slug) ?? null;
}

/** `?category=` → filter value. Unknown / missing values render "all" (IA §1). */
export function parseCategory(
  value: string | null | undefined,
): CategoryFilter {
  return (PROJECT_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as ProjectCategory)
    : "all";
}

// ---- Merged work list (D1 works + file projects), IA §4.2 ----

/** Structural subset of a D1 PublicContent "work" record. */
export interface D1WorkLike {
  slug: string;
  title: string;
  summary: string | null;
  publishedAt: string;
}

export interface WorkListItem {
  source: "d1" | "file";
  slug: string;
  title: string;
  description: string | null;
  role: string | null;
  year: number | null;
  categories: ProjectCategory[];
  placeholder: boolean;
  cover: { src: string; alt: string } | null;
  featured: boolean;
}

function yearOf(iso: string): number | null {
  const year = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * One sorted list: (1) real before placeholder; (2) year descending;
 * (3) source order preserved (D1 sort_order/published_at, file order);
 * (4) slug ascending. D1 works are `categories: ["music"]`, never placeholder.
 * A file project whose slug collides with a D1 work is dropped (D1 wins, as in
 * the detail loader).
 */
export function mergeWorks(
  d1Works: readonly D1WorkLike[],
  projects: readonly Project[],
  locale: Locale,
): WorkListItem[] {
  const d1Slugs = new Set(d1Works.map((work) => work.slug));
  const d1Items = d1Works.map<WorkListItem & { order: number }>(
    (work, order) => ({
      source: "d1",
      slug: work.slug,
      title: work.title,
      description: work.summary,
      role: null,
      year: yearOf(work.publishedAt),
      categories: ["music"],
      placeholder: false,
      cover: null,
      featured: false,
      order,
    }),
  );
  const fileItems = projects
    .filter((project) => !d1Slugs.has(project.slug))
    .map<WorkListItem & { order: number }>((project, order) => ({
      source: "file",
      slug: project.slug,
      title: project.title[locale],
      description: project.description[locale],
      role: project.role[locale],
      year: project.year,
      categories: [...project.categories],
      placeholder: project.placeholder,
      cover: project.cover
        ? { src: project.cover.src, alt: project.cover.alt[locale] }
        : null,
      featured: project.featured,
      order: d1Works.length + order,
    }));

  return [...d1Items, ...fileItems]
    .sort(
      (a, b) =>
        Number(a.placeholder) - Number(b.placeholder) ||
        (b.year ?? 0) - (a.year ?? 0) ||
        (a.source === b.source ? a.order - b.order : 0) ||
        a.slug.localeCompare(b.slug),
    )
    .map(({ order: _order, ...item }) => item);
}

export function filterByCategory(
  items: readonly WorkListItem[],
  category: CategoryFilter,
): WorkListItem[] {
  return category === "all"
    ? [...items]
    : items.filter((item) => item.categories.includes(category));
}

export interface CategoryFilterOption {
  value: CategoryFilter;
  label: string;
  count: number;
}

/** Filter-bar options in IA order with counts (`AI 02`); "all" first. */
export function filterCategories(
  items: readonly WorkListItem[],
  locale: Locale,
): CategoryFilterOption[] {
  const values: CategoryFilter[] = ["all", ...PROJECT_CATEGORIES];
  return values.map((value) => ({
    value,
    label: CATEGORY_LABELS[value][locale],
    count: filterByCategory(items, value).length,
  }));
}

export function categoryLabel(value: CategoryFilter, locale: Locale): string {
  return CATEGORY_LABELS[value][locale];
}

// ---- Recognition ----

/** Newest first. */
export function listRecognition(limit?: number): Recognition[] {
  const sorted = [...RECOGNITION].sort((a, b) => b.year - a.year);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

// ---- Writing (D1 posts + file entries), IA §4.8 ----

export interface D1PostLike {
  slug: string;
  title: string;
  publishedAt: string;
}

export interface WritingListItem {
  source: "d1" | "file";
  id: string;
  kind: WritingKind;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  sourceLabel: string;
  /** Internal path (D1) or external https URL (file); null = link pending. */
  href: string | null;
  external: boolean;
  placeholder: boolean;
}

/** Newest first by date; ties keep D1 first. */
export function mergeWriting(
  d1Posts: readonly D1PostLike[],
  entries: readonly WritingEntry[],
  locale: Locale,
): WritingListItem[] {
  const posts = d1Posts.map<WritingListItem>((post) => ({
    source: "d1",
    id: `d1-${post.slug}`,
    kind: "article",
    date: post.publishedAt.slice(0, 10),
    title: post.title,
    sourceLabel: "kamelkyp.com",
    href: `/${locale}/writing/${post.slug}`,
    external: false,
    placeholder: false,
  }));
  const files = entries.map<WritingListItem>((entry) => ({
    source: "file",
    id: entry.id,
    kind: entry.kind,
    date: entry.date,
    title: entry.title[locale],
    sourceLabel: entry.source,
    href: entry.url,
    external: entry.url !== null,
    placeholder: entry.placeholder,
  }));
  return [...posts, ...files].sort((a, b) => b.date.localeCompare(a.date));
}

/** `2026-09-01` → `2026.09.01` (metadata rows). */
export function formatMetaDate(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", ".");
}
