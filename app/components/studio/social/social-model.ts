/**
 * Social links screen model (client-safe): platform names, default labels
 * for a new link, address hints and the footer group the public site shows.
 */
import type {
  SocialLink,
  SocialPlatform,
} from "../../../lib/cms/schemas/social-link";
import type { LocalizedText } from "../../../lib/cms/types";

export const SOCIAL_PLATFORM_OPTIONS: ReadonlyArray<{
  value: SocialPlatform;
  label: string;
}> = [
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
  { value: "github", label: "GitHub" },
  { value: "youtube", label: "YouTube" },
  { value: "spotify", label: "Spotify" },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "devpost", label: "Devpost" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
];

const NAME = Object.fromEntries(
  SOCIAL_PLATFORM_OPTIONS.map((option) => [option.value, option.label]),
) as Record<SocialPlatform, string>;

export function socialPlatformName(platform: string): string {
  return NAME[platform as SocialPlatform] ?? platform;
}

/** A starting label when the owner picks a platform (both still editable). */
export function defaultSocialLabel(platform: string): LocalizedText {
  if (platform === "email") return { zh: "電子郵件", en: "Email" };
  if (platform === "other") return { zh: "", en: "" };
  const name = socialPlatformName(platform);
  return { zh: name, en: name };
}

export function socialUrlPlaceholder(platform: string): string {
  switch (platform) {
    case "email":
      return "name@example.com";
    case "threads":
      return "https://www.threads.net/@…";
    case "instagram":
      return "https://www.instagram.com/…";
    case "github":
      return "https://github.com/…";
    case "youtube":
      return "https://www.youtube.com/@…";
    default:
      return "https://";
  }
}

/** What the footer's "Find me / 社群" group shows: enabled links, in order. */
export function footerLinks(
  links: readonly SocialLink[],
  locale: "zh" | "en",
): Array<{ id: string; label: string; url: string }> {
  return links
    .filter((link) => link.enabled)
    .map((link) => ({
      id: link.id,
      label: link.label[locale].trim(),
      url: link.url,
    }));
}
