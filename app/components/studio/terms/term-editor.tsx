/**
 * `/studio/services/terms/:documentId/:locale` (wp2 §4.5, §4.9): CLAUSES,
 * PUBLICATION and HISTORY of one legal document in one language.
 *
 * - Save (or Mod+S) stores the server draft; drafts survive reloads and are
 *   never public. "Preview changes" posts the unsaved form into the real
 *   public page for this editor's language (nothing is written).
 * - Publish needs the legal-review checkbox and no blocking issue; the
 *   server checks both again. Publishing takes effect at once.
 * - The checklist and the expected-outline marks follow the rows on screen
 *   (empty rows count, as the field errors do). The personal-name warning
 *   is server-only: it is shown for the saved text, and the server holds
 *   back a publish of edited text that carries one until it was shown.
 * - Adding, removing or moving a clause changes no input event, so a
 *   MutationObserver marks the form dirty; "Start over" options, "Use as
 *   starting point" and a backup restore rebuild the clause list.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FetcherWithComponents,
  Link,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";
import type {
  TermEditorData,
  TermVersionSummary,
} from "../../../lib/cms/repositories/terms.server";
import {
  parseDraftClauses,
  readDraftClauseRows,
  TERM_LIMITS,
  type TermDraftClause,
  validateTermClausesForPublish,
} from "../../../lib/cms/schemas/term-draft";
import type { ValidationIssue } from "../../../lib/cms/types";
import { formatTaipei } from "../../../lib/time/taipei";
import {
  type ActionData,
  BackupBanner,
  fieldErrors,
  LeaveGuard,
  SaveError,
  useActionToasts,
} from "../settings/form-kit";
import { StudioPage } from "../shell/studio-page";
import {
  ConfirmDialog,
  EditorLayout,
  EditorSection,
  focusIssueField,
  IntentButton,
  ListEditor,
  PREVIEW_FRAME_NAME,
  PreviewPane,
  previewSrc,
  SaveStateIndicator,
  StudioForm,
  serializeForm,
  useEditorForm,
  useStudioSession,
  ValidationChecklist,
} from "../ui";
import { ClauseFields } from "./clause-fields";
import { LegalReview } from "./legal-review";
import { TermHistory } from "./term-history";

const FORM_ID = "term-editor";
const SECTION_KEY = "studio:sections:term";

type TermActionData = ActionData & {
  revision?: number;
  versionNumber?: number;
  discarded?: boolean;
};

const isError = (issue: ValidationIssue) => issue.severity === "error";

/** Issues only the server can compute (its personal-name list). */
const isServerOnly = (issue: ValidationIssue) => issue.code === "brand_name";

/**
 * A server issue on stored clause `i` belongs to editor row `rows[i]`: the
 * saved draft has no empty rows, the form on screen may.
 */
function toEditorRow(
  issue: ValidationIssue,
  rows: readonly number[],
): ValidationIssue {
  const match = /^clauses\.(\d+)(\..+)?$/.exec(issue.field);
  if (!match) return issue;
  const row = rows[Number(match[1])];
  return row === undefined
    ? issue
    : { ...issue, field: `clauses.${row}${match[2] ?? ""}` };
}

/** What the last check of the form on screen found. */
type FormCheck = {
  issues: ValidationIssue[];
  /** Keys typed in the clause rows. */
  keys: string[];
  /** Editor row of each non-empty clause. */
  rows: number[];
};

/** The preview column exists from 1200 px (admin-architecture §4.4). */
const previewWide = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 1200px)").matches;

const blankClause = (): TermDraftClause => ({ key: "", title: "", text: "" });

