/**
 * Taxonomy pickers. `TermSelect` = one term (primary category, type, group).
 * `TermMultiSelect` = several terms as one `<name>:json` array, with an inline
 * "Add …" that posts `intent=create-term` (label zh/en) to the page action,
 * which creates the term and revalidates (admin-architecture §4.13).
 */
import { useId, useState } from "react";
import { useFetcher } from "react-router";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import { Select } from "./fields";
import { useStudioSession } from "./studio-session";

function termLabel(term: Term): string {
  return term.label.zh === term.label.en
    ? term.label.en
    : `${term.label.zh} / ${term.label.en}`;
}

export function TermSelect({
  name,
  label,
  terms,
  defaultValue,
  required,
  hint,
  error,
  placeholder = "None",
}: {
  name: string;
  label: string;
  terms: readonly Term[];
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
}) {
  return (
    <Select
      name={name}
      label={label}
      required={required}
      hint={hint}
      error={error}
      placeholder={placeholder}
      defaultValue={defaultValue ?? ""}
      options={terms
        .filter((term) => !term.archivedAt || term.id === defaultValue)
        .map((term) => ({ value: term.id, label: termLabel(term) }))}
    />
  );
}

export function TermMultiSelect({
  name,
  label,
  terms,
  defaultValue = [],
  vocabulary,
  addLabel,
  hint,
}: {
  name: string;
  label: string;
  terms: readonly Term[];
  defaultValue?: readonly string[];
  /** Enables inline "Add …" for this vocabulary. */
  vocabulary?: string;
  addLabel?: string;
  hint?: string;
}) {
  const [selected, setSelected] = useState<string[]>([...defaultValue]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ zh: "", en: "" });
  const fetcher = useFetcher();
  const { csrfToken } = useStudioSession();
  const id = useId();
  const visible = terms.filter(
    (term) => !term.archivedAt || selected.includes(term.id),
  );

  return (
    <fieldset className="studio-terms">
      <legend className="studio-field__label">{label}</legend>
      <input
        type="hidden"
        name={`${name}:json`}
        value={JSON.stringify(selected)}
      />
      <div className="studio-terms__options">
        {visible.map((term) => {
          const checked = selected.includes(term.id);
          return (
            <label
              className="studio-chip"
              key={term.id}
              data-checked={checked ? "" : undefined}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((value) => value !== term.id)
                      : [...current, term.id],
                  )
                }
              />
              <span>{termLabel(term)}</span>
            </label>
          );
        })}
      </div>
      {hint ? <p className="studio-hint">{hint}</p> : null}
      {vocabulary ? (
        adding ? (
          <fieldset className="studio-terms__add" aria-labelledby={`${id}-add`}>
            <span className="studio-section-label" id={`${id}-add`}>
              {addLabel ?? "Add term"}
            </span>
            {/* No `name`: these never submit with the surrounding editor form. */}
            <input
              className="studio-input"
              lang="zh-Hant"
              placeholder="ZH"
              aria-label="ZH label"
              value={draft.zh}
              onChange={(event) =>
                setDraft({ ...draft, zh: event.currentTarget.value })
              }
            />
            <input
              className="studio-input"
              lang="en"
              placeholder="EN"
              aria-label="EN label"
              value={draft.en}
              onChange={(event) =>
                setDraft({ ...draft, en: event.currentTarget.value })
              }
            />
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              aria-busy={fetcher.state !== "idle" || undefined}
              disabled={!draft.zh.trim() || !draft.en.trim()}
              onClick={() => {
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
                setDraft({ zh: "", en: "" });
                setAdding(false);
              }}
            >
              Add
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
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => setAdding(true)}
          >
            {addLabel ?? "Add term"}
          </button>
        )
      ) : null}
    </fieldset>
  );
}
