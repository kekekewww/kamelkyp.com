/**
 * Editor chrome shared by the Recognition and Writing editors (P3), built on
 * the foundation primitives (admin-architecture §4.4–4.10):
 *
 * - top bar: breadcrumb, status and flags, the four-state save indicator,
 *   Preview changes (Mod+Shift+Enter), Save (Mod+S) and Publish with its
 *   issue count; a sticky bottom bar on small screens;
 * - the live checklist (client model rules + server context rules), section
 *   issue counts and unsaved-section dots;
 * - result handling: toasts, "Archived · Undo", 409 "Reload latest",
 *   structural errors inline, Publish refused → checklist opens;
 * - the unsaved-changes guard dialog (Stay · Save and leave · Discard) and
 *   restoring a local backup, including block and media fields.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator } from "react-router";
import type { EntityMeta, ValidationIssue } from "../../../../lib/cms/types";
import { StudioPage } from "../../shell/studio-page";
import {
  ConfirmDialog,
  EditorLayout,
  EditorSection,
  FlagBadge,
  focusIssueField,
  PREVIEW_FRAME_NAME,
  PreviewPane,
  previewSrc,
  SaveStateIndicator,
  StatusBadge,
  StudioForm,
  saveStateLabel,
  useEditorForm,
  useStudioSession,
  useToast,
} from "../../ui";
import { countIssuesBySection, mergeIssues } from "./editorial";

type EditorResult =
  | {
      ok: true;
      intent?: string;
      saved?: boolean;
      published?: boolean;
      issues?: ValidationIssue[];
      copyId?: string;
      redirectTo?: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      issues?: ValidationIssue[];
    };

export type EditorContext = {
  /** The checklist for the current form. */
  issues: ValidationIssue[];
  /** Inline message for a field: structural save errors, or publish blockers after a publish attempt. */
  fieldError: (field: string, locale?: "zh" | "en") => string | undefined;
  /** Call after a change the form cannot see (block editor, media, new term). */
  notifyChange: () => void;
  pendingIntent: string | null;
  /** Props for an `EditorSection`. */
  section: (id: string) => {
    id: string;
    label: string;
    storageKey: string;
    defaultOpen: boolean;
  };
  /** Values restored from a local backup for widgets backed by hidden fields. */
  restored: (name: string) => string | undefined;
  /** Changes when a backup was restored (remount hidden-field widgets). */
  restoreEpoch: number;
};

type SectionDef = { readonly id: string; readonly label: string };

function serializeSection(form: HTMLFormElement, id: string): string {
  const section = form.querySelector(`#section-${CSS.escape(id)}`);
  if (!section) return "";
  const entries: string[] = [];
  for (const element of section.querySelectorAll(
    "input[name], textarea[name], select[name]",
  )) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) ||
      element.disabled
    ) {
      continue;
    }
    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio") &&
      !element.checked
    ) {
      continue;
    }
    entries.push(`${element.name}=${element.value}`);
  }
  return entries.join("\n");
}

