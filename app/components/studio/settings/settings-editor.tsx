/**
 * Frame for the Brand and Site settings screens: one form, a section index,
 * the four-state save indicator, Mod+S, the unsaved-changes guard and the
 * local backup. Settings have no draft state, so Save says it goes live.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { StudioPage } from "../shell/studio-page";
import {
  EditorLayout,
  type EditorSectionInfo,
  IntentButton,
  SaveStateIndicator,
  StudioForm,
  useEditorForm,
} from "../ui";
import {
  type ActionData,
  BackupBanner,
  type FieldErrors,
  fieldErrors,
  LeaveGuard,
  SaveError,
  useActionToasts,
} from "./form-kit";

const STATE_WORD = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Error",
} as const;

export function SettingsEditor({
  title,
  formId,
  backupType,
  revision,
  updatedAt,
  sections,
  sectionOf,
  children,
}: {
  title: string;
  formId: string;
  /** sessionStorage backup namespace, e.g. `brand-settings`. */
  backupType: string;
  revision: number;
  updatedAt: string | null;
  sections: readonly EditorSectionInfo[];
  /** Section id for an issue's field (issue counts in the index). */
  sectionOf?: (field: string) => string | null;
  children: (context: {
    errors: FieldErrors;
    pendingIntent: string | null;
  }) => React.ReactNode;
}) {
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const editor = useEditorForm({
    type: backupType,
    id: "settings",
    updatedAt,
    fetcher,
  });
  useActionToasts(fetcher);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const saveAndLeaveTarget = useRef<string | null>(null);
  const result = fetcher.state === "idle" ? fetcher.data : null;
  const errors = fieldErrors(result?.issues);
  const pendingIntent =
    fetcher.state !== "idle"
      ? (fetcher.formData?.get("intent") as string | null)
      : null;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (saveAndLeaveTarget.current) {
      if (fetcher.data.ok) setLeaveTo(saveAndLeaveTarget.current);
      saveAndLeaveTarget.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (leaveTo && !editor.dirty) {
      setLeaveTo(null);
      navigate(leaveTo);
    }
  }, [leaveTo, editor.dirty, navigate]);

  return (
    <StudioPage
      title={title}
      breadcrumb={<Link to="/studio/settings">Settings</Link>}
      status={<SaveStateIndicator state={editor.state} />}
      actions={
        <>
          <span className="studio-kit-live">
            Saving applies it to the live site
          </span>
          <IntentButton
            intent="save"
            form={formId}
            variant="primary"
            compact
            pending={pendingIntent === "save"}
            pendingLabel="Saving…"
          >
            Save
          </IntentButton>
        </>
      }
    >
      <SaveError
        message={editor.state.kind === "error" ? editor.state.message : null}
      />
      {editor.backup ? (
        <BackupBanner
          savedAt={editor.backup.savedAt}
          onRestore={editor.restoreBackup}
          onDiscard={editor.discardBackup}
        />
      ) : null}
      <EditorLayout
        sections={sections.map((section) => ({
          ...section,
          issues: sectionOf
            ? [...errors.keys()].filter(
                (field) => sectionOf(field) === section.id,
              ).length
            : 0,
        }))}
      >
        <StudioForm
          id={formId}
          fetcher={fetcher}
          ref={editor.formRef}
          onInput={editor.onInput}
          onChange={editor.onInput}
          className="studio-settings-form"
          aria-label={title}
        >
          <input
            type="hidden"
            name="expectedRevision"
            value={String(revision)}
          />
          {children({ errors, pendingIntent })}
          <div className="studio-kit-footer" data-state={editor.state.kind}>
            <span className="studio-kit-footer__state" aria-hidden="true">
              {STATE_WORD[editor.state.kind]}
            </span>
            <span className="studio-hint">Save — goes live immediately</span>
            <IntentButton
              intent="save"
              variant="primary"
              compact
              pending={pendingIntent === "save"}
              pendingLabel="Saving…"
            >
              Save
            </IntentButton>
          </div>
        </StudioForm>
      </EditorLayout>
      <LeaveGuard
        blocker={editor.blocker}
        onSaveAndLeave={() => {
          const form = editor.formRef.current;
          const button = form?.querySelector<HTMLButtonElement>(
            'button[name="intent"][value="save"]',
          );
          if (editor.blocker.state === "blocked") {
            const { pathname, search, hash } = editor.blocker.location;
            saveAndLeaveTarget.current = `${pathname}${search}${hash}`;
            editor.blocker.reset();
          }
          form?.requestSubmit(button ?? undefined);
        }}
      />
    </StudioPage>
  );
}

/** "2026-09-24" from an ISO time (UTC, deterministic across server and client). */
export function isoDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Localized error pair for a `{zh, en}` field. */
export function localizedErrors(
  errors: FieldErrors,
  field: string,
): Partial<Record<"zh" | "en", string>> | undefined {
  const entry = errors.get(field);
  if (!entry) return undefined;
  return { zh: entry.zh ?? entry.message, en: entry.en ?? entry.message };
}
