/**
 * Social link (content-schema §2.7). No draft state: enabled = public.
 * Client-safe.
 */
import { z } from "zod";
import type { LocalizedText } from "../types";

export const SOCIAL_PLATFORMS = [
  "threads",
  "instagram",
  "github",
  "youtube",
  "spotify",
  "soundcloud",
  "linkedin",
  "devpost",
  "email",
  "other",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialLink = {
  id: string;
  platform: SocialPlatform;
  label: LocalizedText;
  url: string;
  username: string | null;
  icon: string | null;
  enabled: boolean;
  sortOrder: number;
};

const required = (max: number) => z.string().trim().min(1).max(max);

/** Save validation (every field checked on save). */
export const SocialLinkInputSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(SOCIAL_PLATFORMS),
  label: z.object({ zh: required(80), en: required(80) }),
  url: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        if (url.protocol === "mailto:") return url.pathname.includes("@");
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "url_invalid"),
  username: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
  icon: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
  enabled: z.boolean().default(true),
});

export type SocialLinkInput = z.input<typeof SocialLinkInputSchema>;
