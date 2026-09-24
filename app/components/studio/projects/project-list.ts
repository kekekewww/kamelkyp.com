/**
 * Projects list query model (client-safe). Filters live in the URL so a
 * filtered view is linkable and survives reload (admin-architecture §4.3).
 */
import type { EntryStatus } from "../../../lib/cms/types";

export type ProjectStatusFilter = EntryStatus | "active" | "all";
export type ProjectSort = "order" | "updated" | "year";

export interface ProjectListQuery {
  /** Search across titles and metadata, both locales. */
  q: string;
  status: ProjectStatusFilter;
  categoryId: string | null;
  year: number | null;
  /** true = featured only, false = not featured, null = either. */
  featured: boolean | null;
  sort: ProjectSort;
}

const STATUSES = new Set<ProjectStatusFilter>([
  "active",
  "draft",
  "published",
  "archived",
  "all",
]);
const SORTS = new Set<ProjectSort>(["order", "updated", "year"]);
const Q_MAX = 200;

export function parseProjectListParams(
  params: URLSearchParams,
): ProjectListQuery {
  const status = params.get("status") as ProjectStatusFilter | null;
  const sort = params.get("sort") as ProjectSort | null;
  const yearText = params.get("year") ?? "";
  const year = /^[0-9]{4}$/.test(yearText) ? Number(yearText) : null;
  const featured = params.get("featured");
  const category = params.get("category")?.trim() ?? "";
  return {
    q: (params.get("q") ?? "").trim().slice(0, Q_MAX),
    status: status && STATUSES.has(status) ? status : "active",
    categoryId: category && category.length <= 100 ? category : null,
    year: year !== null && year >= 1990 && year <= 2100 ? year : null,
    featured: featured === "1" ? true : featured === "0" ? false : null,
    sort: sort && SORTS.has(sort) ? sort : "order",
  };
}

/** Search or any filter narrows the list (sort alone does not). */
export function hasActiveFilters(query: ProjectListQuery): boolean {
  return (
    query.q !== "" ||
    query.status !== "active" ||
    query.categoryId !== null ||
    query.year !== null ||
    query.featured !== null
  );
}

/** Reordering needs the whole active list in manual order. */
export function isManualOrder(query: ProjectListQuery): boolean {
  return query.sort === "order" && !hasActiveFilters(query);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function relativeTime(iso: string, nowIso: string): string {
  const seconds = Math.max(0, (Date.parse(nowIso) - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return iso.slice(0, 10);
}
