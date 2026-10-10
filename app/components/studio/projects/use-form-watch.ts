/**
 * Watches the editor form for every kind of change. Typed input arrives
 * through React's `onInput` (pass the returned `onInput` to the form); tags,
 * category chips, list rows, media pickers and the legacy-blocks toggle
 * change hidden inputs from React state, which fires no event, so a
 * MutationObserver catches those. The save state, the live checklist and the
 * per-section "unsaved" dots never miss an edit.
 */
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { serializeForm } from "../ui";
import type { ProjectSectionId } from "./project-form";

const IGNORED = new Set(["csrfToken", "intent", "expectedRevision", "confirm"]);

/** Serialized named controls per editor section (`details#section-<id>`). */
export function sectionSnapshot(form: HTMLFormElement): Map<string, string> {
  const parts = new Map<string, string[]>();
  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    ) {
      continue;
    }
    if (!element.name || IGNORED.has(element.name)) continue;
    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio") &&
      !element.checked
    ) {
      continue;
    }
    const section = element.closest("details.studio-section")?.id ?? "";
    const list = parts.get(section) ?? [];
    list.push(`${element.name}=${element.value}`);
    parts.set(section, list);
  }
  return new Map(
    [...parts].map(([section, list]) => [
      section.replace(/^section-/, ""),
      list.sort().join("\u0000"),
    ]),
  );
}

export function useFormWatch({
  formRef,
  dirty,
  resetKey,
  onChange,
  onSettled,
  settleMs = 200,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  /** The editor's dirty flag: a clean form becomes the section baseline. */
  dirty: boolean;
  /** Changes when the server copy changes (re-baseline). */
  resetKey: string | number;
  /** Every real change (feeds `useEditorForm().onInput`). */
  onChange: () => void;
  /** Debounced: recompute derived state (checklist, preview). */
  onSettled: (form: HTMLFormElement) => void;
  settleMs?: number;
}) {
  const [dirtySections, setDirtySections] = useState<Set<ProjectSectionId>>(
    () => new Set(),
  );
  const baseline = useRef<Map<string, string>>(new Map());
  const handlers = useRef({ onChange, onSettled });
  handlers.current = { onChange, onSettled };

  // A clean form (load, save, revert) is the new baseline.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-baseline when the server copy changes
  useEffect(() => {
    const form = formRef.current;
    if (!form || dirty) return;
    baseline.current = sectionSnapshot(form);
    setDirtySections(new Set());
  }, [dirty, resetKey, formRef]);

  const last = useRef<string | null>(null);
  const timer = useRef(0);

  /** Compares the form with the last seen state; derived work is debounced. */
  const check = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const current = serializeForm(new FormData(form));
    if (current === last.current) return;
    last.current = current;
    handlers.current.onChange();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const sections = sectionSnapshot(form);
      const changed = new Set<ProjectSectionId>();
      for (const [id, value] of sections) {
        if (baseline.current.get(id) !== value) {
          changed.add(id as ProjectSectionId);
        }
      }
      for (const id of baseline.current.keys()) {
        if (!sections.has(id)) changed.add(id as ProjectSectionId);
      }
      setDirtySections(changed);
      handlers.current.onSettled(form);
    }, settleMs);
  }, [formRef, settleMs]);

  // Programmatic changes (hidden inputs driven by React state) are seen after
  // React commits them. Typed input must NOT be observed with a native
  // listener: it would set state before React's own handler runs and React
  // would restore controlled inputs (the slug) to their old value. Typing is
  // passed through React's `onInput` instead (returned below).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    last.current = serializeForm(new FormData(form));
    const observer = new MutationObserver(check);
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["value", "checked"],
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [formRef, check]);

  return { dirtySections, onInput: check };
}