/** Clause rows of a serialized backup (`[name, value]` entries). */
function clausesFromBackup(fields: string): TermDraftClause[] | null {
  try {
    const entries = JSON.parse(fields) as Array<[string, string]>;
    const formData = new FormData();
    for (const [name, value] of entries) formData.append(name, value);
    return readDraftClauseRows(formData);
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` when list rows are added, removed or moved (React state
 * that fires no input event). Only child-list changes are observed: React
 * rewrites an input's `name` on every update, so watching attributes would
 * loop. The handler runs after the current event, and only when the form's
 * content actually changed.
 */
function useListWatch(
  ref: React.RefObject<HTMLDivElement | null>,
  onChange: () => void,
  resetKey: string,
) {
  const handler = useRef(onChange);
  handler.current = onChange;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach after a remount
  useEffect(() => {
    const node = ref.current;
    const form = node?.closest("form");
    if (!node || !form) return;
    let last = serializeForm(new FormData(form));
    let timer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const current = serializeForm(new FormData(form));
        if (current === last) return;
        last = current;
        handler.current();
      }, 0);
    });
    observer.observe(node, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ref, resetKey]);
}

function PublishButton({
  label,
  pending,
  onClick,
}: {
  label: string;
  pending: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <IntentButton
      intent="publish-term-version"
      form={FORM_ID}
      variant="primary"
      compact
      pending={pending}
      pendingLabel="Publishing…"
      onClick={onClick}
    >
      {label}
    </IntentButton>
  );
}

type Pending = { kind: "start"; clauses: TermDraftClause[] } | null;

export function TermEditor({ data }: { data: TermEditorData }) {
  const { document, locale, otherLocale, live, draft, history } = data;
  const tag = locale.toUpperCase();
  const otherTag = otherLocale.toUpperCase();
  const fetcher = useFetcher<TermActionData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { csrfToken } = useStudioSession();
  const editor = useEditorForm({
    type: "term-draft",
    id: `${document.id}:${locale}`,
    updatedAt: draft?.updatedAt ?? live?.createdAt ?? null,
    fetcher: fetcher as FetcherWithComponents<unknown>,
  });
  useActionToasts(fetcher as FetcherWithComponents<unknown>);

  const [generation, setGeneration] = useState(0);
  const [reloading, setReloading] = useState(false);
  // The clause list is rebuilt (remounted) when the published version or
  // the existence of the draft changes, when the owner starts over, and on
  // "Reload latest"; never on an ordinary save.
  const formKey = [
    live?.id ?? "none",
    draft ? "draft" : "live",
    generation,
    reloading ? (draft?.updatedAt ?? "") : "",
  ].join(":");
  const [start, setStart] = useState<{
    clauses: TermDraftClause[];
    forKey: string;
  } | null>(null);
  const afterMount = useRef<"dirty" | "restore" | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [legalKey, setLegalKey] = useState(0);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [formCheck, setFormCheck] = useState<FormCheck | null>(null);
  // 409 results whose "Reload latest" was clicked (fetcher data outlives a
  // reload).
  const [dismissed, setDismissed] = useState<unknown>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const saveAndLeave = useRef<string | null>(null);
  const legalRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLFormElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  const startClauses =
    start?.forKey === formKey
      ? start.clauses
      : (draft?.clauses ?? live?.clauses ?? []);

  const baseOutdated =
    draft && live && draft.baseVersionId !== live.id
      ? {
          baseVersionNumber:
            history.find((version) => version.id === draft.baseVersionId)
              ?.versionNumber ?? null,
          liveVersionNumber: live.versionNumber,
        }
      : null;

  const check = useCallback(() => {
    const form = editor.formRef.current;
    if (!form) return;
    const rows = readDraftClauseRows(new FormData(form));
    const parsed = parseDraftClauses(rows);
    setFormCheck({
      issues: parsed.ok
        ? validateTermClausesForPublish(
            parsed.clauses,
            {
              live: live?.clauses ?? null,
              expected: data.expected,
              activePrice: data.activeAmounts,
              baseOutdated,
            },
            parsed.rows,
          )
        : parsed.issues,
      keys: rows.map((row) => row.key.trim()).filter(Boolean),
      rows: parsed.ok ? parsed.rows : [],
    });
  }, [editor.formRef, live, data.expected, data.activeAmounts, baseOutdated]);

  const onChange = useCallback(() => {
    editor.onInput();
    check();
  }, [editor, check]);

  useListWatch(listRef, onChange, formKey);

  // After a (re)mount: mark the replaced content as an edit, restore the
  // backup into the rebuilt rows, or check the rows now on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mount
  useEffect(() => {
    const action = afterMount.current;
    afterMount.current = null;
    if (action === "restore") editor.restoreBackup();
    else if (action === "dirty") onChange();
    else check();
  }, [formKey]);

  // New loader data: "Reload latest" ends, and the check uses the new
  // live version, outline and prices.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on new loader data
  useEffect(() => {
    if (reloading) setReloading(false);
    check();
  }, [data]);

  // React to each settled action result once (keyed on its identity).
  const handled = useRef<unknown>(null);
  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || result === handled.current) {
      return;
    }
    handled.current = result;
    if (result.ok && result.published) {
      setLegalKey((key) => key + 1);
      setLegalError(null);
    }
    if (result.ok && result.published === false) {
      checklistRef.current?.focus();
    }
    if (result.ok === false && result.code === "legal_review_required") {
      setLegalError(result.message ?? null);
      legalRef.current?.focus();
    }
    if (saveAndLeave.current) {
      if (result.ok) setLeaveTo(saveAndLeave.current);
      saveAndLeave.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (leaveTo && !editor.dirty) {
      setLeaveTo(null);
      navigate(leaveTo);
    }
  }, [leaveTo, editor.dirty, navigate]);

  const rebuild = useCallback(
    (clauses: TermDraftClause[], then: "dirty" | "restore") => {
      const next = generation + 1;
      const nextKey = [
        live?.id ?? "none",
        draft ? "draft" : "live",
        next,
        reloading ? (draft?.updatedAt ?? "") : "",
      ].join(":");
      afterMount.current = then;
      setStart({ clauses, forKey: nextKey });
      setGeneration(next);
    },
    [generation, live, draft, reloading],
  );

  const requestStart = useCallback(
    (clauses: TermDraftClause[]) => {
      if (editor.dirty) setPending({ kind: "start", clauses });
      else rebuild(clauses, "dirty");
    },
    [editor.dirty, rebuild],
  );

  // The rows on screen, checked as typed; when they are the saved text, the
  // server's personal-name warnings for it are added.
  const issues =
    formCheck === null
      ? data.issues
      : editor.dirty
        ? formCheck.issues
        : [
            ...formCheck.issues,
            ...data.issues
              .filter(isServerOnly)
              .map((issue) => toEditorRow(issue, formCheck.rows)),
          ];
  const blocking = issues.filter(isError);
  const result = fetcher.state === "idle" ? fetcher.data : null;
  const errors = fieldErrors(
    result && result.ok === false ? (result.issues as ValidationIssue[]) : [],
  );
  const isPending = fetcher.state !== "idle";
  const pendingIntent = isPending
    ? ((fetcher.formData?.get("intent") as string | null) ?? null)
    : null;

  const onPublishClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const first = blocking[0];
    if (first) {
      event.preventDefault();
      const section = window.document.getElementById("section-publication");
      if (section instanceof HTMLDetailsElement) section.open = true;
      focusIssueField(first);
      if (!window.document.activeElement?.closest("form")) {
        checklistRef.current?.focus();
      }
      return;
    }
    if (!legalRef.current?.checked) {
      event.preventDefault();
      const section = window.document.getElementById("section-publication");
      if (section instanceof HTMLDetailsElement) section.open = true;
      setLegalError(
        "Confirm that a qualified legal professional has reviewed this version.",
      );
      legalRef.current?.focus();
    }
  };

  /** Posts the unsaved form into the preview (nothing is stored). */
  const previewChanges = () => {
    const form = editor.formRef.current;
    const poster = posterRef.current;
    if (!form || !poster) return;
    poster.action = previewSrc(`/studio/preview/terms/${document.id}`, locale);
    poster.target = previewWide() ? PREVIEW_FRAME_NAME : "_blank";
    const inputs = [...new FormData(form).entries()].flatMap(
      ([name, value]) => {
        if (typeof value !== "string" || name === "intent") return [];
        const input = window.document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        return [input];
      },
    );
    poster.replaceChildren(...inputs);
    poster.submit();
    poster.replaceChildren();
  };

  const discard = () => {
    const formData = new FormData();
    formData.set("csrfToken", csrfToken);
    formData.set("intent", "discard-draft");
    formData.set("expectedRevision", String(draft?.revision ?? 0));
    fetcher.submit(formData, { method: "post" });
  };

  const publishLabel =
    blocking.length > 0
      ? `Publish · ${blocking.length} ${blocking.length === 1 ? "issue" : "issues"}`
      : `Publish ${tag} version`;
  const stale =
    result?.ok === false &&
    result.code === "stale_revision" &&
    result !== dismissed;
  const presentKeys = new Set(
    formCheck?.keys ?? startClauses.map((clause) => clause.key),
  );
  const diff = data.diff;
  const clauseIssues = issues.filter(
    (issue) => isError(issue) && issue.field.startsWith("clauses."),
  ).length;

  return (
    <StudioPage
      title={`${document.label} · ${tag}`}
      breadcrumb={<Link to="/studio/services/terms">Terms</Link>}
      status={
        <>
          <span className="studio-badge studio-term-status">
            {live ? `LIVE v${live.versionNumber}` : "NOT PUBLISHED"}
          </span>
          {draft ? (
            <span className="studio-badge studio-flag studio-flag--changes">
              DRAFT
            </span>
          ) : null}
          <SaveStateIndicator state={editor.state} />
        </>
      }
      actions={
        <>
          <Link
            className="studio-btn studio-btn--ghost studio-btn--compact"
            to={`/studio/services/terms/${document.id}/${otherLocale}`}
          >
            Switch to {otherTag}
          </Link>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={previewChanges}
          >
            Preview changes
          </button>
          <IntentButton
            intent="save"
            form={FORM_ID}
            compact
            pending={pendingIntent === "save"}
            pendingLabel="Saving…"
          >
            Save
          </IntentButton>
          <PublishButton
            label={publishLabel}
            pending={pendingIntent === "publish-term-version"}
            onClick={onPublishClick}
          />
        </>
      }
    >
      <SaveError
        message={editor.state.kind === "error" ? editor.state.message : null}
      />
      {stale ? (
        <p className="studio-kit-banner">
          <span className="studio-kit-banner__text">
            Your edits are not saved. Reload to see the latest saved version.
          </span>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={() => {
              setDismissed(result);
              setReloading(true);
              revalidator.revalidate();
            }}
          >
            Reload latest
          </button>
        </p>
      ) : null}
      {baseOutdated ? (
        <p className="studio-kit-banner">
          <span className="studio-kit-banner__text">
            {baseOutdated.baseVersionNumber === null
              ? `This draft started before any version was published; v${baseOutdated.liveVersionNumber} has been published since. Compare before publishing.`
              : `This draft started from v${baseOutdated.baseVersionNumber}; v${baseOutdated.liveVersionNumber} has been published since. Compare before publishing.`}
          </span>
        </p>
      ) : null}
      {editor.backup ? (
        <BackupBanner
          savedAt={editor.backup.savedAt}
          onRestore={() => {
            const backup = editor.backup;
            const clauses = backup ? clausesFromBackup(backup.fields) : null;
            if (clauses) rebuild(clauses, "restore");
            else editor.restoreBackup();
          }}
          onDiscard={editor.discardBackup}
        />
      ) : null}
      <EditorLayout
        sections={[
          { id: "clauses", label: "Clauses", issues: clauseIssues },
          {
            id: "publication",
            label: "Publication",
            issues: blocking.length - clauseIssues,
          },
          { id: "history", label: "History" },
        ]}
        preview={
          <PreviewPane
            src={`/studio/preview/terms/${document.id}`}
            title={`${document.label} · ${tag}`}
            defaultLocale={locale}
            reloadKey={`${live?.id ?? "none"}:${draft?.revision ?? 0}`}
          />
        }
      >
        <StudioForm
          key={formKey}
          id={FORM_ID}
          fetcher={fetcher as FetcherWithComponents<unknown>}
          ref={editor.formRef}
          onInput={onChange}
          onChange={onChange}
          className="studio-term-form"
          aria-label={`${document.label} (${tag})`}
        >
          <input
            type="hidden"
            name="expectedRevision"
            value={String(draft?.revision ?? 0)}
          />
          <input type="hidden" name="locale" value={locale} />
          <EditorSection
            id="clauses"
            label="Clauses"
            defaultOpen
            storageKey={SECTION_KEY}
          >
            <div ref={listRef}>
              <ListEditor
                name="clauses"
                label={`Clauses (${tag})`}
                items={startClauses}
                create={blankClause}
                addLabel="Add clause"
                max={TERM_LIMITS.clauses}
                itemLabel={(index) => `clause ${index + 1}`}
                renderItem={(clause, index, field) => (
                  <ClauseFields
                    clause={clause}
                    index={index}
                    locale={locale}
                    field={field}
                    errors={errors}
                  />
                )}
              />
            </div>
            <details className="studio-term-start">
              <summary className="studio-term-start__summary">
                Start over
              </summary>
              <div className="studio-term-start__options">
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact"
                  onClick={() => requestStart([])}
                >
                  Start blank
                </button>
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact"
                  disabled={data.otherLocaleKeys.length === 0}
                  onClick={() =>
                    requestStart(
                      data.otherLocaleKeys.map((key) => ({
                        key,
                        title: "",
                        text: "",
                      })),
                    )
                  }
                >
                  Copy clause keys from {otherTag} (titles and text empty)
                </button>
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact"
                  disabled={data.expected.length === 0}
                  onClick={() =>
                    requestStart(
                      data.expected.map((item) => ({
                        key: item.key,
                        title: "",
                        text: "",
                      })),
                    )
                  }
                >
                  Start from the expected outline (keys only)
                </button>
              </div>
            </details>
          </EditorSection>

          <EditorSection
            id="publication"
            label="Publication"
            defaultOpen
            storageKey={SECTION_KEY}
          >
            <p className="studio-term-live">
              {live
                ? `Live: v${live.versionNumber} since ${formatTaipei(live.effectiveFrom ?? live.createdAt)} (Taipei)${data.liveEffective ? "" : ", not yet effective"}.`
                : "Not published yet. Publishing creates v1."}
            </p>
            <p className="studio-term-diff">
              {diff
                ? `${diff.changed.length} changed · ${diff.added.length} new · ${diff.removed.length} removed`
                : "No draft: the editor shows the live version."}
            </p>
            <div
              className="studio-term-checklist"
              ref={checklistRef}
              tabIndex={-1}
            >
              <ValidationChecklist issues={issues} />
            </div>
            {data.expected.length > 0 ? (
              <div className="studio-term-outline">
                <p className="studio-section-label">Expected clauses</p>
                <ul className="studio-term-outline__list">
                  {data.expected.map((item) => (
                    <li
                      className="studio-term-outline__item"
                      key={item.key}
                      data-present={presentKeys.has(item.key) ? "" : undefined}
                    >
                      <code>{item.key}</code> {item.topic}
                      <span className="studio-term-outline__mark">
                        {presentKeys.has(item.key) ? "present" : "missing"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="studio-hint">
                  Missing clauses are warnings: your legal reviewer has the last
                  word.
                </p>
              </div>
            ) : null}
            <LegalReview
              key={legalKey}
              ref={legalRef}
              error={legalError}
              onChange={() => setLegalError(null)}
            />
            <p className="studio-hint">
              Publishing takes effect immediately for new commissions. Submitted
              cases keep the version their client accepted. A visitor who
              already has the form open cannot submit with the old version; they
              see an error and must reload the page to read and accept the new
              one.
            </p>
            <div className="studio-kit-footer studio-term-form__footer">
              <IntentButton
                intent="save"
                compact
                pending={pendingIntent === "save"}
                pendingLabel="Saving…"
              >
                Save
              </IntentButton>
              <PublishButton
                label={publishLabel}
                pending={pendingIntent === "publish-term-version"}
                onClick={onPublishClick}
              />
            </div>
            {draft ? (
              <details className="studio-danger">
                <summary className="studio-danger__summary">
                  Danger zone
                </summary>
                <p className="studio-hint">
                  Discarding deletes the draft. The live version stays as it is.
                </p>
                <button
                  type="button"
                  className="studio-btn studio-btn--danger studio-btn--compact"
                  onClick={() => setConfirmDiscard(true)}
                >
                  Discard draft
                </button>
              </details>
            ) : null}
          </EditorSection>
        </StudioForm>
        <EditorSection
          id="history"
          label="History"
          defaultOpen
          storageKey={SECTION_KEY}
        >
          <TermHistory
            history={history}
            locale={locale}
            onUseAsStart={(version: TermVersionSummary) =>
              requestStart(
                version.clauses.map(({ key, title, text }) => ({
                  key,
                  title,
                  text,
                })),
              )
            }
          />
        </EditorSection>
      </EditorLayout>

      {/* Native form for "Preview changes": posts into the preview frame. */}
      <form
        ref={posterRef}
        method="post"
        hidden
        aria-hidden="true"
        className="studio-term-poster"
      />

      <ConfirmDialog
        open={pending !== null}
        title="Replace the editor content?"
        onClose={() => setPending(null)}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => setPending(null)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => {
                if (pending) rebuild(pending.clauses, "dirty");
                setPending(null);
              }}
            >
              Replace
            </button>
          </>
        }
      >
        <p>Unsaved edits are lost.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this draft?"
        tone="danger"
        onClose={() => setConfirmDiscard(false)}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep the draft
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger-filled studio-btn--compact"
              onClick={() => {
                setConfirmDiscard(false);
                discard();
              }}
            >
              Discard draft
            </button>
          </>
        }
      >
        <p>The live version stays as it is.</p>
      </ConfirmDialog>
      <LeaveGuard
        blocker={editor.blocker}
        onSaveAndLeave={() => {
          const form = editor.formRef.current;
          const button = form?.querySelector<HTMLButtonElement>(
            'button[name="intent"][value="save"]',
          );
          if (editor.blocker.state === "blocked") {
            const { pathname, search, hash } = editor.blocker.location;
            saveAndLeave.current = `${pathname}${search}${hash}`;
            editor.blocker.reset();
          }
          form?.requestSubmit(button ?? undefined);
        }}
      />
    </StudioPage>
  );
}
