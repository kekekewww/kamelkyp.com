import { z } from "zod";
import { ContentBlocksSchema } from "../content/block-schema";
import { SeoFieldsSchema } from "./content-service.server";

const SaveContentFormSchema = z.object({
  versionId: z.string().uuid(),
  expectedRevision: z.coerce.number().int().nonnegative(),
  blocksJson: z.string().transform((value, context) => {
    try {
      return ContentBlocksSchema.parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "invalid_blocks" });
      return z.NEVER;
    }
  }),
  title: z.string().max(300),
  summary: z.string().max(8000),
  seoTitle: z.string().max(300),
  seoDescription: z.string().max(8000),
  socialImageUrl: z.string().max(2000),
});

function nullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function parseSaveContentForm(formData: FormData) {
  const parsed = SaveContentFormSchema.parse(Object.fromEntries(formData));
  return {
    versionId: parsed.versionId,
    expectedRevision: parsed.expectedRevision,
    blocks: parsed.blocksJson,
    seo: SeoFieldsSchema.parse({
      title: parsed.title,
      summary: nullable(parsed.summary),
      seoTitle: nullable(parsed.seoTitle),
      seoDescription: nullable(parsed.seoDescription),
      socialImageUrl: nullable(parsed.socialImageUrl),
    }),
  };
}