function openSection(id: string) {
  const details = document.getElementById(`section-${id}`);
  if (details instanceof HTMLDetailsElement) details.open = true;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function EntryEditorFrame({
  type,
  typeLabel,
  listHref,
  meta,
  title,
  sections,
  defaultOpen,
  serverIssues,
  computeIssues,
  sectionOf,
  previewPath,
  liveUrls,
  onReset,
  onFieldInput,
  children,
}: {
  type: "recognition" | "writing";
  typeLabel: string;
  listHref: string;
  meta: EntityMeta;
  title: string;
  sections: readonly SectionDef[];
  /** Sections open on first visit (others remember their state). */
  defaultOpen: readonly string[];
  serverIssues: readonly ValidationIssue[];
  computeIssues: (formData: FormData) => ValidationIssue[];
  sectionOf: (field: string) => string;
  previewPath: string;
  liveUrls?: { zh: string; en: string } | null;
  /** Remounts the editor with the server copy (after revert / reload). */
  onReset: () => void;
  /** Runs before dirty tracking for every native input event. */
  onFieldInput?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: (context: EditorContext) => React.ReactNode;
}) {
  const fetcher = useFetcher<EditorResult>();
  const editor = useEditorForm({
    type,
    id: meta.id,
    updatedAt: meta.updatedAt,
    fetcher,
  });
  const toast = useToast();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { csrfToken } = useStudioSession();
  const formId = `${type}-editor-form`;
  const [clientIssues, setClientIssues] = useState<ValidationIssue[] | null>(
    null,
  );
  const [showBlockers, setShowBlockers] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [dirtySections, setDirtySections] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [restoredFields, setRestoredFields] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  // The saved time is shown after hydration: the server does not know the
  // owner's time zone, so rendering it there would not match the browser.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const saveState = hydrated
    ? editor.state
    : { ...editor.state, lastSavedAt: null };
  const sectionBaseline = useRef<Record<string, string>>({});
  const bypassGuard = useRef(false);
  const leaveAfterSave = useRef(false);
  const handled = useRef<unknown>(null);

  const issues = useMemo(
    () =>
      clientIssues
        ? mergeIssues(clientIssues, serverIssues)
        : [...serverIssues],
    [clientIssues, serverIssues],
  );
  const blocking = issues.filter((issue) => issue.severity === "error");
  const failed = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const structural = failed?.issues ?? [];

  const recompute = useCallback(() => {
    const form = editor.formRef.current;
    if (!form) return;
    setClientIssues(computeIssues(new FormData(form)));
    const dirty = new Set<string>();
    for (const section of sections) {
      if (
        serializeSection(form, section.id) !==
        (sectionBaseline.current[section.id] ?? "")
      ) {
        dirty.add(section.id);
      }
    }
    setDirtySections(dirty);
  }, [editor.formRef, computeIssues, sections]);

  const notifyChange = useCallback(() => {
    window.setTimeout(() => {
      editor.onInput();
      recompute();
    }, 0);
  }, [editor.onInput, recompute]);

  // Section baselines: on load and after every successful save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a save that changes nothing visible still re-baselines (updatedAt)
  useEffect(() => {
    if (editor.dirty) return;
    const form = editor.formRef.current;
    if (!form) return;
    sectionBaseline.current = Object.fromEntries(
      sections.map((section) => [
        section.id,
        serializeSection(form, section.id),
      ]),
    );
    setDirtySections(new Set());
  }, [editor.dirty, editor.formRef, sections, meta.updatedAt]);

  // Fresh server issues after a save: the client copy only matters while dirty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when the server copy changes
  useEffect(() => {
    if (editor.dirty) recompute();
    else setClientIssues(null);
  }, [serverIssues]);

  const submitIntent = useCallback(
    (intent: string, fields: Record<string, string> = {}) =>
      fetcher.submit(
        { csrfToken, intent, ...fields },
        { method: "post", preventScrollReset: true },
      ),
    [fetcher, csrfToken],
  );

  // Results → toasts, checklist, navigation.
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (!result.ok) {
      if (leaveAfterSave.current) {
        leaveAfterSave.current = false;
        if (editor.blocker.state === "blocked") editor.blocker.reset();
      }
      if (result.issues?.length) setShowBlockers(true);
      return;
    }
    setPreviewKey((key) => key + 1);
    switch (result.intent) {
      case "save":
        toast.show({ message: result.saved ? "Saved" : "No changes to save" });
        break;
      case "publish":
        if (result.published) {
          setShowBlockers(false);
          toast.show({
            message: "Published",
            action: liveUrls
              ? { label: "View live", href: liveUrls.zh }
              : undefined,
          });
        } else {
          const count = (result.issues ?? []).filter(
            (issue) => issue.severity === "error",
          ).length;
          setShowBlockers(true);
          openSection("publication");
          toast.show({
            tone: "info",
            message: `Saved. Publishing needs ${count} ${count === 1 ? "fix" : "fixes"}.`,
          });
        }
        break;
      case "unpublish":
        toast.show({ message: "Unpublished. It is no longer on the site." });
        break;
      case "archive":
        toast.show({
          message: "Archived",
          action: { label: "Undo", onAction: () => submitIntent("restore") },
        });
        break;
      case "restore":
        toast.show({ message: "Restored to draft" });
        break;
      case "revert":
        toast.show({ message: "Reverted to the published version" });
        onReset();
        return;
      case "duplicate":
        toast.show({
          message: "Duplicated as a draft",
          action: result.copyId
            ? { label: "Open copy", href: `${listHref}/${result.copyId}` }
            : undefined,
        });
        break;
      case "feature":
        toast.show({ message: "Featured on the homepage" });
        break;
      case "unfeature":
        toast.show({ message: "Removed from the homepage" });
        break;
      case "delete":
        bypassGuard.current = true;
        editor.discardBackup();
        toast.show({ message: "Deleted permanently" });
        navigate(result.redirectTo ?? listHref);
        return;
    }
    if (leaveAfterSave.current) {
      leaveAfterSave.current = false;
      if (editor.blocker.state === "blocked") editor.blocker.proceed();
    }
  }, [
    fetcher.state,
    fetcher.data,
    toast,
    navigate,
    editor,
    listHref,
    liveUrls,
    onReset,
    submitIntent,
  ]);

  // Our own navigation (after a delete) never asks "Leave without saving?".
  useEffect(() => {
    if (editor.blocker.state === "blocked" && bypassGuard.current) {
      editor.blocker.proceed();
    }
  }, [editor.blocker]);

  const previewChanges = useCallback(() => {
    const form = editor.formRef.current;
    if (!form) return;
    const frame = document.querySelector<HTMLIFrameElement>(
      `iframe[name="${PREVIEW_FRAME_NAME}"]`,
    );
    const inPane =
      previewOpen &&
      frame !== null &&
      window.matchMedia("(min-width: 1200px)").matches;
    const locale = frame?.src.includes("locale=en") ? "en" : "zh";
    // A detached native form: React Router's form handling never intercepts it.
    const target = document.createElement("form");
    target.method = "post";
    target.action = previewSrc(previewPath, locale);
    target.target = inPane ? PREVIEW_FRAME_NAME : "_blank";
    target.hidden = true;
    for (const [name, value] of new FormData(form)) {
      if (typeof value !== "string" || name === "intent") continue;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      target.appendChild(input);
    }
    document.body.appendChild(target);
    target.submit();
    target.remove();
  }, [editor.formRef, previewOpen, previewPath]);

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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent =
      submitter instanceof HTMLButtonElement ? submitter.value : null;
    if (intent === "publish" && blocking.length > 0) {
      event.preventDefault();
      setShowBlockers(true);
      openSection("publication");
      const first = blocking[0];
      if (first) {
        openSection(sectionOf(first.field));
        focusIssueField(first);
      }
      toast.show({
        tone: "error",
        message: `Publishing needs ${blocking.length} ${blocking.length === 1 ? "fix" : "fixes"}. The first one is selected.`,
      });
    }
  };

  const restoreBackup = () => {
    const backup = editor.backup;
    if (!backup) return;
    try {
      const entries = JSON.parse(backup.fields) as Array<[string, string]>;
      const hidden = new Map<string, string>();
      const form = editor.formRef.current;
      for (const [name, value] of entries) {
        const control = form?.querySelector(`[name="${CSS.escape(name)}"]`);
        if (
          control instanceof HTMLInputElement &&
          control.type === "hidden" &&
          name !== "expectedRevision"
        ) {
          hidden.set(name, value);
        }
      }
      setRestoredFields(hidden);
      setRestoreEpoch((epoch) => epoch + 1);
    } catch {
      // A malformed backup restores the visible fields only.
    }
    editor.restoreBackup();
    notifyChange();
  };

  const sectionInfo = sections.map((section) => ({
    ...section,
    dirty: dirtySections.has(section.id),
    issues: countIssuesBySection(blocking, sectionOf)[section.id] ?? 0,
  }));

  const visibleBlockers = showBlockers ? blocking : [];
  const fieldError = (field: string, locale?: "zh" | "en") =>
    [...structural, ...visibleBlockers].find(
      (issue) =>
        issue.severity === "error" &&
        issue.field === field &&
        (locale ? issue.locale === locale : !issue.locale),
    )?.message;

  const pendingIntent =
    fetcher.state !== "idle"
      ? ((fetcher.formData?.get("intent") as string | null) ?? null)
      : null;
  const canPublish =
    meta.status !== "archived" &&
    (meta.status === "draft" || meta.hasUnpublishedChanges || editor.dirty);
  const publishLabel =
    meta.status === "published" ? "Publish changes" : "Publish";
  const publishButton = (compact: boolean, inForm: boolean) =>
    canPublish ? (
      <button
        type="submit"
        name="intent"
        value="publish"
        form={inForm ? undefined : formId}
        className={`studio-btn studio-btn--primary${compact ? " studio-btn--compact" : ""}`}
        disabled={meta.todoContent}
        aria-busy={pendingIntent === "publish" || undefined}
        title={
          meta.todoContent
            ? "Seeded sample content cannot be published"
            : undefined
        }
      >
        {pendingIntent === "publish"
          ? "Publishing…"
          : blocking.length > 0 && !meta.todoContent
            ? `${publishLabel} · ${blocking.length} ${blocking.length === 1 ? "issue" : "issues"}`
            : publishLabel}
      </button>
    ) : null;

  const context: EditorContext = {
    issues,
    fieldError,
    notifyChange,
    pendingIntent,
    section: (id) => ({
      id,
      label: sections.find((section) => section.id === id)?.label ?? id,
      storageKey: `studio:sections:${type}`,
      defaultOpen: defaultOpen.includes(id),
    }),
    restored: (name) => restoredFields.get(name),
    restoreEpoch,
  };

  const leaving = editor.blocker.state === "blocked" && !bypassGuard.current;

  return (
    <StudioPage
      title={title}
      breadcrumb={<Link to={listHref}>{typeLabel}</Link>}
      status={
        <>
          <StatusBadge status={meta.status} />
          {meta.hasUnpublishedChanges ? <FlagBadge flag="CHANGES" /> : null}
          {meta.todoContent ? <FlagBadge flag="TODO_CONTENT" /> : null}
          {meta.featured ? <FlagBadge flag="FEATURED" /> : null}
          <SaveStateIndicator state={saveState} />
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact p3-wide-only"
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? "Hide preview" : "Show preview"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
            onClick={previewChanges}
          >
            Preview changes
          </button>
          <button
            type="submit"
            name="intent"
            value="save"
            form={formId}
            className="studio-btn studio-btn--secondary studio-btn--compact p3-topbar-save"
            aria-keyshortcuts="Control+S Meta+S"
            aria-busy={pendingIntent === "save" || undefined}
          >
            {pendingIntent === "save" ? "Saving…" : "Save"}
          </button>
          <span className="p3-topbar-publish">
            {publishButton(true, false)}
          </span>
        </>
      }
    >
      {editor.backup ? (
        <div className="p3-banner" role="status">
          <p>
            Unsaved changes from {clock(editor.backup.savedAt)} found in this
            tab.
          </p>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={restoreBackup}
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
      {editor.state.kind === "error" ? (
        <div className="p3-banner p3-banner--error" role="alert">
          <p>
            <strong>Not saved.</strong> {editor.state.message}
          </p>
          {failed?.code === "stale_revision" ? (
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              onClick={async () => {
                await revalidator.revalidate();
                onReset();
              }}
            >
              Reload latest
            </button>
          ) : null}
          {structural.length > 0 ? (
            <ul className="p3-banner__issues">
              {structural.map((issue) => (
                <li key={`${issue.field}-${issue.locale ?? ""}-${issue.code}`}>
                  <button
                    type="button"
                    className="studio-link"
                    onClick={() => {
                      openSection(sectionOf(issue.field));
                      focusIssueField(issue);
                    }}
                  >
                    {issue.field}
                    {issue.locale ? ` (${issue.locale.toUpperCase()})` : ""}:{" "}
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <EditorLayout
        sections={sectionInfo}
        preview={
          previewOpen ? (
            <PreviewPane
              src={previewPath}
              title={title}
              reloadKey={`${meta.updatedAt}-${previewKey}`}
              onHide={() => setPreviewOpen(false)}
            />
          ) : undefined
        }
      >
        <StudioForm
          fetcher={fetcher as never}
          ref={editor.formRef}
          id={formId}
          className="p3-editor-form"
          onInput={(event) => {
            onFieldInput?.(event);
            editor.onInput();
            recompute();
          }}
          onSubmit={onSubmit}
          noValidate
        >
          <input type="hidden" name="expectedRevision" value={meta.revision} />
          <div className="p3-mobilebar">
            <span className="p3-mobilebar__state" aria-hidden="true">
              {saveStateLabel(saveState)}
            </span>
            <button
              type="submit"
              name="intent"
              value="save"
              className="studio-btn studio-btn--secondary studio-btn--compact"
            >
              Save
            </button>
            {publishButton(true, true)}
            <a
              className="studio-btn studio-btn--ghost studio-btn--compact"
              href="#section-publication"
            >
              More
            </a>
          </div>
          {children(context)}
        </StudioForm>
      </EditorLayout>

      <ConfirmDialog
        open={leaving}
        title="Leave without saving?"
        onClose={() => {
          if (editor.blocker.state === "blocked" && !leaveAfterSave.current) {
            editor.blocker.reset();
          }
        }}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => editor.blocker.reset?.()}
            >
              Stay
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--primary studio-btn--compact"
              onClick={() => {
                leaveAfterSave.current = true;
                const form = editor.formRef.current;
                const save = form?.querySelector<HTMLButtonElement>(
                  'button[name="intent"][value="save"]',
                );
                form?.requestSubmit(save ?? undefined);
              }}
            >
              Save and leave
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => {
                editor.discardBackup();
                editor.blocker.proceed?.();
              }}
            >
              Discard changes
            </button>
          </>
        }
      >
        <p>Your edits to “{title}” are not saved yet.</p>
      </ConfirmDialog>
    </StudioPage>
  );
}

export { EditorSection };
