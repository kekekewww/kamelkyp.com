/**
 * The seven project editor sections (admin-architecture §4.4): BASIC, MEDIA,
 * CLASSIFICATION, CASE STUDY, LINKS, CREDITS, PUBLICATION. Uncontrolled
 * fields named per `app/lib/cms/forms.ts`; the editor owns state and submit.
 */
import { useState } from "react";
import { Link } from "react-router";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import {
  type ProjectContent,
  STORY_KEYS,
  type StoryKey,
} from "../../../lib/cms/schemas/project";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type {
  EntityMeta,
  LocalizedText,
  ValidationIssue,
} from "../../../lib/cms/types";
import {
  Checkbox,
  EditorSection,
  ListEditor,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  MediaListField,
  NumberInput,
  PublicationPanel,
  SlugField,
  StatusBadge,
  TagInput,
  TermMultiSelect,
  TermSelect,
  TextInput,
  ValidationChecklist,
} from "../ui";
import { FeatureToggle } from "./feature-toggle";
import type { ProjectEditorData } from "./types";

export const SECTION_STORAGE_KEY = "studio:sections:project";

const FORMAT_HINT =
  "Plain text. A blank line starts a new paragraph; lines that start with “- ” become a list. Links belong in Links.";

const STORY: Record<StoryKey, { label: string; hint: string }> = {
  context: {
    label: "Context",
    hint: "Where the project comes from: the brief, the people, the constraints.",
  },
  problem: {
    label: "Problem",
    hint: "What needed solving, in a paragraph or two.",
  },
  approach: {
    label: "Approach",
    hint: "The idea, and the decisions that shaped it.",
  },
  process: {
    label: "Process",
    hint: "How it was made: iterations, tests, turning points.",
  },
  architecture: {
    label: "Architecture",
    hint: "Systems, signal flow or structure. Lists work well here.",
  },
  result: {
    label: "Result",
    hint: "What shipped, and what changed because of it.",
  },
  reflection: {
    label: "Reflection",
    hint: "What you would keep, or change, next time.",
  },
};

/** Inline structural errors from the last failed save. */
export type FieldErrors = (
  field: string,
  locale?: "zh" | "en",
) => string | undefined;

export function fieldErrorLookup(
  issues: readonly ValidationIssue[] | undefined,
): FieldErrors {
  return (field, locale) =>
    issues?.find(
      (issue) =>
        issue.field === field &&
        (locale ? issue.locale === locale : !issue.locale),
    )?.message;
}

const localeErrors = (errors: FieldErrors, field: string) => ({
  zh: errors(field, "zh"),
  en: errors(field, "en"),
});

function missingAsset(id: string): MediaSummary {
  return {
    id,
    kind: "image",
    filename: "Missing asset",
    url: null,
    alt: { zh: "", en: "" },
  };
}

function assetOf(
  assets: Record<string, MediaSummary>,
  id: string | null,
): MediaSummary | null {
  if (!id) return null;
  return assets[id] ?? missingAsset(id);
}

export function BasicSection({
  meta,
  content,
  errors,
}: {
  meta: EntityMeta;
  content: ProjectContent;
  errors: FieldErrors;
}) {
  return (
    <EditorSection
      id="basic"
      label="Basic"
      storageKey={SECTION_STORAGE_KEY}
      defaultOpen
    >
      <div className="projects-fields">
        <LocalizedTextField
          name="title"
          label="Title"
          required
          maxLength={200}
          defaultValue={content.title}
          errors={localeErrors(errors, "title")}
        />
        <SlugField
          entityType="project"
          prefix="/en/works/"
          defaultValue={content.slug}
          entityId={meta.id}
          titleField="title.en"
          published={Boolean(meta.publishedSlug)}
          publishedSlug={meta.publishedSlug ?? null}
          error={errors("slug")}
        />
        <NumberInput
          name="year"
          label="Year"
          required
          min={1990}
          max={2100}
          defaultValue={content.year}
          className="projects-field--year"
          error={errors("year")}
        />
        <LocalizedTextField
          name="role"
          label="Role"
          maxLength={200}
          defaultValue={content.role}
          hint="Your part in the project, e.g. “Design and development”."
          errors={localeErrors(errors, "role")}
        />
        <LocalizedTextArea
          name="shortDescription"
          label="Short description"
          required
          rows={3}
          maxLength={280}
          defaultValue={content.shortDescription}
          hint="One or two sentences for cards and lists. English reads best under 140 characters."
          errors={localeErrors(errors, "shortDescription")}
        />
        <LocalizedTextArea
          name="description"
          label="Description"
          rows={6}
          maxLength={4000}
          defaultValue={content.description}
          hint={FORMAT_HINT}
          errors={localeErrors(errors, "description")}
        />
      </div>
    </EditorSection>
  );
}

