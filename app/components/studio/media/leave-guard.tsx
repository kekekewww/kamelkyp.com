/**
 * "Leave without saving?" (admin-architecture §4.7) for editors built on
 * `useEditorForm`: Stay · Save and leave · Discard. Save and leave submits the
 * editor's save intent and continues once the save succeeds.
 */
import { useEffect, useState } from "react";
import type { Blocker } from "react-router";
import { ConfirmDialog } from "../ui/confirm-dialog";

export function LeaveGuard({
  blocker,
  formRef,
  saveIntent = "save",
  saveState,
}: {
  blocker: Blocker;
  formRef: React.RefObject<HTMLFormElement | null>;
  saveIntent?: string;
  /** The editor's save state kind. */
  saveState: "saved" | "unsaved" | "saving" | "error";
}) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saving || blocker.state !== "blocked") return;
    if (saveState === "saved") {
      setSaving(false);
      blocker.proceed();
    } else if (saveState === "error") {
      setSaving(false);
      blocker.reset();
    }
  }, [saving, saveState, blocker]);

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
            onClick={() => blocker.reset?.()}
          >
            Stay
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={saving || undefined}
            onClick={() => {
              const form = formRef.current;
              const button = form?.querySelector<HTMLButtonElement>(
                `button[name="intent"][value="${saveIntent}"]`,
              );
              if (!form) return;
              setSaving(true);
              form.requestSubmit(button ?? undefined);
            }}
          >
            {saving ? "Saving…" : "Save and leave"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--danger studio-btn--compact"
            onClick={() => blocker.proceed?.()}
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
