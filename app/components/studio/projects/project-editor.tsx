/**
 * `/studio/projects/:id` (admin-architecture §4.4–4.11): grouped sections,
 * Editor | Preview split from 1200 px, the four-state save indicator,
 * publish-time validation with a live checklist, unsaved-changes guard and
 * local backup, keyboard save (Mod+S) and preview (Mod+Shift+Enter).
 *
 * Save and Publish go through one fetcher tracked by `useEditorForm`;
 * placement (feature) and Undo use their own fetchers so they never mark
 * the form as saved.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FetcherWithComponents,
  Link,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";
import type { ValidationIssue } from "../../../lib/cms/types";
import { StudioPage } from "../shell/studio-page";
import {
  backupKey,
  ConfirmDialog,
  EditorLayout,
  FlagBadge,
  IntentButton,
  PREVIEW_FRAME_NAME,
  PreviewPane,
  previewSrc,
  SaveStateIndicator,
  StatusBadge,
  StudioForm,
  saveStateLabel,
  serializeForm,
  useEditorForm,
  useToast,
} from "../ui";
import {
  BasicSection,
  CaseStudySection,
  ClassificationSection,
  CreditsSection,
  fieldErrorLookup,
  LinksSection,
  MediaSection,
  PublicationSection,
  SECTION_STORAGE_KEY,
} from "./editor-sections";
import {
  mergeIssues,
  PROJECT_SECTIONS,
  projectPublishIssues,
  readProjectForm,
  sectionIssueCounts,
} from "./project-form";
import type { ProjectActionData, ProjectEditorData } from "./types";
import { useFormWatch } from "./use-form-watch";
import { useProjectSubmit } from "./use-project-submit";

const FORM_ID = "project-editor";
const PREVIEW_OPEN_KEY = "studio:projects:preview-open";
const PREVIEW_LIVE_KEY = "studio:projects:preview-live";
const LIVE_PREVIEW_MS = 1200;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage unavailable: the toggle still works for this page.
  }
}

/** A per-browser on/off preference (SSR renders the fallback). */
function useFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);
  useEffect(() => setValue(readFlag(key, fallback)), [key, fallback]);
  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      writeFlag(key, next);
    },
    [key],
  );
  return [value, update] as const;
}

function sectionLabel(id: string) {
  return PROJECT_SECTIONS.find((section) => section.id === id)?.label ?? id;
}

function clock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const isError = (issue: ValidationIssue) => issue.severity === "error";

/** The preview column exists from 1200 px (admin-architecture §4.4). */
const previewWide = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 1200px)").matches;

