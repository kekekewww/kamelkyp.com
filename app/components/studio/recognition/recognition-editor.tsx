/**
 * Recognition editor (admin-architecture §4.4 section map): BASIC event,
 * organization, result, type, year, date · DETAILS description, URL, image,
 * discipline, related project · PUBLICATION.
 */
import { studioLabel } from "../../../lib/cms/localized";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { RecognitionContent } from "../../../lib/cms/schemas/recognition";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type {
  EntityMeta,
  EntryStatus,
  ValidationIssue,
} from "../../../lib/cms/types";
import {
  DateInput,
  EditorSection,
  IntentButton,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  NumberInput,
  PublicationPanel,
  Select,
  TermSelect,
  TextInput,
  ValidationChecklist,
} from "../ui";
import { EntryEditorFrame } from "./kit/editor-frame";
import { TermField } from "./kit/term-field";
import {
  RECOGNITION_SECTIONS,
  recognitionIssues,
  recognitionSectionOf,
  yearFromDate,
} from "./recognition-form";

export type RecognitionEditorData = {
  meta: EntityMeta;
  content: RecognitionContent;
  issues: ValidationIssue[];
  types: Term[];
  disciplines: Term[];
  projects: Array<{ id: string; label: string; status: EntryStatus }>;
  assets: MediaSummary[];
  previewPath: string;
};

const BASE = "/studio/recognition";

export function RecognitionEditor({
  data,
  onReset,
}: {
  data: RecognitionEditorData;
  onReset: () => void;
}) {
  const { meta, content } = data;
  const title = studioLabel(content.event, "Untitled recognition");
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]));

  return (
    <EntryEditorFrame
      type="recognition"
      typeLabel="Recognition"
      listHref={BASE}
      meta={meta}
      title={title}
      sections={RECOGNITION_SECTIONS}
      defaultOpen={["basic", "details", "publication"]}
      serverIssues={data.issues}
      computeIssues={recognitionIssues}
      sectionOf={recognitionSectionOf}
      previewPath={data.previewPath}
      onReset={onReset}
      onFieldInput={(event) => {
        // A date fills an empty year (the year groups the public list).
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.name !== "date") {
          return;
        }
        const year = target.form?.elements.namedItem("year:number");
        const value = yearFromDate(target.value);
        if (year instanceof HTMLInputElement && !year.value && value) {
          year.value = String(value);
        }
      }}
    >
      {(editor) => (
        <>
          <EditorSection {...editor.section("basic")}>
            <LocalizedTextField
              name="event"
              label="Event"
              required
              maxLength={200}
              defaultValue={content.event}
              hint="The award, publication, talk or event, e.g. “Golden Pin Design Award”."
              errors={{
                zh: editor.fieldError("event", "zh"),
                en: editor.fieldError("event", "en"),
              }}
            />
            <LocalizedTextField
              name="organization"
              label="Organization"
              sameInBoth
              maxLength={200}
              defaultValue={content.organization}
              hint="Who gave or hosted it."
            />
            <LocalizedTextField
              name="result"
              label="Result"
              maxLength={200}
              defaultValue={content.result}
              hint="e.g. Gold, Finalist, Speaker, Published."
            />
            <div className="p3-fields-row">
              <TermField
                name="typeTermId"
                label="Type"
                required
                vocabulary="recognition_type"
                addLabel="Add type"
                terms={data.types}
                defaultValue={content.typeTermId}
                placeholder="Choose a type"
                error={editor.fieldError("typeTermId")}
                onChange={editor.notifyChange}
              />
              <NumberInput
                name="year"
                label="Year"
                required
                min={1990}
                max={2100}
                defaultValue={content.year}
                error={editor.fieldError("year")}
              />
              <DateInput
                name="date"
                label="Date"
                defaultValue={content.date}
                hint="Optional. Orders entries within a year."
                error={editor.fieldError("date")}
              />
            </div>
          </EditorSection>

          <EditorSection {...editor.section("details")}>
            <LocalizedTextArea
              name="description"
              label="Description"
              rows={5}
              maxLength={4000}
              defaultValue={content.description}
              hint="Paragraphs; start a line with “- ” for a list."
            />
            <TextInput
              name="url"
              label="Link"
              type="url"
              inputMode="url"
              placeholder="https://"
              defaultValue={content.url ?? ""}
              hint="A page about this recognition (https only)."
              error={editor.fieldError("url")}
            />
            <MediaField
              key={`image-${editor.restoreEpoch}`}
              name="imageId"
              label="Image"
              kind="image"
              value={
                assets.get(
                  editor.restored("imageId") ?? content.imageId ?? "",
                ) ?? null
              }
              hint="Optional. Images need ZH and EN alt text before publishing."
              error={editor.fieldError("imageId")}
              onChange={editor.notifyChange}
            />
            <div className="p3-fields-row">
              <TermSelect
                name="disciplineTermId"
                label="Discipline"
                terms={data.disciplines}
                defaultValue={content.disciplineTermId}
                hint="The practice it belongs to."
              />
              <Select
                name="projectId"
                label="Related project"
                placeholder="None"
                defaultValue={content.projectId ?? ""}
                options={data.projects.map((project) => ({
                  value: project.id,
                  label:
                    project.status === "published"
                      ? project.label
                      : `${project.label} (${project.status})`,
                }))}
              />
            </div>
          </EditorSection>

          <EditorSection {...editor.section("publication")}>
            <ValidationChecklist issues={editor.issues} />
            <PublicationPanel
              meta={meta}
              issues={editor.issues}
              previewUrl={`${data.previewPath}?locale=zh`}
              pendingIntent={editor.pendingIntent}
            />
            {meta.status !== "archived" ? (
              <div className="p3-feature">
                <IntentButton
                  intent={meta.featured ? "unfeature" : "feature"}
                  variant="ghost"
                  compact
                  pending={
                    editor.pendingIntent === "feature" ||
                    editor.pendingIntent === "unfeature"
                  }
                  pendingLabel="Updating…"
                >
                  {meta.featured
                    ? "Remove from homepage"
                    : "Feature on homepage"}
                </IntentButton>
                <p className="studio-hint">
                  Live at once. Featured recognition leads the homepage list;
                  its order is set in Homepage.
                </p>
              </div>
            ) : null}
          </EditorSection>
        </>
      )}
    </EntryEditorFrame>
  );
}
