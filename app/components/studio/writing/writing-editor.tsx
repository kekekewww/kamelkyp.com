/**
 * Writing editor (admin-architecture §4.4 section map): BASIC title, slug,
 * date, platform (+ name for Other), category, excerpt · SOURCE external URL
 * · CONTENT block editor with ZH/EN tabs · MEDIA cover, social image ·
 * PUBLICATION listed, featured, SEO.
 *
 * The SOURCE section states where the entry goes once published: an article
 * page (Internal) or a card that links out (every other platform).
 */
import { useCallback, useState } from "react";
import { studioLabel } from "../../../lib/cms/localized";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type {
  WritingContent,
  WritingPlatform,
} from "../../../lib/cms/schemas/writing";
import type {
  EntityMeta,
  LocalizedBlocks,
  ValidationIssue,
} from "../../../lib/cms/types";
import { BlockEditor } from "../blocks/block-editor";
import { EntryEditorFrame } from "../recognition/kit/editor-frame";
import { TermField } from "../recognition/kit/term-field";
import {
  Checkbox,
  DateInput,
  EditorSection,
  IntentButton,
  LocalizedTextArea,
  LocalizedTextField,
  MediaField,
  PublicationPanel,
  Select,
  SlugField,
  TextInput,
  ValidationChecklist,
} from "../ui";
import {
  PLATFORM_OPTIONS,
  PLATFORM_URL_HINT,
  WRITING_SECTIONS,
  type WritingRoute,
  writingIssues,
  writingRoute,
  writingSectionOf,
} from "./writing-form";

export type WritingEditorData = {
  meta: EntityMeta;
  content: WritingContent;
  issues: ValidationIssue[];
  categories: Term[];
  assets: MediaSummary[];
  previewPath: string;
  liveUrls: { zh: string; en: string } | null;
  outboundUrl: string | null;
};

const BASE = "/studio/writing";

function readForm(form: HTMLFormElement | null) {
  const value = (name: string) => {
    const element = form?.elements.namedItem(name);
    return element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
      ? element.value
      : "";
  };
  return {
    platform: (value("platform") || "internal") as WritingPlatform,
    slug: value("slug"),
    externalUrl: value("externalUrl"),
  };
}

function RouteLine({ route }: { route: WritingRoute }) {
  return (
    <p className="p3-route" aria-live="polite">
      <span className="p3-route__label">Publishes as</span>
      {route.kind === "article" ? (
        <span className="p3-route__target">
          An article page at <code>/zh{route.path}</code> and{" "}
          <code>/en{route.path}</code>
        </span>
      ) : route.kind === "link" ? (
        <span className="p3-route__target">
          A card that links out to <code>{route.url}</code> (no page on this
          site)
        </span>
      ) : (
        <span className="p3-route__target p3-route__target--missing">
          A card that links out, once you add the link to the original post
        </span>
      )}
    </p>
  );
}

function blocksFrom(
  restored: (name: string) => string | undefined,
  fallback: LocalizedBlocks,
): LocalizedBlocks {
  const read = (locale: "zh" | "en") => {
    const raw = restored(`content.${locale}:json`);
    if (!raw) return fallback[locale];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : fallback[locale];
    } catch {
      return fallback[locale];
    }
  };
  return { zh: read("zh"), en: read("en") };
}

