/**
 * "Leave without saving?" (admin-architecture §4.7) for editors built on
 * `useEditorForm`: Stay · Save and leave · Discard. Save and leave submits the
 * editor's save intent and continues once the save succeeds.
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
              setClicked(saveState);
              form.requestSubmit(findIntentButton(form, saveIntent));
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
    </ConfirmDialog>
  );
}