export function ProjectEditor({
  data,
  onReload,
}: {
  data: ProjectEditorData;
  /** Remount with the latest server copy (after revert or a conflict). */
  onReload?: () => void;
}) {
  const { meta, content } = data;
  const fetcher = useFetcher<ProjectActionData>();
  const editor = useEditorForm({
    type: "project",
    id: meta.id,
    updatedAt: meta.updatedAt,
    fetcher: fetcher as FetcherWithComponents<unknown>,
  });
  const toast = useToast();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const checklistRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLFormElement>(null);
  const blockerRef = useRef(editor.blocker);
  blockerRef.current = editor.blocker;

  const [clientIssues, setClientIssues] = useState<ValidationIssue[] | null>(
    null,
  );
  const [story, setStory] = useState(content.story);
  const [failure, setFailure] = useState<ProjectActionData | null>(null);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [leaveAfterSave, setLeaveAfterSave] = useState(false);
  const [previewOpen, setPreviewOpen] = useFlag(PREVIEW_OPEN_KEY, true);
  const [livePreview, setLivePreview] = useFlag(PREVIEW_LIVE_KEY, true);
  const lastLivePost = useRef<string | null>(null);
  const liveTimer = useRef(0);

  const title = content.title.zh.trim() || content.title.en.trim();
  const displayTitle = title || "Untitled project";
  const pendingIntent =
    fetcher.state !== "idle"
      ? ((fetcher.formData?.get("intent") as string | null) ?? null)
      : null;

  // ---- Live checklist ------------------------------------------------------

  const clientCheck = useCallback(
    (form: HTMLFormElement): ValidationIssue[] => {
      const parsed = readProjectForm(new FormData(form));
      if (!parsed.ok) return parsed.issues;
      setStory(parsed.content.story);
      return projectPublishIssues(parsed.content, {
        todoContent: meta.todoContent && !parsed.clearTodoContent,
      });
    },
    [meta.todoContent],
  );

  const issues = mergeIssues(
    clientIssues ?? data.issues,
    data.issues,
    editor.dirty && clientIssues !== null,
  );
  const blocking = issues.filter(isError).length;
  const counts = sectionIssueCounts(issues);

  // ---- Preview -------------------------------------------------------------

  /** Posts the unsaved form to the preview route (nothing is stored). */
  const postPreview = useCallback(
    (target: string) => {
      const form = editor.formRef.current;
      const poster = posterRef.current;
      if (!form || !poster) return;
      const frame = document.querySelector<HTMLIFrameElement>(
        `iframe[name="${PREVIEW_FRAME_NAME}"]`,
      );
      const current = frame?.getAttribute("src") ?? "";
      const locale = current.includes("locale=en") ? "en" : "zh";
      poster.action = previewSrc(data.urls.preview, locale);
      poster.target = target;
      const inputs = [...new FormData(form).entries()].flatMap(
        ([name, value]) => {
          if (typeof value !== "string" || name === "intent") return [];
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          return [input];
        },
      );
      poster.replaceChildren(...inputs);
      poster.submit();
      poster.replaceChildren();
    },
    [editor.formRef, data.urls.preview],
  );

  const previewChanges = useCallback(() => {
    postPreview(previewOpen && previewWide() ? PREVIEW_FRAME_NAME : "_blank");
  }, [postPreview, previewOpen]);

  const { dirtySections } = useFormWatch({
    formRef: editor.formRef,
    dirty: editor.dirty,
    resetKey: meta.revision,
    onChange: editor.onInput,
    onSettled: (form) => {
      setClientIssues(clientCheck(form));
      if (!livePreview || !previewOpen || !previewWide()) return;
      window.clearTimeout(liveTimer.current);
      liveTimer.current = window.setTimeout(() => {
        const snapshot = serializeForm(new FormData(form));
        if (snapshot === lastLivePost.current) return;
        lastLivePost.current = snapshot;
        postPreview(PREVIEW_FRAME_NAME);
      }, LIVE_PREVIEW_MS);
    },
  });
  useEffect(() => () => window.clearTimeout(liveTimer.current), []);

  // ---- Keyboard: Mod+Shift+Enter previews the unsaved form ----------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        previewChanges();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewChanges]);

  // Phones: only BASIC starts open (unless the owner opened others before).
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) ?? "{}");
    } catch {
      stored = {};
    }
    for (const section of PROJECT_SECTIONS) {
      if (section.id === "basic" || typeof stored[section.id] === "boolean") {
        continue;
      }
      const details = document.getElementById(`section-${section.id}`);
      if (details instanceof HTMLDetailsElement) details.open = false;
    }
  }, []);

  // ---- Checklist focus -----------------------------------------------------

  const openChecklist = useCallback(() => {
    const section = document.getElementById("section-publication");
    if (section instanceof HTMLDetailsElement) section.open = true;
    const first = checklistRef.current?.querySelector<HTMLButtonElement>(
      ".studio-checklist__item--error .studio-checklist__link",
    );
    checklistRef.current?.scrollIntoView({ block: "center" });
    first?.focus();
  }, []);

  /** Publish with blocking issues does not submit (admin §4.10). */
  const guardPublish = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    if (submitter.value !== "publish") return;
    const current = clientCheck(event.currentTarget);
    setClientIssues(current);
    if (current.some(isError)) {
      event.preventDefault();
      window.requestAnimationFrame(openChecklist);
    }
  };

  // ---- Results -------------------------------------------------------------

  const undo = useProjectSubmit((result) => {
    if (!result.ok) {
      toast.show({
        tone: "error",
        message: result.message ?? "Undo failed.",
      });
    }
  });

  const previousState = useRef(fetcher.state);
  useEffect(() => {
    const finished =
      previousState.current !== "idle" && fetcher.state === "idle";
    previousState.current = fetcher.state;
    const result = fetcher.data;
    if (!finished || !result) return;

    if (!result.ok) {
      setFailure(result);
      if (leaveAfterSave) {
        setLeaveAfterSave(false);
        if (blockerRef.current.state === "blocked") blockerRef.current.reset();
      }
      return;
    }
    setFailure(null);

    switch (result.intent) {
      case "save":
        if (leaveAfterSave) {
          setLeaveAfterSave(false);
          if (blockerRef.current.state === "blocked") {
            blockerRef.current.proceed();
          }
        }
        break;
      case "publish":
        if (result.published) {
          const slug = result.meta?.publishedSlug;
          toast.show({
            message: "Published",
            action: slug
              ? { label: "View live", href: `/en/works/${slug}` }
              : undefined,
          });
        } else {
          const count = (result.issues ?? []).filter(isError).length;
          toast.show({
            tone: "info",
            message: `Saved as a draft. Publishing needs ${count} ${count === 1 ? "fix" : "fixes"}.`,
          });
          window.requestAnimationFrame(openChecklist);
        }
        break;
      case "unpublish":
        toast.show({
          message: "Unpublished. It is no longer on the public site.",
        });
        break;
      case "archive":
        toast.show({
          message: "Archived",
          action: {
            label: "Undo",
            onAction: () =>
              undo.submit({
                intent: "restore",
                republish: result.wasPublished ? "1" : "0",
              }),
          },
        });
        break;
      case "restore":
        toast.show({
          message:
            result.status === "published"
              ? "Restored and published"
              : "Restored to draft",
        });
        break;
      case "revert":
        toast.show({ message: "Reverted to the published version" });
        onReload?.();
        break;
      case "duplicate":
        toast.show({ message: "Duplicated. You are editing the copy." });
        setPendingNav(result.redirectTo ?? null);
        break;
      case "delete":
        toast.show({ message: "Deleted permanently" });
        setPendingNav(result.redirectTo ?? "/studio/projects");
        break;
      default:
        break;
    }
  }, [
    fetcher.state,
    fetcher.data,
    leaveAfterSave,
    toast,
    onReload,
    openChecklist,
    undo,
  ]);

  // Navigate once the guard knows the form is clean.
  useEffect(() => {
    if (pendingNav && !editor.dirty) navigate(pendingNav);
  }, [pendingNav, editor.dirty, navigate]);

  const reloadLatest = async () => {
    const form = editor.formRef.current;
    if (form) {
      try {
        sessionStorage.setItem(
          backupKey("project", meta.id),
          JSON.stringify({
            savedAt: new Date().toISOString(),
            fields: serializeForm(new FormData(form)),
          }),
        );
      } catch {
        // Storage blocked: reloading still shows the latest copy.
      }
    }
    await revalidator.revalidate();
    onReload?.();
  };

  const saveAndLeave = () => {
    setLeaveAfterSave(true);
    const form = editor.formRef.current;
    const save = form?.querySelector<HTMLButtonElement>(
      'button[name="intent"][value="save"]',
    );
    form?.requestSubmit(save ?? undefined);
  };

  // ---- Render --------------------------------------------------------------

  const errors = fieldErrorLookup(
    failure?.code === "slug_taken"
      ? [
          {
            field: "slug",
            code: "slug_taken",
            severity: "error",
            message: failure.message ?? "Another entry already uses this slug.",
          },
        ]
      : failure?.issues,
  );
  const archived = meta.status === "archived";
  const canPublish =
    !archived &&
    (meta.status === "draft" || meta.hasUnpublishedChanges || editor.dirty);
  const publishBase =
    meta.status === "published" ? "Publish changes" : "Publish";
  const publishLabel = blocking
    ? `${publishBase} · ${blocking} ${blocking === 1 ? "issue" : "issues"}`
    : publishBase;
  const previewUrl = previewSrc(data.urls.preview, "zh");
  const sections = PROJECT_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    dirty: dirtySections.has(section.id),
    issues: counts[section.id],
  }));

  return (
    <StudioPage
      title={displayTitle}
      breadcrumb={
        <Link className="studio-link" to="/studio/projects">
          Projects
        </Link>
      }
      status={
        <>
          <StatusBadge status={meta.status} />
          {meta.hasUnpublishedChanges ? <FlagBadge flag="CHANGES" /> : null}
          {meta.todoContent ? <FlagBadge flag="TODO_CONTENT" /> : null}
          {meta.featured ? <FlagBadge flag="FEATURED" /> : null}
          <SaveStateIndicator state={editor.state} />
        </>
      }
      actions={
        <div className="projects-editor__actions">
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={previewChanges}
            aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
          >
            Preview changes
          </button>
          {!previewOpen ? (
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact projects-editor__show-preview"
              onClick={() => setPreviewOpen(true)}
            >
              Show preview
            </button>
          ) : null}
          <IntentButton
            form={FORM_ID}
            intent="save"
            variant="secondary"
            pending={pendingIntent === "save"}
            pendingLabel="Saving…"
            aria-keyshortcuts="Control+S Meta+S"
          >
            Save
          </IntentButton>
          {canPublish ? (
            <IntentButton
              form={FORM_ID}
              intent="publish"
              variant="primary"
              disabled={meta.todoContent}
              pending={pendingIntent === "publish"}
              pendingLabel="Publishing…"
            >
              {publishLabel}
            </IntentButton>
          ) : null}
        </div>
      }
    >
      {editor.state.kind === "error" ? (
        <div className="projects-banner projects-banner--error" role="alert">
          <p className="projects-banner__text">
            {failure?.code === "invalid_content"
              ? "Some fields cannot be saved. They are marked below."
              : editor.state.message}
          </p>
          {failure?.code === "stale_revision" ? (
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              onClick={() => void reloadLatest()}
            >
              Reload latest
            </button>
          ) : (
            <IntentButton form={FORM_ID} intent="save" compact>
              Retry
            </IntentButton>
          )}
        </div>
      ) : null}

      {editor.backup ? (
        <div className="projects-banner" role="status">
          <p className="projects-banner__text">
            Unsaved changes from {clock(editor.backup.savedAt)} were found in
            this tab.
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

      {meta.hasUnpublishedChanges && data.changedSections.length > 0 ? (
        <p className="projects-changes">
          <span className="projects-changes__mark" aria-hidden="true" />
          Unpublished changes in{" "}
          {data.changedSections.map(sectionLabel).join(", ")}. The live page
          still shows the published version.
        </p>
      ) : null}

      <EditorLayout
        sections={sections}
        preview={
          previewOpen ? (
            <div className="projects-preview">
              <PreviewPane
                src={data.urls.preview}
                title={displayTitle}
                reloadKey={meta.revision}
                onHide={() => setPreviewOpen(false)}
              />
              <label className="projects-preview__live">
                <input
                  type="checkbox"
                  checked={livePreview}
                  onChange={(event) =>
                    setLivePreview(event.currentTarget.checked)
                  }
                />
                Update as I type
              </label>
            </div>
          ) : undefined
        }
      >
        <StudioForm
          id={FORM_ID}
          fetcher={fetcher as FetcherWithComponents<unknown>}
          ref={editor.formRef}
          onSubmit={guardPublish}
          noValidate
          className="projects-editor-form"
          aria-label={`Edit ${displayTitle}`}
        >
          <input type="hidden" name="expectedRevision" value={meta.revision} />
          <BasicSection meta={meta} content={content} errors={errors} />
          <MediaSection content={content} assets={data.assets} />
          <ClassificationSection
            content={content}
            terms={data.terms}
            music={data.music}
            errors={errors}
          />
          <CaseStudySection content={content} story={story} errors={errors} />
          <LinksSection content={content} />
          <CreditsSection content={content} />
          <PublicationSection
            data={data}
            issues={issues}
            pendingIntent={pendingIntent}
            previewUrl={previewUrl}
            checklistRef={checklistRef}
          />

          <div className="projects-editor__mobilebar">
            <span className="projects-editor__mobile-state" aria-hidden="true">
              {saveStateLabel(editor.state)}
            </span>
            <IntentButton
              intent="save"
              variant="primary"
              pending={pendingIntent === "save"}
              pendingLabel="Saving…"
            >
              Save
            </IntentButton>
            <details className="projects-editor__more">
              <summary className="studio-btn studio-btn--secondary">
                More
              </summary>
              <div className="projects-editor__more-panel">
                {canPublish ? (
                  <IntentButton
                    intent="publish"
                    variant="secondary"
                    disabled={meta.todoContent}
                  >
                    {publishLabel}
                  </IntentButton>
                ) : null}
                {meta.status === "published" ? (
                  <IntentButton intent="unpublish">Unpublish</IntentButton>
                ) : null}
                {archived ? (
                  <IntentButton intent="restore">Restore to draft</IntentButton>
                ) : (
                  <IntentButton intent="archive">Archive</IntentButton>
                )}
                <a
                  className="studio-btn studio-btn--ghost"
                  href={previewUrl}
                  target="_blank"
                  rel="noopener"
                >
                  Preview
                </a>
              </div>
            </details>
          </div>
        </StudioForm>
      </EditorLayout>

      {/* Native form for "Preview changes": posts into the preview frame. */}
      <form
        ref={posterRef}
        method="post"
        hidden
        aria-hidden="true"
        className="projects-poster"
      />

      <ConfirmDialog
        open={editor.blocker.state === "blocked"}
        title="Leave without saving?"
        onClose={() => {
          if (blockerRef.current.state === "blocked")
            blockerRef.current.reset();
        }}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => blockerRef.current.reset?.()}
            >
              Stay
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              aria-busy={leaveAfterSave || undefined}
              onClick={saveAndLeave}
            >
              {leaveAfterSave ? "Saving…" : "Save and leave"}
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => {
                editor.discardBackup();
                blockerRef.current.proceed?.();
              }}
            >
              Discard changes
            </button>
          </>
        }
      >
        <p>Your edits to “{displayTitle}” are not saved yet.</p>
      </ConfirmDialog>
    </StudioPage>
  );
}
