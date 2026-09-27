/**
 * Publication panel and validation checklist (admin-architecture §4.5, §4.9,
 * §4.10). Rendered inside the editor's `StudioForm`: every action is an
 * intent button, so Publish saves the working copy first and then publishes.
 */
import { useState } from "react";
import type { EntityMeta, ValidationIssue } from "../../../lib/cms/types";
import { FlagBadge, StatusBadge } from "./badges";
import { ConfirmDialog, TypeToConfirm } from "./confirm-dialog";
import { Checkbox } from "./fields";
import { IntentButton } from "./studio-form";

function formatStamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Focus the field an issue points to (opening its section). */
export function focusIssueField(issue: ValidationIssue) {
  const candidates = [
    issue.locale ? `${issue.field}.${issue.locale}` : null,
    issue.field,
    `${issue.field}:number`,
    `${issue.field}:bool`,
    `${issue.field}:json`,
  ].filter(Boolean) as string[];
  for (const name of candidates) {
    const element = document.querySelector<HTMLElement>(
      `[name="${CSS.escape(name)}"]:not([type="hidden"])`,
    );
    if (element) {
      const section = element.closest("details");
      if (section && !section.open) section.open = true;
      element.focus();
      element.scrollIntoView({ block: "center" });
      return;
    }
  }
}

/** Identical issues (same field, code, locale and message) are listed once. */
function uniqueIssues(
  issues: readonly ValidationIssue[],
): Array<[string, ValidationIssue]> {
  const byKey = new Map<string, ValidationIssue>();
  for (const issue of issues) {
    const key = [issue.field, issue.code, issue.locale ?? "", issue.message]
      .join("|")
      .toLowerCase();
    if (!byKey.has(key)) byKey.set(key, issue);
  }
  return [...byKey];
}

