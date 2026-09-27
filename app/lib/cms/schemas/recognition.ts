/**
 * Recognition model (content-schema §2.4, §4). Client-safe.
 */
import { z } from "zod";
import type { AssetRef, LocalizedText } from "../types";
import {
  AssetRefDraft,
  IdDraft,
  IsoDateDraft,
  json,
  localizedText,
  StoredNullableInt,
  StoredNullableString,
  StoredTextSchema,
  UrlDraft,
  YearDraft,
} from "./common";

export type RecognitionContent = {
  typeTermId: string | null;
  disciplineTermId: string | null;
  projectId: string | null;
  year: number | null;
  date: string | null;
  organization: LocalizedText;
  event: LocalizedText;
  result: LocalizedText;
  description: LocalizedText;
  url: string | null;
  imageId: AssetRef | null;
};

export const RecognitionDraftSchema = z
  .object({
    typeTermId: IdDraft,
    disciplineTermId: IdDraft,
    projectId: IdDraft,
    year: YearDraft,
    date: IsoDateDraft,
    organization: localizedText(200),
    event: localizedText(200),
    result: localizedText(200),
    description: localizedText(4000),
    url: UrlDraft,
    imageId: AssetRefDraft,
  })
  .transform((value): RecognitionContent => value);

export const RecognitionSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    core: z.object({
      type_term_id: StoredNullableString,
      discipline_term_id: StoredNullableString,
      project_id: StoredNullableString,
      year: StoredNullableInt,
      date: StoredNullableString,
      organization_i18n: StoredTextSchema,
      event_i18n: StoredTextSchema,
      result_i18n: StoredTextSchema,
      description_i18n: StoredTextSchema,
      url: StoredNullableString,
      image_id: StoredNullableString,
    }),
  })
  .transform(
    ({ core }): RecognitionContent => ({
      typeTermId: core.type_term_id,
      disciplineTermId: core.discipline_term_id,
      projectId: core.project_id,
      year: core.year,
      date: core.date,
      organization: core.organization_i18n,
      event: core.event_i18n,
      result: core.result_i18n,
      description: core.description_i18n,
      url: core.url,
      imageId: core.image_id,
    }),
  );

export function recognitionContentToColumns(
  content: RecognitionContent,
): Record<string, string | number | null> {
  return {
    type_term_id: content.typeTermId,
    discipline_term_id: content.disciplineTermId,
    project_id: content.projectId,
    year: content.year,
    date: content.date,
    organization_i18n: json(content.organization),
    event_i18n: json(content.event),
    result_i18n: json(content.result),
    description_i18n: json(content.description),
    url: content.url,
    image_id: content.imageId,
  };
}
