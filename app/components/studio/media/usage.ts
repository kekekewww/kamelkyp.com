/**
 * Usage references in Studio words (client-safe): where an asset is used,
 * which field, and the link to fix it (content-architecture §4.7).
 */
import type { MediaUsage } from "../../../lib/cms/schemas/media-asset";

const TYPE_LABEL: Record<MediaUsage["entityType"], string> = {
  project: "Project",
  music: "Music",
  recognition: "Recognition",
  writing: "Writing",
  service: "Service",
  brand_settings: "Settings",
  site_settings: "Settings",
};

const FIELD_LABEL: Record<string, string> = {
  coverImageId: "Cover image",
  coverVideoId: "Cover video",
  socialImageId: "Social image",
  gallery: "Gallery",
  artworkId: "Artwork",
  audioPreviewId: "Preview audio",
  fullAudioId: "Full audio",
  imageId: "Image",
  portraitId: "Portrait",
  logoId: "Logo",
  faviconId: "Favicon",
  brandAssetIds: "Brand assets",
  ogImageId: "OpenGraph image",
  defaultSocialImageId: "Default social image",
};

export function usageTypeLabel(usage: Pick<MediaUsage, "entityType">): string {
  return TYPE_LABEL[usage.entityType] ?? "Entry";
}

/** `body.zh` → "Content blocks (ZH)", known ids → their field names. */
export function usageFieldLabel(field: string): string {
  const known = FIELD_LABEL[field];
  if (known) return known;
  const block = /^(body|content)\.(zh|en)$/.exec(field);
  if (block) return `Content blocks (${block[2]?.toUpperCase()})`;
  return field;
}

export function usageHref(
  usage: Pick<MediaUsage, "entityType" | "entityId">,
): string {
  switch (usage.entityType) {
    case "project":
      return `/studio/projects/${usage.entityId}`;
    case "music":
      return `/studio/music/${usage.entityId}`;
    case "recognition":
      return `/studio/recognition/${usage.entityId}`;
    case "writing":
      return `/studio/writing/${usage.entityId}`;
    case "service":
      return `/studio/services/${usage.entityId}`;
    case "brand_settings":
      return "/studio/settings/brand";
    case "site_settings":
      return "/studio/settings/site";
  }
}

export interface UsageGroup {
  key: string;
  usage: MediaUsage;
  fields: string[];
  /** Used by live content (blocks deletion). */
  live: boolean;
}

/** One row per entry: its fields, and whether any use is live. */
export function groupUsages(usages: readonly MediaUsage[]): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  for (const usage of usages) {
    const key = `${usage.entityType}|${usage.entityId}`;
    const group = groups.get(key) ?? {
      key,
      usage,
      fields: [],
      live: false,
    };
    const label = usageFieldLabel(usage.field);
    if (!group.fields.includes(label)) group.fields.push(label);
    if (usage.scope === "published") group.live = true;
    groups.set(key, group);
  }
  return [...groups.values()];
}
