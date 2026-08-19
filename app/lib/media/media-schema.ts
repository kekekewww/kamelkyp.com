import { z } from "zod";

export const MediaKinds = [
  "youtube",
  "google_drive",
  "direct_audio",
  "github_raw_audio",
  "cloudflare_r2_audio",
  "external_link",
] as const;

export type MediaKind = (typeof MediaKinds)[number];

const httpsUrl = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    context.addIssue({
      code: "custom",
      message: "https_required",
    });
  }
});

export const MediaItemSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(MediaKinds),
    url: httpsUrl,
    title: z.string().trim().min(1).max(200),
    startSeconds: z.number().int().nonnegative().nullable(),
    endSeconds: z.number().int().positive().nullable(),
  })
  .refine(
    (item) =>
      item.startSeconds === null ||
      item.endSeconds === null ||
      item.endSeconds > item.startSeconds,
    { message: "invalid_preview_range" },
  );

export type MediaItem = z.infer<typeof MediaItemSchema>;