export function WritingEditor({
  data,
  onReset,
}: {
  data: WritingEditorData;
  onReset: () => void;
}) {
  const { meta, content } = data;
  const title = studioLabel(content.title, "Untitled writing");
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]));
  const [platform, setPlatform] = useState<WritingPlatform>(content.platform);
  const [route, setRoute] = useState<WritingRoute>(() => writingRoute(content));

  const follow = useCallback((form: HTMLFormElement | null) => {
    window.setTimeout(() => {
      const current = readForm(form);
      setPlatform(current.platform);
      setRoute(writingRoute(current));
    }, 0);
  }, []);

  return (
    <EntryEditorFrame
      type="writing"
      typeLabel="Writing"
      listHref={BASE}
      meta={meta}
      title={title}
      sections={WRITING_SECTIONS}
      defaultOpen={["basic", "source", "content", "publication"]}
      serverIssues={data.issues}
      computeIssues={writingIssues}
      sectionOf={writingSectionOf}
      previewPath={data.previewPath}
      liveUrls={data.liveUrls}
      onReset={onReset}
      onFieldInput={(event) => follow(event.currentTarget)}
    >
      {(editor) => {
        const media = (name: "coverImageId" | "socialImageId") =>
          assets.get(editor.restored(name) ?? content[name] ?? "") ?? null;
        return (
          <>
            <EditorSection {...editor.section("basic")}>
              <LocalizedTextField
                name="title"
                label="Title"
                required
                maxLength={200}
                defaultValue={content.title}
                errors={{
                  zh: editor.fieldError("title", "zh"),
                  en: editor.fieldError("title", "en"),
                }}
              />
              <SlugField
                entityType="writing"
                prefix="/en/writing/"
                defaultValue={content.slug}
                entityId={meta.id}
                titleField="title.en"
                published={meta.firstPublishedAt !== null}
                publishedSlug={meta.publishedSlug ?? null}
                error={editor.fieldError("slug")}
              />
              <div className="p3-fields-row">
                <DateInput
                  name="date"
                  label="Date"
                  required
                  defaultValue={content.date}
                  hint="Newest first on the site."
                  error={editor.fieldError("date")}
                />
                <Select
                  name="platform"
                  label="Platform"
                  required
                  defaultValue={content.platform}
                  options={PLATFORM_OPTIONS}
                  hint={
                    platform === "internal"
                      ? "Written here: an article page on this site."
                      : "Published elsewhere: a card that links to it."
                  }
                />
                <div hidden={platform !== "other"}>
                  <TextInput
                    name="platformLabel"
                    label="Platform name"
                    required={platform === "other"}
                    maxLength={60}
                    defaultValue={content.platformLabel ?? ""}
                    placeholder="e.g. Substack"
                    error={editor.fieldError("platformLabel")}
                  />
                </div>
              </div>
              <TermField
                name="categoryTermId"
                label="Category"
                vocabulary="writing_category"
                addLabel="Add category"
                terms={data.categories}
                defaultValue={content.categoryTermId}
                onChange={editor.notifyChange}
              />
              <LocalizedTextArea
                name="excerpt"
                label="Excerpt"
                rows={3}
                maxLength={400}
                defaultValue={content.excerpt}
                hint="One or two sentences for lists and link cards (up to 400 characters)."
              />
            </EditorSection>

            <EditorSection {...editor.section("source")}>
              <TextInput
                name="externalUrl"
                label="Link to the original post"
                type="url"
                inputMode="url"
                required={platform !== "internal"}
                placeholder={PLATFORM_URL_HINT[platform]}
                defaultValue={content.externalUrl ?? ""}
                hint={
                  platform === "internal"
                    ? "Optional for articles written here."
                    : "Required: the public card opens this address in a new tab."
                }
                error={editor.fieldError("externalUrl")}
              />
              <RouteLine route={route} />
            </EditorSection>

            <EditorSection {...editor.section("content")}>
              {platform !== "internal" ? (
                <p className="studio-hint p3-note">
                  Link cards show the title, excerpt and cover and open the
                  original post. Content blocks are kept but not shown while the
                  platform is not Internal.
                </p>
              ) : null}
              <BlockEditor
                key={`content-${editor.restoreEpoch}`}
                name="content"
                defaultValue={blocksFrom(editor.restored, content.content)}
                assets={data.assets}
                onChange={editor.notifyChange}
                errors={{
                  zh: editor.fieldError("content", "zh"),
                  en: editor.fieldError("content", "en"),
                }}
              />
            </EditorSection>

            <EditorSection {...editor.section("media")}>
              <MediaField
                key={`cover-${editor.restoreEpoch}`}
                name="coverImageId"
                label="Cover image"
                kind="image"
                value={media("coverImageId")}
                hint="Shown on cards and at the top of the article."
                error={editor.fieldError("coverImageId")}
                onChange={editor.notifyChange}
              />
              <MediaField
                key={`social-${editor.restoreEpoch}`}
                name="socialImageId"
                label="Social image"
                kind="image"
                value={media("socialImageId")}
                hint="Used when the article is shared; the cover is used when empty."
                error={editor.fieldError("socialImageId")}
                onChange={editor.notifyChange}
              />
            </EditorSection>

            <EditorSection {...editor.section("publication")}>
              <ValidationChecklist issues={editor.issues} />
              <PublicationPanel
                meta={meta}
                issues={editor.issues}
                liveUrls={data.liveUrls}
                previewUrl={`${data.previewPath}?locale=zh`}
                pendingIntent={editor.pendingIntent}
              />
              {data.outboundUrl && meta.status === "published" ? (
                <p className="studio-hint">
                  Live as a card linking to{" "}
                  <a
                    href={data.outboundUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {data.outboundUrl}
                  </a>
                  .
                </p>
              ) : null}
              <Checkbox
                name="listed"
                label="Show in lists and on the homepage"
                defaultChecked={content.listed}
                hint="Unlisted articles stay reachable by their URL. Takes effect when you publish."
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
                    Live at once. Featured writing leads the homepage list; its
                    order is set in Homepage.
                  </p>
                </div>
              ) : null}
              <LocalizedTextField
                name="seo.title"
                label="SEO title"
                maxLength={300}
                defaultValue={content.seo.title}
                hint="Optional. The page title in search results; the title is used when empty."
              />
              <LocalizedTextArea
                name="seo.description"
                label="SEO description"
                rows={2}
                maxLength={400}
                defaultValue={content.seo.description}
                hint="Optional. The excerpt is used when empty."
              />
            </EditorSection>
          </>
        );
      }}
    </EntryEditorFrame>
  );
}
