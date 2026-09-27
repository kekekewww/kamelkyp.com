/**
 * Studio form controls (admin-architecture §5.6). Native elements, visible
 * labels, inline hints and errors wired with `aria-describedby`. Field names
 * follow `app/lib/cms/forms.ts` (dotted paths; `:number`, `:bool`, `:json`).
 */
import { useId } from "react";

export interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  /** Shows "Required to publish" (drafts always save). */
  required?: boolean;
  className?: string;
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  hintId,
  errorId,
  className,
  children,
}: FieldProps & {
  htmlFor: string;
  hintId: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={["studio-field", className ?? ""].filter(Boolean).join(" ")}
      data-invalid={error ? "" : undefined}
    >
      <div className="studio-field__head">
        <label className="studio-field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {required ? (
          <span className="studio-field__required">Required to publish</span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="studio-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="studio-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function useFieldIds(hint?: unknown, error?: unknown) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;
  return { id, hintId, errorId, describedBy };
}

type InputBase = FieldProps & {
  name: string;
};

export function TextInput({
  name,
  label,
  hint,
  error,
  required,
  className,
  type = "text",
  ...rest
}: InputBase &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "required">) {
  const ids = useFieldIds(hint, error);
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      htmlFor={ids.id}
      hintId={ids.hintId}
      errorId={ids.errorId}
    >
      <input
        id={ids.id}
        name={name}
        type={type}
        className="studio-input"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Field>
  );
}

export function TextArea({
  name,
  label,
  hint,
  error,
  required,
  className,
  rows = 4,
  ...rest
}: InputBase &
  Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "name" | "required"
  >) {
  const ids = useFieldIds(hint, error);
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      htmlFor={ids.id}
      hintId={ids.hintId}
      errorId={ids.errorId}
    >
      <textarea
        id={ids.id}
        name={name}
        rows={rows}
        className="studio-input studio-textarea"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Field>
  );
}

export function NumberInput({
  name,
  defaultValue,
  ...rest
}: InputBase & {
  defaultValue?: number | null;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <TextInput
      {...rest}
      name={`${name}:number`}
      type="number"
      inputMode="numeric"
      defaultValue={defaultValue ?? ""}
    />
  );
}

export function DateInput({
  name,
  defaultValue,
  ...rest
}: InputBase & { defaultValue?: string | null; disabled?: boolean }) {
  return (
    <TextInput
      {...rest}
      name={name}
      type="date"
      defaultValue={defaultValue ?? ""}
    />
  );
}

export function Select({
  name,
  label,
  hint,
  error,
  required,
  className,
  options,
  placeholder,
  ...rest
}: InputBase & {
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "required">) {
  const ids = useFieldIds(hint, error);
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      htmlFor={ids.id}
      hintId={ids.hintId}
      errorId={ids.errorId}
    >
      <select
        id={ids.id}
        name={name}
        className="studio-input studio-select"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder !== undefined ? (
          <option value="">{placeholder}</option>
        ) : null}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Boolean field: a hidden `false` precedes the checkbox so an unchecked box
 * still submits a value (`forms.ts` keeps the last one).
 */
export function Checkbox({
  name,
  label,
  hint,
  defaultChecked,
  checked,
  onChange,
  disabled,
  role,
}: {
  name: string;
  label: string;
  hint?: React.ReactNode;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  role?: "switch";
}) {
  const ids = useFieldIds(hint);
  return (
    <div className="studio-check">
      <input type="hidden" name={`${name}:bool`} value="false" />
      <input
        id={ids.id}
        type="checkbox"
        name={`${name}:bool`}
        value="true"
        role={role}
        className={role === "switch" ? "studio-switch" : undefined}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-describedby={ids.describedBy}
      />
      <label htmlFor={ids.id}>{label}</label>
      {hint ? (
        <p className="studio-hint" id={ids.hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch(props: Omit<Parameters<typeof Checkbox>[0], "role">) {
  return <Checkbox {...props} role="switch" />;
}

export function SegmentedControl({
  name,
  legend,
  options,
  defaultValue,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className="studio-segmented">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label className="studio-segmented__option" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            id={`${id}-${option.value}`}
            defaultChecked={
              value === undefined ? defaultValue === option.value : undefined
            }
            checked={value === undefined ? undefined : value === option.value}
            onChange={() => onChange?.(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
