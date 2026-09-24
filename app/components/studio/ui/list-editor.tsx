/**
 * Repeatable rows (links, credits, deliverables, FAQ) and tag lists.
 *
 * `ListEditor` keeps stable row keys client-side and renders each row's
 * fields with indexed names (`links.0.url`), which `forms.ts` turns back into
 * arrays in order. `TagInput` submits one `<name>:json` array.
 */
import { useId, useRef, useState } from "react";

let rowCounter = 0;
const nextKey = () => {
  rowCounter += 1;
  return `row-${rowCounter}`;
};

export function ListEditor<T>({
  name,
  label,
  items,
  create,
  renderItem,
  addLabel = "Add",
  max = 50,
  itemLabel = (index) => `Item ${index + 1}`,
}: {
  name: string;
  label: string;
  items: readonly T[];
  /** A blank item for "Add". */
  create: () => T;
  /** `field("url")` → `links.3.url`. */
  renderItem: (
    item: T,
    index: number,
    field: (key: string) => string,
  ) => React.ReactNode;
  addLabel?: string;
  max?: number;
  itemLabel?: (index: number) => string;
}) {
  const [rows, setRows] = useState(() =>
    items.map((item) => ({ key: nextKey(), item })),
  );
  const move = (index: number, delta: number) =>
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      if (row) next.splice(target, 0, row);
      return next;
    });

  return (
    <fieldset className="studio-list-editor">
      <legend className="studio-field__label">{label}</legend>
      {rows.length === 0 ? <p className="studio-hint">None yet.</p> : null}
      <ol className="studio-list-editor__rows">
        {rows.map((row, index) => (
          <li className="studio-list-editor__row" key={row.key}>
            <div className="studio-list-editor__fields">
              {renderItem(row.item, index, (key) => `${name}.${index}.${key}`)}
            </div>
            <div className="studio-list-editor__controls">
              <button
                type="button"
                className="studio-order__step"
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
                <span className="visually-hidden">
                  Move {itemLabel(index)} up
                </span>
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="studio-order__step"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
              >
                <span className="visually-hidden">
                  Move {itemLabel(index)} down
                </span>
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
              >
                Remove
                <span className="visually-hidden"> {itemLabel(index)}</span>
              </button>
            </div>
          </li>
        ))}
      </ol>
      {rows.length < max ? (
        <button
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: nextKey(), item: create() },
            ])
          }
        >
          {addLabel}
        </button>
      ) : null}
      {rows.length === 0 ? (
        // An empty list still submits `[]` so a save can clear it.
        <input type="hidden" name={`${name}:json`} value="[]" />
      ) : null}
    </fieldset>
  );
}

export function TagInput({
  name,
  label,
  defaultValue = [],
  hint,
  max = 30,
}: {
  name: string;
  label: string;
  defaultValue?: readonly string[];
  hint?: string;
  max?: number;
}) {
  const [tags, setTags] = useState<string[]>([...defaultValue]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const add = (value: string) => {
    const tag = value.trim().slice(0, 60);
    if (!tag || tags.includes(tag) || tags.length >= max) return;
    setTags([...tags, tag]);
  };

  return (
    <div className="studio-field studio-tags">
      <label className="studio-field__label" htmlFor={id}>
        {label}
      </label>
      <input type="hidden" name={`${name}:json`} value={JSON.stringify(tags)} />
      <ul className="studio-tags__list" aria-label={`${label}: ${tags.length}`}>
        {tags.map((tag) => (
          <li className="studio-tag" key={tag}>
            <span>{tag}</span>
            <button
              type="button"
              className="studio-tag__remove"
              aria-label={`Remove ${tag}`}
              onClick={() => setTags(tags.filter((item) => item !== tag))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        id={id}
        className="studio-input"
        value={draft}
        placeholder="Type and press Enter"
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
            setDraft("");
          } else if (event.key === "Backspace" && !draft && tags.length) {
            setTags(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft) {
            add(draft);
            setDraft("");
          }
        }}
      />
      {hint ? <p className="studio-hint">{hint}</p> : null}
    </div>
  );
}
