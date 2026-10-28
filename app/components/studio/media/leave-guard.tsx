/**
 * "Leave without saving?" (admin-architecture §4.7) for editors built on
 * `useEditorForm`: Stay · Save and leave · Discard. Save and leave submits the
 * editor's save intent and continues once the save succeeds; when the
 * browser refuses a field and sends nothing, the dialog names the field and
 * stays usable.
 */
import { useEffect, useState } from "react";
import type { Blocker } from "react-router";
import { ConfirmDialog } from "../ui/confirm-dialog";
import type { SaveState } from "../ui/editor-state";
import { findIntentButton } from "../ui/use-editor-form";

export type LeaveGuardStep = "wait" | "proceed" | "reset";

/**
 * What "Save and leave" does next. `clicked` is the save state the owner saw
 * when clicking; the reducer answers every submission with a new object, so
 * only a different object can be this save's result: SAVED leaves, ERROR
 * stays on the page. The state at the click is never the answer, also when
 * it is the ERROR of an earlier failed save.
 */
export function leaveGuardStep(
  clicked: SaveState,
  current: SaveState,
): LeaveGuardStep {
  if (current === clicked) return "wait";
  if (current.kind === "saved") return "proceed";
  if (current.kind === "error") return "reset";
  return "wait";
}

/** What "Save and leave" needs of the editor form. */
export interface SaveForm {
  addEventListener(
    type: "submit",
    listener: () => void,
    capture: boolean,
  ): void;
  removeEventListener(
    type: "submit",
    listener: () => void,
    capture: boolean,
  ): void;
  requestSubmit(submitter?: HTMLElement): void;
}

/**
 * Submits the save and tells whether the browser sent it. Constraint
 * validation (12.5 in a whole-seconds field, say) stops `requestSubmit`
 * before any submit event, so no save starts and no save state answers;
 * behind the modal dialog the invalid field is inert, so the browser shows
 * no message either. The caller says so instead of waiting.
 */
export function requestSave(form: SaveForm, submitter?: HTMLElement): boolean {
  let sent = false;
  const mark = () => {
    sent = true;
  };
  form.addEventListener("submit", mark, true);
  try {
    form.requestSubmit(submitter);
  } finally {
    form.removeEventListener("submit", mark, true);
  }
  return sent;
}

/** The dialog's line when the browser kept the save from starting. */
export function unsentMessage(label: string | null | undefined): string {
  const name = label?.trim();
  return `${name ? `“${name}”` : "A field"} has a value this form cannot save. Stay to correct it, or discard the changes.`;
}

/** The label of the first field the browser refuses to submit. */
function invalidFieldLabel(form: HTMLFormElement): string | null {
  for (const element of Array.from(form.elements)) {
    if (
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      element.willValidate &&
      !element.validity.valid
    ) {
      return element.labels?.[0]?.textContent ?? null;
    }
  }
  return null;
}

export function LeaveGuard({
  blocker,
  formRef,
  saveIntent = "save",
  saveState,
}: {
  blocker: Blocker;
  formRef: React.RefObject<HTMLFormElement | null>;
  saveIntent?: string;
  /** The editor's save state (`useEditorForm().state`), not only its kind. */
  saveState: SaveState;
}) {
  /** The save state at the "Save and leave" click; null while not saving. */
  const [clicked, setClicked] = useState<SaveState | null>(null);
  const saving = clicked !== null;
  /** Why the last "Save and leave" did not start (a field the browser refused). */
  const [unsent, setUnsent] = useState<string | null>(null);

  useEffect(() => {
    if (!clicked || blocker.state !== "blocked") return;
    const step = leaveGuardStep(clicked, saveState);
    if (step === "proceed") {
      setClicked(null);
      blocker.proceed();
    } else if (step === "reset") {
      setClicked(null);
      blocker.reset();
    }
  }, [clicked, saveState, blocker]);

  // Each leave attempt starts without the previous one's message.
  useEffect(() => {
    if (blocker.state !== "blocked") setUnsent(null);
  }, [blocker.state]);

  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Leave without saving?"
      onClose={() => {
        if (blocker.state === "blocked" && !saving) blocker.reset();
      }}
      actions={
        <>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => {
              setClicked(null);
              blocker.reset?.();
            }}
          >
            Stay
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={saving || undefined}
            onClick={() => {
              const form = formRef.current;
              if (!form || saving) return;
              if (requestSave(form, findIntentButton(form, saveIntent))) {
                setUnsent(null);
                setClicked(saveState);
              } else {
                // Nothing was sent: stay usable and say which field to fix.
                setUnsent(unsentMessage(invalidFieldLabel(form)));
              }
            }}
          >
            {saving ? "Saving…" : "Save and leave"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--danger studio-btn--compact"
            onClick={() => {
              setClicked(null);
              blocker.proceed?.();
            }}
          >
            Discard
          </button>
        </>
      }
    >
      <p>Your changes have not been saved.</p>
      {unsent ? (
        <p className="studio-field__error" role="alert">
          {unsent}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
