/**
 * The legal-review confirmation (wp2 §4.5, §4.9; plan 06): a native
 * checkbox, never pre-checked, never stored and never part of the form's
 * dirty state or backup. The server re-checks it on every publish.
 */
import { forwardRef, useId } from "react";

export const LegalReview = forwardRef<
  HTMLInputElement,
  { error?: string | null; onChange?: () => void }
>(function LegalReview({ error, onChange }, ref) {
  const id = useId();
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  return (
    <div className="studio-legal-review" data-invalid={error ? "" : undefined}>
      <div className="studio-check">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          name="legalReviewConfirmed"
          value="on"
          aria-describedby={error ? `${noteId} ${errorId}` : noteId}
          aria-invalid={error ? true : undefined}
          onChange={onChange}
        />
        <label htmlFor={id}>
          A qualified legal professional has reviewed this version.
        </label>
      </div>
      <p className="studio-hint" id={noteId}>
        This confirmation does not replace professional legal advice.
      </p>
      {error ? (
        <p className="studio-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
