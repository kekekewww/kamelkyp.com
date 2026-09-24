/**
 * Watches the editor form for every kind of change. `useEditorForm` hears
 * `input` events only; tags, category chips, list rows, media pickers and
 * the legacy-blocks toggle change hidden inputs from React state, which fires
 * no event. A MutationObserver catches those, so the save state, the live
 * checklist and the per-section "unsaved" dots never miss an edit.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let last = serializeForm(new FormData(form));
    let timer = 0;
    const check = () => {
      const current = serializeForm(new FormData(form));
      if (current === last) return;
      last = current;
      handlers.current.onChange();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
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
    };
    const observer = new MutationObserver(check);
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["value", "checked"],
    });
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    return () => {
      observer.disconnect();
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
      window.clearTimeout(timer);
    };
  }, [formRef, settleMs]);

  return { dirtySections };
}
