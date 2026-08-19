import { z } from "zod";

const HttpsUrl = z.url().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "https_required");

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().min(1).max(180),
  }),
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1).max(8000),
  }),
  z.object({
    type: z.literal("list"),
    style: z.enum(["unordered", "ordered"]),
    items: z
      .array(z.string().min(1).max(1000))
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items).size === items.length,
        "duplicate_items",
      ),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1).max(2000),
    attribution: z.string().max(200).nullable(),
  }),
  z.object({
    type: z.literal("external_image"),
    url: HttpsUrl,
    alt: z.string().min(1).max(300),
    caption: z.string().max(500).nullable(),
  }),
  z.object({
    type: z.literal("external_link"),
    url: HttpsUrl,
    label: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("media"),
    mediaId: z.string().min(1).max(100),
  }),
  z.object({ type: z.literal("divider") }),
]);

export const ContentBlocksSchema = z.array(ContentBlockSchema).max(300);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
