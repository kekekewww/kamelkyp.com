/**
 * Editor form state (admin-architecture §4.6–4.7): dirty tracking against the
 * last saved baseline, the four-state save indicator, Mod+S, the unsaved
 * changes guard (in-app navigation and tab close) and a sessionStorage backup
 * written at most every 2 s while dirty. Autosave is deliberately off.
 *
 * Usage (inside a route component):
 *   const fetcher = useFetcher<ActionResult>();
 *   const editor = useEditorForm({ type: "project", id, updatedAt, fetcher });
 *   <StudioForm fetcher={fetcher} ref={editor.formRef} onInput={editor.onInput} …>
 *   <SaveStateIndicator state={editor.state} />
 *   {editor.blocker.state === "blocked" ? <ConfirmDialog …/> : null}
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type FetcherWithComponents, useBlocker } from "react-router";
import {
  backupKey,
  type FormBackup,
  initialSaveState,
  isBackupNewer,
  saveStateReducer,
  serializeForm,
} from "./editor-state";

type ActionLike = { ok?: boolean; message?: string } | null | undefined;

const BACKUP_INTERVAL_MS = 2000;

function readBackup(key: string): FormBackup | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormBackup;
    return typeof parsed.savedAt === "string" &&
      typeof parsed.fields === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeBackup(key: string, backup: FormBackup | null) {
  try {
    if (backup) sessionStorage.setItem(key, JSON.stringify(backup));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage full or blocked: the guard still protects the edits.
  }
}

/** Writes serialized entries back into a form's controls. */
function applyFields(form: HTMLFormElement, fields: string) {
  let entries: Array<[string, string]>;
  try {
    entries = JSON.parse(fields);
  } catch {
    return;
  }
  const byName = new Map<string, string[]>();
  for (const [name, value] of entries) {
    byName.set(name, [...(byName.get(name) ?? []), value]);
  }
  for (const [name, values] of byName) {
    const controls = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    controls.forEach((control) => {
      if (control instanceof HTMLInputElement) {
        if (control.type === "hidden") return;
        if (control.type === "checkbox" || control.type === "radio") {
          control.checked = values.includes(control.value);
          return;
        }
        control.value = values[values.length - 1] ?? "";
        return;
      }
      if (
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        control.value = values[values.length - 1] ?? "";
      }
    });
  }
  form.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useEditorForm({
  type,
  id,
  updatedAt,
  fetcher,
  saveIntent = "save",
}: {
  type: string;
  id: string;
  /** Server `updated_at` of the loaded record. */
  updatedAt: string | null;
  fetcher: FetcherWithComponents<unknown>;
  saveIntent?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const lastBackup = useRef(0);
  const key = backupKey(type, id);
  const [state, dispatch] = useReducer(
    saveStateReducer,
    updatedAt,
    initialSaveState,
  );
  const [dirty, setDirty] = useState(false);
  const [backup, setBackup] = useState<FormBackup | null>(null);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    return form ? serializeForm(new FormData(form)) : null;
  }, []);

  // Baseline after mount and whenever the server copy changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-baseline on a new server copy
  useEffect(() => {
    baseline.current = snapshot();
    setDirty(false);
    dispatch({ type: "reset", at: updatedAt });
    const stored = readBackup(key);
    setBackup(isBackupNewer(stored, updatedAt) ? stored : null);
  }, [key, updatedAt]);

  const onInput = useCallback(() => {
    const current = snapshot();
    const isDirty = current !== null && current !== baseline.current;
    setDirty(isDirty);
    dispatch({ type: "change", dirty: isDirty });
    const now = Date.now();
    if (isDirty && current && now - lastBackup.current > BACKUP_INTERVAL_MS) {
      lastBackup.current = now;
      writeBackup(key, {
        savedAt: new Date(now).toISOString(),
        fields: current,
      });
    }
  }, [key, snapshot]);

  // Track the submission lifecycle through the fetcher.
  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current === "idle" && fetcher.state === "submitting") {
      dispatch({ type: "submit" });
    }
    if (previous.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as ActionLike;
      if (result && result.ok === false) {
        dispatch({
          type: "failure",
          message: result.message ?? "The save failed. Try again.",
        });
      } else if (result?.ok) {
        baseline.current = snapshot();
        setDirty(false);
        writeBackup(key, null);
        setBackup(null);
        dispatch({ type: "success", at: new Date().toISOString() });
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, key, snapshot]);

  // Mod+S saves (and never opens the browser's save dialog).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const form = formRef.current;
        const button = form?.querySelector<HTMLButtonElement>(
          `button[name="intent"][value="${saveIntent}"]`,
        );
        if (form) form.requestSubmit(button ?? undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveIntent]);

  // Tab close / reload while dirty.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // In-app navigation while dirty → the route shows "Leave without saving?".
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const restoreBackup = useCallback(() => {
    const form = formRef.current;
    if (!form || !backup) return;
    applyFields(form, backup.fields);
    setBackup(null);
  }, [backup]);

  const discardBackup = useCallback(() => {
    writeBackup(key, null);
    setBackup(null);
  }, [key]);

  return {
    formRef,
    onInput,
    state,
    dirty,
    blocker,
    /** A local backup newer than the server copy ("Unsaved changes from 14:05 found"). */
    backup,
    restoreBackup,
    discardBackup,
  };
}