export function MediaSection({
  content,
  assets,
}: {
  content: ProjectContent;
  assets: Record<string, MediaSummary>;
}) {
  return (
    <EditorSection id="media" label="Media" storageKey={SECTION_STORAGE_KEY}>
      <div className="projects-fields">
        <MediaField
          name="coverImageId"
          label="Cover image"
          kind="image"
          value={assetOf(assets, content.coverImageId)}
          hint="Cards and the top of the project page. Needs alt text in both languages before publishing."
        />
        <MediaField
          name="coverVideoId"
          label="Cover video"
          value={assetOf(assets, content.coverVideoId)}
          hint="Optional. A video file, or a YouTube or Google Drive link from the library."
        />
        <MediaListField
          name="gallery"
          label="Gallery"
          kind="image"
          value={content.gallery.map((item) => ({
            asset: assetOf(assets, item.assetId) ?? missingAsset(item.assetId),
            caption: item.caption,
          }))}
        />
        <MediaField
          name="socialImageId"
          label="Social image"
          kind="image"
          value={assetOf(assets, content.socialImageId)}
          hint="Link previews. Falls back to the cover image."
        />
      </div>
    </EditorSection>
  );
}

export function ClassificationSection({
  content,
  terms,
  music,
  errors,
}: {
  content: ProjectContent;
  terms: Term[];
  music: ProjectEditorData["music"];
  errors: FieldErrors;
}) {
  return (
    <EditorSection
      id="classification"
      label="Classification"
      storageKey={SECTION_STORAGE_KEY}
    >
      <div className="projects-fields">
        <TermSelect
          name="primaryCategoryId"
          label="Primary category"
          terms={terms}
          required
          placeholder="None"
          defaultValue={content.primaryCategoryId}
          hint="Shown first, and used by the category filter on /works."
          error={errors("primaryCategoryId")}
        />
        <TermMultiSelect
          name="categoryIds"
          label="Categories"
          terms={terms}
          defaultValue={content.categoryIds}
          vocabulary="project_category"
          addLabel="Add category"
          hint="A project can sit in several categories; the primary one is always included."
        />
        <TagInput
          name="tools"
          label="Tools"
          defaultValue={content.tools}
          hint="Software and instruments, e.g. Ableton Live, TouchDesigner."
        />
        <TagInput
          name="technologies"
          label="Technologies"
          defaultValue={content.technologies}
          hint="Languages, frameworks and platforms."
        />
        {music.length > 0 ? (
          <div className="projects-related">
            <p className="studio-field__label">Linked music</p>
            <ul className="projects-related__list">
              {music.map((track) => (
                <li key={track.id}>
                  <Link
                    className="studio-link"
                    to={`/studio/music/${track.id}`}
                  >
                    {track.label}
                  </Link>{" "}
                  <StatusBadge status={track.status} />
                </li>
              ))}
            </ul>
            <p className="studio-hint">
              Tracks choose their project in the music editor.
            </p>
          </div>
        ) : null}
      </div>
    </EditorSection>
  );
}

function filledCount(story: ProjectContent["story"], locale: "zh" | "en") {
  return STORY_KEYS.filter((key) => story[key][locale].trim()).length;
}

/** Seven ticks per locale: which case-study parts are written. */
function StoryCoverage({ story }: { story: ProjectContent["story"] }) {
  return (
    <div className="projects-coverage">
      {(["zh", "en"] as const).map((locale) => (
        <p className="projects-coverage__row" key={locale}>
          <span className="projects-coverage__locale">
            {locale.toUpperCase()}
          </span>
          <span className="projects-coverage__ticks" aria-hidden="true">
            {STORY_KEYS.map((key) => (
              <span
                key={key}
                className="projects-coverage__tick"
                data-filled={story[key][locale].trim() ? "" : undefined}
                title={STORY[key].label}
              />
            ))}
          </span>
          <span className="projects-coverage__count">
            {filledCount(story, locale)} of 7 written
          </span>
        </p>
      ))}
    </div>
  );
}

function blockCount(count: number, locale: string) {
  return `${count} ${count === 1 ? "block" : "blocks"} in ${locale}`;
}

/** Imported block bodies: preserved as they are until the block editor lands. */
function LegacyBlocks({ body }: { body: ProjectContent["body"] }) {
  const [removed, setRemoved] = useState(false);
  const empty = body.zh.length === 0 && body.en.length === 0;
  const value = JSON.stringify(removed ? { zh: [], en: [] } : body);
  if (empty) return <input type="hidden" name="body:json" value={value} />;
  return (
    <div className="projects-legacy" data-removed={removed ? "" : undefined}>
      <input type="hidden" name="body:json" value={value} />
      <p className="studio-field__label">Additional content blocks</p>
      <p className="studio-hint">
        Imported from the old admin: {blockCount(body.zh.length, "ZH")} ·{" "}
        {blockCount(body.en.length, "EN")}. They appear after the case study on
        the public page and are kept as they are.
      </p>
      <button
        type="button"
        className="studio-btn studio-btn--ghost studio-btn--compact"
        aria-pressed={removed}
        onClick={() => setRemoved((value) => !value)}
      >
        {removed ? "Keep the blocks" : "Remove the blocks on save"}
      </button>
    </div>
  );
}

