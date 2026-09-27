/**
 * Writing row labels (UI copy, not content): the Latin kind code in the meta
 * row and the source name shown under the title / in "Read on …".
 */
import type { PublicWritingItem } from "../../lib/cms/public/view-models";

const KIND: Record<PublicWritingItem["platform"], string> = {
  internal: "ARTICLE",
  medium: "ARTICLE",
  threads: "THREAD",
  instagram: "POST",
  devpost: "PROJECT",
  other: "LINK",
};

const SOURCE: Record<PublicWritingItem["platform"], string> = {
  internal: "kamelkyp.com",
  medium: "Medium",
  threads: "Threads",
  instagram: "Instagram",
  devpost: "Devpost",
  other: "Link",
};

export function writingKind(item: Pick<PublicWritingItem, "platform">): string {
  return KIND[item.platform];
}

export function writingSource(
  item: Pick<PublicWritingItem, "platform" | "platformLabel">,
): string {
  if (item.platform === "other" && item.platformLabel?.trim()) {
    return item.platformLabel.trim();
  }
  return SOURCE[item.platform];
}

/** `2026-09-01` → `2026.09.01` (metadata rows). */
export function formatMetaDate(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", ".");
}
