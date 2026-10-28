import type { ServiceId } from "./service-id";

/**
 * Commission service structure (content-architecture §3.5): id, category and
 * the slug of its fixed public route. Names, copy and deliverables live in the
 * `services` rows (Content Studio); the displayed price is always the active
 * `price_versions` rule, the one the wizard locks into a case.
 */
export interface ServiceDefinition {
  id: ServiceId;
  category: "mixing" | "song_transition";
  slug: string;
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  {
    id: "full_mix",
    category: "mixing",
    slug: "full",
  },
  {
    id: "vocal_mix",
    category: "mixing",
    slug: "vocal",
  },
  {
    id: "simple_transition",
    category: "song_transition",
    slug: "simple",
  },
  {
    id: "edit_transition",
    category: "song_transition",
    slug: "edit",
  },
] as const;

const CATEGORY_PATHS: Record<ServiceDefinition["category"], string> = {
  mixing: "/mixing",
  song_transition: "/song-transition",
};

export function getCategoryServices(
  category: ServiceDefinition["category"],
): readonly ServiceDefinition[] {
  return SERVICE_CATALOG.filter((service) => service.category === category);
}

export function getService(id: ServiceId): ServiceDefinition {
  const service = SERVICE_CATALOG.find((item) => item.id === id);
  if (!service) throw new Error("service_not_found");
  return service;
}

/** Locale-less path of a commission service's marketing page. */
export function commissionServicePath(id: ServiceId): string {
  const service = getService(id);
  return `${CATEGORY_PATHS[service.category]}/${service.slug}`;
}

/** Locale-less path of a category's service chooser. */
export function categoryPath(category: ServiceDefinition["category"]): string {
  return CATEGORY_PATHS[category];
}
