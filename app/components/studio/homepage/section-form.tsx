/**
 * One independently saved block of the Homepage control screen
 * (admin-architecture §4.2.1: each ruled section has its own Save). Each
 * block keeps its own Saved / Saving / Unsaved Changes / Error state; the
 * page combines their dirty flags for the leave guard, and Mod+S saves the
 * block that holds the focus.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  type ActionData,
  type FieldErrors,
  fieldErrors,
  useActionToasts,
} from "../settings/form-kit";
import {
  CsrfField,
  IntentButton,
  initialSaveState,
  SaveStateIndicator,
  saveStateReducer,
  serializeForm,
} from "../ui";

export function SectionForm({
  id,
  intent,
  label,
  revision,
  updatedAt,
  onDirtyChange,
  children,
}: {
  id: string;
  intent: string;
  /** Accessible name of the form, e.g. "Hero". */
  label: string;
  revision: number;
  updatedAt: string | null;
  onDirtyChange: (id: string, dirty: boolean) => void;
  children: (errors: FieldErrors) => React.ReactNode;
}) {
  const fetcher = useFetcher<ActionData>();
  useActionToasts(fetcher);
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const [state, dispatch] = useReducer(
    saveStateReducer,
    updatedAt,
    initialSaveState,
  );
  const [dirty, setDirty] = useState(false);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    return form ? serializeForm(new FormData(form)) : null;
  }, []);

  useEffect(() => {
    baseline.current = snapshot();
  }, [snapshot]);

  useEffect(() => {
    onDirtyChange(id, dirty);
  }, [id, dirty, onDirtyChange]);

  const onInput = useCallback(() => {
    const current = snapshot();
    const isDirty = current !== null && current !== baseline.current;
    setDirty(isDirty);
    dispatch({ type: "change", dirty: isDirty });
  }, [snapshot]);

  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current === "idle" && fetcher.state === "submitting") {
      dispatch({ type: "submit" });
    }
    if (previous.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data;
      if (result && result.ok === false) {
        dispatch({
          type: "failure",
          message: result.message ?? "The save failed. Try again.",
        });
      } else if (result?.ok) {
        baseline.current = snapshot();
        setDirty(false);
        dispatch({ type: "success", at: new Date().toISOString() });
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, snapshot]);

  const errors = fieldErrors(
    fetcher.state === "idle" ? fetcher.data?.issues : undefined,
  );
  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      className="studio-homepage-form"
      aria-label={label}
      data-section-form={id}
      onInput={onInput}
      onChange={onInput}
    >
      <CsrfField />
      <input type="hidden" name="expectedRevision" value={String(revision)} />
      {children(errors)}
      <div className="studio-homepage-form__save">
        <SaveStateIndicator state={state} />
        {state.kind === "error" ? (
          <span className="studio-homepage-form__error" role="alert">
            {state.message}
          </span>
        ) : null}
        <span className="studio-hint">Save — goes live immediately</span>
        <IntentButton
          intent={intent}
          variant={dirty ? "primary" : "secondary"}
          compact
          pending={pending}
          pendingLabel="Saving…"
          data-save=""
        >
          Save {label.toLowerCase()}
        </IntentButton>
      </div>
    </fetcher.Form>
  );
}
