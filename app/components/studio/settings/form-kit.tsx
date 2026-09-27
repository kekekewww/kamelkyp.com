/**
 * Small pieces shared by the P4 screens (services editor, brand and site
 * settings, homepage control): the "Leave without saving?" dialog, toast
 * feedback for action results, inline issue lookup and the backup banner.
 */
import { useEffect, useRef } from "react";
import type { Blocker, FetcherWithComponents } from "react-router";
import type { ValidationIssue } from "../../../lib/cms/types";
import { ConfirmDialog, useToast } from "../ui";

export type ActionData = {
  ok?: boolean;
  code?: string;
  message?: string;
  issues?: ValidationIssue[];
  redirectTo?: string;
  reverted?: boolean;
  published?: boolean;
} | null;

/** Field errors keyed by dotted path; localized fields carry per-locale text. */
export type FieldErrors = Map<
  string,
  { message?: string; zh?: string; en?: string }
>;

export function fieldErrors(
  issues: readonly ValidationIssue[] | undefined,
): FieldErrors {
  const map: FieldErrors = new Map();
  for (const issue of issues ?? []) {
    if (issue.severity !== "error") continue;
    const entry = map.get(issue.field) ?? {};
    if (issue.locale) entry[issue.locale] ??= issue.message;
    else entry.message ??= issue.message;
    map.set(issue.field, entry);
  }
  return map;
}

/** First message for a field, locale-specific messages included. */
export function errorFor(errors: FieldErrors, field: string): string | null {
  const entry = errors.get(field);
  return entry ? (entry.message ?? entry.zh ?? entry.en ?? null) : null;
}

/** Toasts for every settled fetcher result that carries a message. */
export function useActionToasts(
  fetcher: FetcherWithComponents<unknown>,
  options: { errorsOnly?: boolean } = {},
) {
  const toast = useToast();
  const previous = useRef(fetcher.state);
  const { errorsOnly = false } = options;
  useEffect(() => {
    const settled = previous.current !== "idle" && fetcher.state === "idle";
    previous.current = fetcher.state;
    if (!settled) return;
    const data = fetcher.data as ActionData;
    if (!data?.message) return;
    if (data.ok === false) {
      toast.show({ message: data.message, tone: "error" });
    } else if (!errorsOnly) {
      toast.show({ message: data.message, tone: "success" });
    }
  }, [fetcher.state, fetcher.data, toast, errorsOnly]);
}

/**
 * "Leave without saving?" for a blocked navigation: Stay, Save and leave,
 * Discard. `onSaveAndLeave` submits the form; the caller proceeds after a
 * successful save.
 */
export function LeaveGuard({
  blocker,
  onSaveAndLeave,
}: {
  blocker: Blocker;
  onSaveAndLeave?: () => void;
}) {
  const open = blocker.state === "blocked";
  return (
    <ConfirmDialog
      open={open}
      title="Leave without saving?"
      onClose={() => {
        if (blocker.state === "blocked") blocker.reset();
      }}
      actions={
        <>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            Stay
          </button>
          {onSaveAndLeave ? (
            <button
              type="button"
              className="studio-btn studio-btn--primary studio-btn--compact"
              onClick={onSaveAndLeave}
            >
              Save and leave
            </button>
          ) : null}
          <button
            type="button"
            className="studio-btn studio-btn--danger studio-btn--compact"
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
          >
            Discard
          </button>
        </>
      }
    >
      <p>Your changes on this page are not saved yet.</p>
    </ConfirmDialog>
  );
}

/** Offer to restore a local backup newer than the server copy. */
export function BackupBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(savedAt));
  return (
    <div className="studio-kit-banner" role="status">
      <p className="studio-kit-banner__text">
        Unsaved changes from {time} found.
      </p>
      <button
        type="button"
        className="studio-btn studio-btn--secondary studio-btn--compact"
        onClick={onRestore}
      >
        Restore
      </button>
      <button
        type="button"
        className="studio-btn studio-btn--ghost studio-btn--compact"
        onClick={onDiscard}
      >
        Discard
      </button>
    </div>
  );
}

/** Message under the top bar while the save state is Error. */
export function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="studio-kit-error" role="alert">
      {message}
    </p>
  );
}
