/**
 * ZH / EN side by side (admin-architecture §4.4, §5.6): mono locale labels,
 * `lang` on each input, a fill marker per locale, "Required to publish" on
 * required fields and an optional "Same in both" for names and titles that do
 * not translate. Field names: `<name>.zh`, `<name>.en`.
 */
import { useId, useRef, useState } from "react";
import type { LocalizedText } from "../../../lib/cms/types";

type Kind = "input" | "textarea";

const LOCALES = [
  { key: "zh", label: "ZH", lang: "zh-Hant" },
  { key: "en", label: "EN", lang: "en" },
] as const;

function LocalizedControl({
  kind,
  name,
  label,
  hint,
  required,
  defaultValue,
  errors,
  sameInBoth,
  maxLength,
  rows,
}: {
  kind: Kind;
  name: string;
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  defaultValue?: LocalizedText;
  /** Per-locale inline errors. */
  errors?: Partial<Record<"zh" | "en", string>>;
  sameInBoth?: boolean;
  maxLength?: number;
  rows?: number;
}) {
  const id = useId();
  const [filled, setFilled] = useState(() => ({
    zh: Boolean(defaultValue?.zh.trim()),
    en: Boolean(defaultValue?.en.trim()),
  }));
  const [linked, setLinked] = useState(false);
  const enRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const zhRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const update = (locale: "zh" | "en", value: string) => {
    setFilled((current) => ({ ...current, [locale]: value.trim().length > 0 }));
    if (linked && locale === "zh" && enRef.current) {
      enRef.current.value = value;
      setFilled((current) => ({ ...current, en: value.trim().length > 0 }));
    }
  };

  return (
    <fieldset
      className={`studio-localized studio-localized--${kind}`}
      aria-describedby={hint ? `${id}-hint` : undefined}
    >
      <legend className="studio-field__head">
        <span className="studio-field__label">{label}</span>
        {required ? (
          <span className="studio-field__required">Required to publish</span>
        ) : null}
      </legend>
      <div className="studio-localized__pair">
        {LOCALES.map((locale) => {
          const inputId = `${id}-${locale.key}`;
          const error = errors?.[locale.key];
          const common = {
            id: inputId,
            name: `${name}.${locale.key}`,
            lang: locale.lang,
            defaultValue: defaultValue?.[locale.key] ?? "",
            maxLength,
            className:
              kind === "input"
                ? "studio-input"
                : "studio-input studio-textarea",
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? `${inputId}-error` : undefined,
            readOnly: linked && locale.key === "en",
            onInput: (
              event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => update(locale.key, event.currentTarget.value),
          };
          return (
            <div
              className="studio-localized__locale"
              key={locale.key}
              data-filled={filled[locale.key] ? "" : undefined}
            >
              <label className="studio-localized__tag" htmlFor={inputId}>
                <span className="studio-localized__marker" aria-hidden="true" />
                {locale.label}
                <span className="visually-hidden">
                  {filled[locale.key] ? " (filled)" : " (empty)"}
                </span>
              </label>
              {kind === "input" ? (
                <input
                  {...common}
                  ref={locale.key === "en" ? enRef : zhRef}
                  type="text"
                />
              ) : (
                <textarea
                  {...common}
                  ref={locale.key === "en" ? enRef : zhRef}
                  rows={rows ?? 4}
                />
              )}
              {error ? (
                <p
                  className="studio-field__error"
                  id={`${inputId}-error`}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {sameInBoth ? (
        <label className="studio-localized__same">
          <input
            type="checkbox"
            checked={linked}
            onChange={(event) => {
              setLinked(event.currentTarget.checked);
              if (
                event.currentTarget.checked &&
                enRef.current &&
                zhRef.current
              ) {
                enRef.current.value = zhRef.current.value;
                setFilled((current) => ({ ...current, en: current.zh }));
              }
            }}
          />
          Same in both
        </label>
      ) : null}
      {hint ? (
        <p className="studio-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

type LocalizedProps = Omit<Parameters<typeof LocalizedControl>[0], "kind">;

export function LocalizedTextField(props: Omit<LocalizedProps, "rows">) {
  return <LocalizedControl {...props} kind="input" />;
}

export function LocalizedTextArea(props: Omit<LocalizedProps, "sameInBoth">) {
  return <LocalizedControl {...props} kind="textarea" />;
}
