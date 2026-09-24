import type { ServiceId } from "./service-id";

export interface LocalizedText {
  zh: string;
  en: string;
}

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
  /**
   * @deprecated Internal label for the legacy `/admin` screens only (never
   * rendered publicly); removed together with `app/routes/admin/**`.
   */
  name: LocalizedText;
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  {
    id: "full_mix",
    category: "mixing",
    slug: "full",
    name: { zh: "完整歌曲混音", en: "Full Song Mixing" },
  },
  {
    id: "vocal_mix",
    category: "mixing",
    slug: "vocal",
    name: { zh: "Vocal 混音", en: "Vocal Mixing" },
  },
  {
    id: "simple_transition",
    category: "song_transition",
    slug: "simple",
    name: { zh: "單純歌曲銜接", en: "Simple Song Transition" },
  },
  {
    id: "edit_transition",
    category: "song_transition",
    slug: "edit",
    name: { zh: "編輯／剪輯歌曲銜接", en: "Edited Song Transition" },
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