export function CaseStudySection({
  content,
  story,
  errors,
}: {
  content: ProjectContent;
  /** Live story values (coverage follows typing). */
  story: ProjectContent["story"];
  errors: FieldErrors;
}) {
  return (
    <EditorSection
      id="case-study"
      label="Case study"
      storageKey={SECTION_STORAGE_KEY}
    >
      <div className="projects-fields">
        <StoryCoverage story={story} />
        <p className="studio-hint projects-fields__intro">{FORMAT_HINT}</p>
        {STORY_KEYS.map((key) => (
          <LocalizedTextArea
            key={key}
            name={`story.${key}`}
            label={STORY[key].label}
            rows={5}
            maxLength={12000}
            defaultValue={content.story[key]}
            hint={STORY[key].hint}
            errors={localeErrors(errors, `story.${key}`)}
          />
        ))}
        <LegacyBlocks body={content.body} />
      </div>
    </EditorSection>
  );
}

const emptyText = (): LocalizedText => ({ zh: "", en: "" });

export function LinksSection({ content }: { content: ProjectContent }) {
  return (
    <EditorSection id="links" label="Links" storageKey={SECTION_STORAGE_KEY}>
      <ListEditor
        name="links"
        label="Links"
        items={content.links}
        max={20}
        addLabel="Add link"
        itemLabel={(index) => `link ${index + 1}`}
        create={() => ({ label: emptyText(), url: "" })}
        renderItem={(item, _index, field) => (
          <>
            <LocalizedTextField
              name={field("label")}
              label="Label"
              maxLength={200}
              defaultValue={item.label}
            />
            <TextInput
              name={field("url")}
              label="Address"
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={2048}
              defaultValue={item.url}
            />
          </>
        )}
      />
      <p className="studio-hint">
        Source code, a live demo, a paper or press. Every link needs a label in
        both languages and an https:// address.
      </p>
    </EditorSection>
  );
}

export function CreditsSection({ content }: { content: ProjectContent }) {
  return (
    <EditorSection
      id="credits"
      label="Credits"
      storageKey={SECTION_STORAGE_KEY}
    >
      <ListEditor
        name="credits"
        label="Credits"
        items={content.credits}
        max={40}
        addLabel="Add credit"
        itemLabel={(index) => `credit ${index + 1}`}
        create={() => ({ role: emptyText(), name: "" })}
        renderItem={(item, _index, field) => (
          <>
            <LocalizedTextField
              name={field("role")}
              label="Role"
              maxLength={200}
              defaultValue={item.role}
            />
            <TextInput
              name={field("name")}
              label="Name"
              maxLength={200}
              defaultValue={item.name}
            />
          </>
        )}
      />
      <p className="studio-hint">
        Collaborators and what they did. Names are shown as written in both
        languages.
      </p>
    </EditorSection>
  );
}

export function PublicationSection({
  data,
  issues,
  pendingIntent,
  previewUrl,
  checklistRef,
}: {
  data: ProjectEditorData;
  issues: ValidationIssue[];
  pendingIntent: string | null;
  previewUrl: string;
  checklistRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { meta, content } = data;
  return (
    <EditorSection
      id="publication"
      label="Publication"
      storageKey={SECTION_STORAGE_KEY}
      defaultOpen
    >
      <div className="projects-fields">
        <div className="projects-checklist" ref={checklistRef}>
          <ValidationChecklist issues={issues} />
        </div>
        <FeatureToggle meta={meta} limit={data.featuredLimit} />
        <Checkbox
          name="listed"
          label="Show in lists"
          defaultChecked={content.listed}
          hint="Unlisted projects stay reachable by their URL but are left out of /works and the homepage. Takes effect when you publish."
        />
        <LocalizedTextField
          name="seo.title"
          label="SEO title"
          maxLength={300}
          defaultValue={content.seo.title}
          hint="Optional. Falls back to the title."
        />
        <LocalizedTextArea
          name="seo.description"
          label="SEO description"
          rows={3}
          maxLength={400}
          defaultValue={content.seo.description}
          hint="Optional. Falls back to the short description."
        />
        {data.redirects.length > 0 ? (
          <div className="projects-redirects">
            <p className="studio-field__label">Old addresses</p>
            <ul className="projects-redirects__list">
              {data.redirects.map((redirect) => (
                <li key={redirect.fromSlug}>
                  <code>/en/works/{redirect.fromSlug}</code>
                </li>
              ))}
            </ul>
            <p className="studio-hint">
              These redirect here (301), in both languages, while the project is
              published.
            </p>
          </div>
        ) : null}
        <PublicationPanel
          meta={meta}
          issues={issues}
          liveUrls={data.urls.live}
          previewUrl={previewUrl}
          pendingIntent={pendingIntent}
        />
      </div>
    </EditorSection>
  );
}
