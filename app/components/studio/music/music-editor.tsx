/**
 * Studio → Music → entry (brief §9–10; admin-architecture §4.4–4.7): sections
 * BASIC · AUDIO · LINKS · CREDITS · RELATIONS · PUBLICATION, the four-state
 * save indicator, Mod+S, the unsaved-changes guard and local backup
 * (`useEditorForm`), the publication panel, and the live placement controls
 * (homepage feature, the single homepage showreel) in their own small form so
 * they never touch the unsaved edits.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator } from "react-router";
import { studioLabel } from "../../../lib/cms/localized";
import {
  formatDuration,
  type MediaSummary,
} from "../../../lib/cms/media/summary";
import type { MusicEditorData } from "../../../lib/cms/repositories/music.server";
import type { ActionResult } from "../../../lib/cms/studio/responses";
import type {
  CreditItem,
  EntityMeta,
  LinkItem,
  ValidationIssue,
} from "../../../lib/cms/types";
import { LeaveGuard } from "../media/leave-guard";
import { StudioPage } from "../shell/studio-page";
import { FlagBadge, SaveStateIndicator, StatusBadge } from "../ui/badges";
import { EditorLayout, EditorSection } from "../ui/editor-layout";
import { NumberInput, Select, TextInput } from "../ui/fields";
import { ListEditor } from "../ui/list-editor";
import { LocalizedTextArea, LocalizedTextField } from "../ui/localized-field";
import { MediaField } from "../ui/media-field";
import { PreviewPane } from "../ui/preview-pane";
import { PublicationPanel } from "../ui/publication-panel";
import { CsrfField, IntentButton, StudioForm } from "../ui/studio-form";
import { useToast } from "../ui/toast";
import { useEditorForm } from "../ui/use-editor-form";

const FORM_ID = "music-form";
const PLACEMENT_ID = "music-placement";
const STORAGE_KEY = "studio:sections:music";

type EditorResult = ActionResult<{
  meta?: EntityMeta;
  issues?: ValidationIssue[];
  published?: boolean;
  reset?: boolean;
  redirectTo?: string;
}>;

const SECTION_FIELDS: Record<string, readonly string[]> = {
  basic: ["title", "artist", "year", "role", "genre", "description"],
  audio: [
    "audioPreviewId",
    "fullAudioId",
    "duration",
    "durationMs",
    "previewStartSeconds",
    "previewEndSeconds",
    "artworkId",
  ],
  links: ["spotifyUrl", "youtubeUrl", "soundcloudUrl", "otherLinks"],
  credits: ["credits"],
  relations: ["projectId"],
  publication: ["todoContent", "snapshot"],
};

function sectionOf(field: string): string {
  const head = field.split(".")[0] ?? field;
  for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
    if (fields.includes(head)) return section;
  }
  return "publication";
}

function issueText(
  issues: readonly ValidationIssue[],
  field: string,
  locale?: "zh" | "en",
): string | undefined {
  return issues.find(
    (issue) =>
      issue.severity === "error" &&
      issue.field === field &&
      (locale ? issue.locale === locale : true),
  )?.message;
}

function localeErrors(issues: readonly ValidationIssue[], field: string) {
  const zh = issueText(issues, field, "zh");
  const en = issueText(issues, field, "en");
  return { ...(zh ? { zh } : {}), ...(en ? { en } : {}) };
}

function PlacementControls({
  meta,
  showreel,
  showreelReady,
}: {
  meta: EntityMeta;
  showreel: MusicEditorData["showreel"];
  showreelReady: boolean;
}) {
  const archived = meta.status === "archived";
  const other = showreel && showreel.id !== meta.id ? showreel : null;
  return (
    <fieldset className="studio-placement">
      <legend className="studio-field__label">Homepage</legend>
      <p className="studio-hint">
        These apply immediately, without saving or publishing.
      </p>
      <div className="studio-placement__row">
        <button
          type="submit"
          form={PLACEMENT_ID}
          name="intent"
          value={meta.featured ? "unfeature" : "feature"}
          className="studio-btn studio-btn--secondary studio-btn--compact"
          disabled={archived && !meta.featured}
        >
          {meta.featured ? "Remove from homepage" : "Feature on homepage"}
        </button>
        {meta.featured ? <FlagBadge flag="FEATURED" /> : null}
      </div>
      <div className="studio-placement__row">
        <button
          type="submit"
          form={PLACEMENT_ID}
          name="intent"
          value={meta.isShowreel ? "clear-showreel" : "set-showreel"}
          className="studio-btn studio-btn--secondary studio-btn--compact"
          disabled={!meta.isShowreel && (archived || !showreelReady)}
        >
          {meta.isShowreel
            ? "Remove from homepage showreel"
            : "Make homepage showreel"}
        </button>
        {meta.isShowreel ? <FlagBadge flag="SHOWREEL" /> : null}
      </div>
      <p className="studio-hint">
        {meta.isShowreel && meta.status !== "published"
          ? "This is the homepage showreel, but it is not live until you publish. "
          : ""}
        {!meta.isShowreel && other
          ? `Replaces the current showreel: ${other.title}. `
          : ""}
        {!meta.isShowreel && !showreelReady
          ? "Add preview audio, full audio or a YouTube link (and save) to use it as the showreel. "
          : ""}
        Never autoplays: visitors press play.
      </p>
    </fieldset>
  );
}

export function MusicEditorView({ data }: { data: MusicEditorData }) {
  const { meta, content } = data;
  const fetcher = useFetcher<EditorResult>();
  const placement = useFetcher<ActionResult>();
  const editor = useEditorForm({
    type: "music",
    id: meta.id,
    updatedAt: meta.updatedAt,
    fetcher,
  });
  const toast = useToast();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const title = studioLabel(content.title);

  // Remount the form with server values when the copy changed elsewhere
  // (revert, reload after a conflict) but not after this form's own save.
  const [formKey, setFormKey] = useState(`${meta.id}:${meta.updatedAt}`);
  const ownSave = useRef<string | null>(null);
  useEffect(() => {
    const result = fetcher.data;
    if (result?.ok && result.meta && !result.reset) {
      ownSave.current = result.meta.updatedAt;
    }
  }, [fetcher.data]);
  useEffect(() => {
    if (meta.updatedAt !== ownSave.current) {
      setFormKey(`${meta.id}:${meta.updatedAt}`);
    }
  }, [meta.id, meta.updatedAt]);

  // Feedback for the editor's own submissions.
  const previous = useRef(fetcher.state);
  const pendingIntent = useRef<string | null>(null);
  if (fetcher.formData) {
    pendingIntent.current = String(fetcher.formData.get("intent") ?? "");
  }
  useEffect(() => {
    if (previous.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data;
      const intent = pendingIntent.current;
      if (result?.ok) {
        if (intent === "publish") {
          toast.show(
            result.published
              ? { message: "Published" }
              : {
                  tone: "info",
                  message: "Saved as a draft. Fix the checklist, then publish.",
                },
          );
        } else if (intent === "unpublish") {
          toast.show({ message: "Unpublished" });
        } else if (intent === "archive") {
          toast.show({ message: "Archived" });
        } else if (intent === "restore") {
          toast.show({ message: "Restored to draft" });
        } else if (intent === "revert") {
          toast.show({ message: "Reverted to the published version" });
        }
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, toast]);

  // Duplicate / delete leave once the save state has settled (no prompt).
  const redirectTo =
    fetcher.state === "idle" && fetcher.data?.ok
      ? fetcher.data.redirectTo
      : undefined;
  useEffect(() => {
    if (redirectTo && !editor.dirty) navigate(redirectTo);
  }, [redirectTo, editor.dirty, navigate]);

  // Placement feedback.
  const placementPrevious = useRef(placement.state);
  useEffect(() => {
    if (placementPrevious.current !== "idle" && placement.state === "idle") {
      const result = placement.data;
      if (result && !result.ok) {
        toast.show({ tone: "error", message: result.message });
      } else if (result?.ok) {
        toast.show({ message: "Homepage updated" });
      }
    }
    placementPrevious.current = placement.state;
  }, [placement.state, placement.data, toast]);

  const issues: readonly ValidationIssue[] =
    fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.issues
      ? fetcher.data.issues
      : data.issues;
  const structural =
    fetcher.data && !fetcher.data.ok ? (fetcher.data.issues ?? []) : [];
  const allIssues = [...structural, ...issues];

  const sections = (() => {
    const count = (id: string) =>
      allIssues.filter(
        (issue) => issue.severity === "error" && sectionOf(issue.field) === id,
      ).length;
    return [
      { id: "basic", label: "BASIC" },
      { id: "audio", label: "AUDIO" },
      { id: "links", label: "LINKS" },
      { id: "credits", label: "CREDITS" },
      { id: "relations", label: "RELATIONS" },
      { id: "publication", label: "PUBLICATION" },
    ].map((section) => ({ ...section, issues: count(section.id) }));
  })();

  const [audio, setAudio] = useState<{
    preview: MediaSummary | null;
    full: MediaSummary | null;
  }>(() => ({
    preview: content.audioPreviewId
      ? (data.assets[content.audioPreviewId] ?? null)
      : null,
    full: content.fullAudioId
      ? (data.assets[content.fullAudioId] ?? null)
      : null,
  }));
  const touch = () => window.setTimeout(editor.onInput, 0);
  const assetDuration = audio.full?.durationMs ?? audio.preview?.durationMs;
  const showreelReady = Boolean(
    content.audioPreviewId || content.fullAudioId || content.youtubeUrl,
  );
  const conflict =
    editor.state.kind === "error" &&
    fetcher.data &&
    !fetcher.data.ok &&
    fetcher.data.code === "stale_revision";

  return (
    <StudioPage
      title={title}
      breadcrumb={<Link to="/studio/music">Music</Link>}
      status={
        <>
          <SaveStateIndicator state={editor.state} />
          <StatusBadge status={meta.status} />
          {meta.hasUnpublishedChanges ? <FlagBadge flag="CHANGES" /> : null}
          {meta.isShowreel ? <FlagBadge flag="SHOWREEL" /> : null}
        </>
      }
      actions={
        <>
          <IntentButton
            form={FORM_ID}
            intent="save"
            compact
            pending={
              editor.state.kind === "saving" && pendingIntent.current === "save"
            }
            pendingLabel="Saving…"
          >
            Save
          </IntentButton>
          {meta.status !== "archived" &&
          (meta.status === "draft" || meta.hasUnpublishedChanges) ? (
            <IntentButton
              form={FORM_ID}
              intent="publish"
              variant="primary"
              compact
              disabled={meta.todoContent}
              pending={
                editor.state.kind === "saving" &&
                pendingIntent.current === "publish"
              }
              pendingLabel="Publishing…"
            >
              Publish
            </IntentButton>
          ) : null}
        </>
      }
    >
      {editor.state.kind === "error" ? (
        <div className="studio-editor-error" role="alert">
          <p>{editor.state.message}</p>
          {conflict ? (
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              onClick={() => revalidator.revalidate()}
            >
              Reload latest
            </button>
          ) : null}
        </div>
      ) : null}
      {editor.backup ? (
        <div className="studio-backup" role="status">
          <p>
            Unsaved changes from{" "}
            {new Date(editor.backup.savedAt).toTimeString().slice(0, 5)} found.
          </p>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={editor.restoreBackup}
          >
            Restore
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={editor.discardBackup}
          >
            Discard
          </button>
        </div>
      ) : null}

      <placement.Form
        id={PLACEMENT_ID}
        method="post"
        className="studio-placement-form"
      >
        <CsrfField />
      </placement.Form>

      <EditorLayout
        sections={sections}
        preview={
          <PreviewPane
            src={data.previewUrl}
            title={title}
            reloadKey={meta.updatedAt}
          />
        }
      >
        <StudioForm
          key={formKey}
          fetcher={fetcher}
          id={FORM_ID}
          ref={editor.formRef}
          onInput={editor.onInput}
          noValidate
          className="studio-music-form"
        >
          <input type="hidden" name="expectedRevision" value={meta.revision} />

          <EditorSection
            id="basic"
            label="BASIC"
            storageKey={STORAGE_KEY}
            defaultOpen
          >
            <LocalizedTextField
              name="title"
              label="Title"
              required
              sameInBoth
              maxLength={200}
              defaultValue={content.title}
              errors={localeErrors(allIssues, "title")}
            />
            <LocalizedTextField
              name="artist"
              label="Artist"
              required
              sameInBoth
              maxLength={200}
              hint="Your own work is credited to Kamel."
              defaultValue={content.artist}
              errors={localeErrors(allIssues, "artist")}
            />
            <div className="studio-music-form__pair">
              <NumberInput
                name="year"
                label="Year"
                min={1990}
                max={2100}
                defaultValue={content.year}
                error={issueText(allIssues, "year")}
              />
            </div>
            <LocalizedTextField
              name="role"
              label="Role"
              maxLength={200}
              hint="For example: Mixing, Production."
              defaultValue={content.role}
            />
            <LocalizedTextField
              name="genre"
              label="Genre"
              maxLength={100}
              defaultValue={content.genre}
            />
            <LocalizedTextArea
              name="description"
              label="Description"
              rows={4}
              maxLength={4000}
              hint="Plain text. A blank line starts a new paragraph; lines that start with a hyphen and a space form a list."
              defaultValue={content.description}
            />
          </EditorSection>

          <EditorSection
            id="audio"
            label="AUDIO"
            storageKey={STORAGE_KEY}
            defaultOpen
          >
            <MediaField
              name="audioPreviewId"
              label="Preview audio"
              kind="audio"
              hint="A short excerpt for the player. Upload a file or register a link."
              value={audio.preview}
              error={issueText(allIssues, "audioPreviewId")}
              onChange={(asset) => {
                setAudio((current) => ({ ...current, preview: asset }));
                touch();
              }}
            />
            <MediaField
              name="fullAudioId"
              label="Full audio"
              kind="audio"
              value={audio.full}
              error={issueText(allIssues, "fullAudioId")}
              onChange={(asset) => {
                setAudio((current) => ({ ...current, full: asset }));
                touch();
              }}
            />
            <div className="studio-music-form__duration">
              <TextInput
                name="duration"
                label="Duration"
                inputMode="numeric"
                placeholder="3:15"
                hint="Minutes:seconds. Shown next to the player."
                defaultValue={formatDuration(content.durationMs) ?? ""}
                error={
                  issueText(allIssues, "duration") ??
                  issueText(allIssues, "durationMs")
                }
              />
              {assetDuration ? (
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact"
                  onClick={() => {
                    const input =
                      editor.formRef.current?.querySelector<HTMLInputElement>(
                        'input[name="duration"]',
                      );
                    if (!input) return;
                    input.value = formatDuration(assetDuration) ?? "";
                    input.form?.dispatchEvent(
                      new Event("input", { bubbles: true }),
                    );
                  }}
                >
                  Use audio length ({formatDuration(assetDuration)})
                </button>
              ) : null}
            </div>
            <div className="studio-music-form__pair">
              <NumberInput
                name="previewStartSeconds"
                label="Preview starts (seconds)"
                min={0}
                defaultValue={content.previewStartSeconds}
              />
              <NumberInput
                name="previewEndSeconds"
                label="Preview ends (seconds)"
                min={1}
                defaultValue={content.previewEndSeconds}
                error={issueText(allIssues, "previewEndSeconds")}
              />
            </div>
            <MediaField
              name="artworkId"
              label="Artwork"
              kind="image"
              value={
                content.artworkId
                  ? (data.assets[content.artworkId] ?? null)
                  : null
              }
              error={issueText(allIssues, "artworkId")}
              onChange={touch}
            />
          </EditorSection>

          <EditorSection id="links" label="LINKS" storageKey={STORAGE_KEY}>
            <TextInput
              name="spotifyUrl"
              label="Spotify"
              inputMode="url"
              placeholder="https://open.spotify.com/track/…"
              defaultValue={content.spotifyUrl ?? ""}
              error={issueText(allIssues, "spotifyUrl")}
            />
            <TextInput
              name="youtubeUrl"
              label="YouTube"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              defaultValue={content.youtubeUrl ?? ""}
              error={issueText(allIssues, "youtubeUrl")}
            />
            <TextInput
              name="soundcloudUrl"
              label="SoundCloud"
              inputMode="url"
              placeholder="https://soundcloud.com/…"
              defaultValue={content.soundcloudUrl ?? ""}
              error={issueText(allIssues, "soundcloudUrl")}
            />
            <ListEditor<LinkItem>
              name="otherLinks"
              label="Other links"
              items={content.otherLinks}
              max={10}
              addLabel="Add link"
              itemLabel={(index) => `link ${index + 1}`}
              create={() => ({ label: { zh: "", en: "" }, url: "" })}
              renderItem={(item, index, field) => (
                <>
                  <div className="studio-picker__pair">
                    <input
                      className="studio-input"
                      name={field("label.zh")}
                      lang="zh-Hant"
                      aria-label={`Link ${index + 1} label ZH`}
                      placeholder="Label ZH"
                      defaultValue={item.label.zh}
                    />
                    <input
                      className="studio-input"
                      name={field("label.en")}
                      lang="en"
                      aria-label={`Link ${index + 1} label EN`}
                      placeholder="Label EN"
                      defaultValue={item.label.en}
                    />
                  </div>
                  <input
                    className="studio-input"
                    name={field("url")}
                    inputMode="url"
                    aria-label={`Link ${index + 1} address`}
                    placeholder="https://"
                    defaultValue={item.url}
                  />
                </>
              )}
            />
          </EditorSection>

          <EditorSection id="credits" label="CREDITS" storageKey={STORAGE_KEY}>
            <ListEditor<CreditItem>
              name="credits"
              label="Credits"
              items={content.credits}
              max={40}
              addLabel="Add credit"
              itemLabel={(index) => `credit ${index + 1}`}
              create={() => ({ role: { zh: "", en: "" }, name: "" })}
              renderItem={(item, index, field) => (
                <>
                  <div className="studio-picker__pair">
                    <input
                      className="studio-input"
                      name={field("role.zh")}
                      lang="zh-Hant"
                      aria-label={`Credit ${index + 1} role ZH`}
                      placeholder="Role ZH"
                      defaultValue={item.role.zh}
                    />
                    <input
                      className="studio-input"
                      name={field("role.en")}
                      lang="en"
                      aria-label={`Credit ${index + 1} role EN`}
                      placeholder="Role EN"
                      defaultValue={item.role.en}
                    />
                  </div>
                  <input
                    className="studio-input"
                    name={field("name")}
                    aria-label={`Credit ${index + 1} name`}
                    placeholder="Name"
                    defaultValue={item.name}
                  />
                </>
              )}
            />
          </EditorSection>

          <EditorSection
            id="relations"
            label="RELATIONS"
            storageKey={STORAGE_KEY}
          >
            <Select
              name="projectId"
              label="Related project"
              hint="Published tracks are listed on the project's page."
              placeholder="No related project"
              defaultValue={content.projectId ?? ""}
              options={data.projectOptions.map((option) => ({
                value: option.id,
                label:
                  option.status === "published"
                    ? option.label
                    : `${option.label} (${option.status})`,
              }))}
            />
          </EditorSection>

          <EditorSection
            id="publication"
            label="PUBLICATION"
            storageKey={STORAGE_KEY}
            defaultOpen
          >
            <PublicationPanel
              meta={meta}
              issues={issues}
              previewUrl={data.previewUrl}
              pendingIntent={
                fetcher.state !== "idle" ? pendingIntent.current : null
              }
            />
            <PlacementControls
              meta={meta}
              showreel={data.showreel}
              showreelReady={showreelReady}
            />
          </EditorSection>
        </StudioForm>
      </EditorLayout>
      <LeaveGuard
        blocker={editor.blocker}
        formRef={editor.formRef}
        saveState={editor.state.kind}
      />
    </StudioPage>
  );
}
