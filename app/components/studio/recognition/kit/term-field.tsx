/**
 * One taxonomy term with an inline "Add …" (extensible vocabularies: new
 * recognition types, writing categories). The new term is created through
 * the page action (`intent=create-term`) and selected at once.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { Term } from "../../../../lib/cms/schemas/taxonomy";
import { Select, useStudioSession, useToast } from "../../ui";

type CreateResult =
  | { ok: true; intent: "create-term"; term: Term }
  | { ok: false; message: string };

function termLabel(term: Term): string {
  return term.label.zh === term.label.en
    ? term.label.en
    : `${term.label.zh} / ${term.label.en}`;
}

export function TermField({
  name,
  label,
  terms,
  defaultValue,
  vocabulary,
  addLabel,
  required,
  hint,
  error,
  placeholder = "None",
  onChange,
}: {
  name: string;
  label: string;
  terms: readonly Term[];
  defaultValue?: string | null;
  vocabulary: string;
  /** e.g. "Add type". */
  addLabel: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Called after the value changed programmatically (a new term). */
  onChange?: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ zh: "", en: "" });
  const fetcher = useFetcher<CreateResult>();
  const { csrfToken } = useStudioSession();
  const toast = useToast();
  const id = useId();
  const handled = useRef<unknown>(null);
  const zhRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== "idle" || !result || handled.current === result) {
      return;
    }
    handled.current = result;
    if (!result.ok) {
      toast.show({ tone: "error", message: result.message });
      return;
    }
    setValue(result.term.id);
    setAdding(false);
    setDraft({ zh: "", en: "" });
    toast.show({ message: `Added “${result.term.label.en}”` });
    window.setTimeout(() => onChange?.(), 0);
  }, [fetcher.state, fetcher.data, toast, onChange]);

  useEffect(() => {
    if (adding) zhRef.current?.focus();
  }, [adding]);

  const options = terms
    .filter((term) => !term.archivedAt || term.id === value)
    .map((term) => ({
      value: term.id,
      label: term.archivedAt
        ? `${termLabel(term)} (archived)`
        : termLabel(term),
    }));
  const ready = draft.zh.trim() && draft.en.trim();
  const create = () => {
    if (!ready) return;
    fetcher.submit(
      {
        csrfToken,
        intent: "create-term",
        vocabulary,
        "label.zh": draft.zh.trim(),
        "label.en": draft.en.trim(),
      },
      { method: "post" },
    );
  };

  return (
    <div className="p3-term">
      <Select
        name={name}
        label={label}
        required={required}
        hint={hint}
        error={error}
        placeholder={placeholder}
        options={options}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      {adding ? (
        <fieldset className="p3-term__add" aria-labelledby={`${id}-add`}>
          <legend className="studio-section-label" id={`${id}-add`}>
            {addLabel}
          </legend>
          {/* No `name`: these never post with the editor form. */}
          <label className="visually-hidden" htmlFor={`${id}-zh`}>
            ZH label
          </label>
          <input
            ref={zhRef}
            id={`${id}-zh`}
            className="studio-input"
            lang="zh-Hant"
            placeholder="ZH"
            value={draft.zh}
            onChange={(event) =>
              setDraft({ ...draft, zh: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                create();
              }
            }}
          />
          <label className="visually-hidden" htmlFor={`${id}-en`}>
            EN label
          </label>
          <input
            id={`${id}-en`}
            className="studio-input"
            lang="en"
            placeholder="EN"
            value={draft.en}
            onChange={(event) =>
              setDraft({ ...draft, en: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                create();
              }
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={fetcher.state !== "idle" || undefined}
            disabled={!ready || fetcher.state !== "idle"}
            onClick={create}
          >
            {fetcher.state !== "idle" ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact p3-term__open"
          onClick={() => setAdding(true)}
        >
          {addLabel}…
        </button>
      )}
    </div>
  );
}
