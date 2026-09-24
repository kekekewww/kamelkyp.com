/**
 * Native `<dialog>` for the two modal moments the Studio allows (admin §1.5):
 * permanent deletion and leaving with unsaved changes. Focus returns to the
 * opener when it closes; Escape cancels.
 */
import { useEffect, useId, useRef, useState } from "react";

export function ConfirmDialog({
  open,
  title,
  onClose,
  actions,
  tone = "default",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  actions: React.ReactNode;
  tone?: "default" | "danger";
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog studio-dialog--${tone}`}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 className="studio-dialog__title" id={titleId}>
        {title}
      </h2>
      {children ? <div className="studio-dialog__body">{children}</div> : null}
      <div className="studio-dialog__actions">{actions}</div>
    </dialog>
  );
}

/**
 * Typed confirmation: the confirm button stays disabled until the input
 * matches `expected` exactly (the slug, or "DELETE").
 */
export function TypeToConfirm({
  expected,
  label,
  confirmLabel,
  onConfirm,
  name = "confirm",
  submit = false,
}: {
  expected: string;
  label: string;
  confirmLabel: string;
  onConfirm?: (value: string) => void;
  /** Field name when submitted inside a form. */
  name?: string;
  /** Render the confirm button as a form submit (intent "delete"). */
  submit?: boolean;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const matches = value.trim() === expected;
  return (
    <div className="studio-type-confirm">
      <label className="studio-field__label" htmlFor={id}>
        {label}
      </label>
      <p className="studio-hint">
        Type <code>{expected}</code> exactly.
      </p>
      <input
        id={id}
        name={name}
        className="studio-input"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <button
        type={submit ? "submit" : "button"}
        name={submit ? "intent" : undefined}
        value={submit ? "delete" : undefined}
        className="studio-btn studio-btn--danger-filled"
        disabled={!matches}
        onClick={submit ? undefined : () => onConfirm?.(value.trim())}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