export function ValidationChecklist({
  issues,
}: {
  issues: readonly ValidationIssue[];
}) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  if (issues.length === 0) {
    return (
      <p className="studio-checklist__ok">Ready to publish: nothing missing.</p>
    );
  }
  return (
    <div className="studio-checklist">
      <p className="studio-checklist__summary">
        {errors.length === 0
          ? "Nothing blocks publishing."
          : `${errors.length} ${errors.length === 1 ? "issue blocks" : "issues block"} publishing`}
        {warnings.length > 0
          ? ` · ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`
          : ""}
      </p>
      <ul className="studio-checklist__list">
        {uniqueIssues([...errors, ...warnings]).map(([key, issue]) => (
          <li
            className={`studio-checklist__item studio-checklist__item--${issue.severity}`}
            key={key}
          >
            <button
              type="button"
              className="studio-checklist__link"
              onClick={() => focusIssueField(issue)}
            >
              <span className="studio-checklist__severity">
                {issue.severity === "error" ? "Blocks" : "Warning"}
              </span>
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicationPanel({
  meta,
  issues = [],
  liveUrls,
  previewUrl,
  pendingIntent,
}: {
  meta: EntityMeta;
  issues?: readonly ValidationIssue[];
  /** Public URLs when live: `{ zh, en }`. */
  liveUrls?: { zh: string; en: string } | null;
  previewUrl?: string;
  /** The intent currently submitting (button shows "Publishing…"). */
  pendingIntent?: string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const commission = Boolean(meta.commissionServiceId);
  const blocking = issues.filter((issue) => issue.severity === "error").length;
  const publishLabel =
    meta.status === "published" ? "Publish changes" : "Publish";
  const deletable = !commission && meta.status !== "published";
  const confirmation = meta.slug ?? "DELETE";

  return (
    <section className="studio-publication" aria-label="Publication">
      <div className="studio-publication__status">
        <StatusBadge status={meta.status} />
        {meta.status === "published" && meta.publishedAt ? (
          <span className="studio-publication__stamp">
            {formatStamp(meta.publishedAt)} UTC
          </span>
        ) : null}
        {meta.hasUnpublishedChanges ? <FlagBadge flag="CHANGES" /> : null}
        {meta.todoContent ? <FlagBadge flag="TODO_CONTENT" /> : null}
        {meta.featured ? <FlagBadge flag="FEATURED" /> : null}
        {meta.isShowreel ? <FlagBadge flag="SHOWREEL" /> : null}
      </div>

      {liveUrls && meta.status === "published" ? (
        <p className="studio-publication__links">
          View live{" "}
          <a href={liveUrls.zh} target="_blank" rel="noopener">
            ZH
          </a>{" "}
          <a href={liveUrls.en} target="_blank" rel="noopener">
            EN
          </a>
          {previewUrl ? (
            <>
              {" · "}
              <a href={previewUrl} target="_blank" rel="noopener">
                Preview
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {meta.todoContent ? (
        <div className="studio-publication__todo">
          <p>
            Seeded sample content. Replace the text, then clear the TODO_CONTENT
            flag.
          </p>
          <Checkbox
            name="clearTodoContent"
            label="This is real content"
            hint="Clears the TODO_CONTENT flag when you save."
          />
        </div>
      ) : null}

      <div className="studio-publication__actions">
        {meta.status !== "archived" &&
        (meta.status === "draft" || meta.hasUnpublishedChanges) ? (
          <IntentButton
            intent="publish"
            variant="primary"
            disabled={meta.todoContent}
            pending={pendingIntent === "publish"}
            pendingLabel="Publishing…"
            aria-describedby={blocking ? "studio-publish-issues" : undefined}
          >
            {publishLabel}
          </IntentButton>
        ) : null}
        {blocking > 0 && !meta.todoContent ? (
          <span
            className="studio-publication__count"
            id="studio-publish-issues"
          >
            {blocking} {blocking === 1 ? "issue" : "issues"}
          </span>
        ) : null}
        {meta.status === "published" && meta.hasUnpublishedChanges ? (
          <IntentButton intent="revert" variant="ghost" compact>
            Revert to published
          </IntentButton>
        ) : null}
        {meta.status === "published" ? (
          <IntentButton intent="unpublish" variant="secondary" compact>
            Unpublish
          </IntentButton>
        ) : null}
        {meta.status === "archived" ? (
          <IntentButton intent="restore" variant="secondary" compact>
            Restore to draft
          </IntentButton>
        ) : null}
        {meta.status !== "archived" && !commission ? (
          <IntentButton intent="archive" variant="ghost" compact>
            Archive
          </IntentButton>
        ) : null}
        {meta.status !== "archived" ? (
          <IntentButton intent="duplicate" variant="ghost" compact>
            Duplicate
          </IntentButton>
        ) : null}
      </div>

      {commission ? (
        <p className="studio-hint">
          This service is linked to the commission wizard. It cannot be archived
          or deleted; unpublishing also removes it from the commission choices.
          Its price comes from Pricing.
        </p>
      ) : null}

      {deletable ? (
        <details className="studio-danger">
          <summary className="studio-danger__summary">Danger zone</summary>
          <p className="studio-hint">
            Permanent delete removes this entry, its slug redirects, its
            homepage slot and its media usage records. It cannot be undone;
            archive keeps it recoverable.
          </p>
          <button
            type="button"
            className="studio-btn studio-btn--danger studio-btn--compact"
            onClick={() => setConfirmDelete(true)}
          >
            Delete permanently…
          </button>
          <ConfirmDialog
            open={confirmDelete}
            tone="danger"
            title="Delete permanently?"
            onClose={() => setConfirmDelete(false)}
            actions={
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            }
          >
            <TypeToConfirm
              expected={confirmation}
              label={
                meta.slug
                  ? "Type the slug to confirm"
                  : "Type DELETE to confirm"
              }
              confirmLabel="Delete permanently"
              submit
            />
          </ConfirmDialog>
        </details>
      ) : null}
    </section>
  );
}
