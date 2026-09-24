/**
 * Slug field (admin-architecture §4.11). Shows the public URL prefix; in auto
 * mode it follows the English title (named input `titleField`) until the
 * owner edits it or the entry has been published. Invalid characters are converted
 * on blur; availability is checked live (300 ms debounce) against
 * `/api/studio/slug-check`.
 */
import { useEffect, useId, useRef, useState } from "react";
import { fallbackSlug, isValidSlug, slugify } from "../../../lib/cms/slug";
import type { SluggedEntityType } from "../../../lib/cms/types";

type CheckResult =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "redirect"; label: string }
  | { state: "taken"; label: string; status: string }
  | { state: "invalid" };

export function SlugField({
  entityType,
  name = "slug",
  prefix,
  defaultValue = "",
  entityId,
  titleField,
  published = false,
  publishedSlug,
  locked = false,
  error,
}: {
  entityType: SluggedEntityType;
  name?: string;
  /** e.g. `/en/works/`. */
  prefix: string;
  defaultValue?: string;
  entityId?: string;
  /** Name of the EN title input to follow in auto mode (`title.en`). */
  titleField?: string;
  /** Published entries never change slug automatically. */
  published?: boolean;
  publishedSlug?: string | null;
  /** Commission services: slug is informational and fixed. */
  locked?: boolean;
  error?: string | null;
}) {
  const [value, setValue] = useState(defaultValue);
  const [auto, setAuto] = useState(!defaultValue && !published && !locked);
  const [check, setCheck] = useState<CheckResult>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  // Auto mode: follow the EN title in the same form.
  useEffect(() => {
    if (!auto || !titleField) return;
    const form = inputRef.current?.form;
    const title = form?.elements.namedItem(titleField);
    if (!(title instanceof HTMLInputElement)) return;
    const follow = () =>
      setValue(
        slugify(title.value) || (title.value ? fallbackSlug(entityType) : ""),
      );
    title.addEventListener("input", follow);
    return () => title.removeEventListener("input", follow);
  }, [auto, titleField, entityType]);

  // Live availability check.
  useEffect(() => {
    if (locked || !value) {
      setCheck({ state: "idle" });
      return;
    }
    if (!isValidSlug(value)) {
      setCheck({ state: "invalid" });
      return;
    }
    if (value === defaultValue && value === publishedSlug) {
      setCheck({ state: "available" });
      return;
    }
    setCheck({ state: "checking" });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: entityType, slug: value });
        if (entityId) params.set("id", entityId);
        const response = await fetch(`/api/studio/slug-check?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return setCheck({ state: "idle" });
        const body = (await response.json()) as {
          available: boolean;
          conflict?: { label: string; status: string; kind: string };
        };
        if (!body.available) {
          setCheck(
            body.conflict
              ? {
                  state: "taken",
                  label: body.conflict.label,
                  status: body.conflict.status,
                }
              : { state: "invalid" },
          );
        } else if (body.conflict?.kind === "redirect") {
          setCheck({ state: "redirect", label: body.conflict.label });
        } else {
          setCheck({ state: "available" });
        }
      } catch {
        // Aborted or offline: keep the field usable; the server checks on save.
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, entityType, entityId, locked, defaultValue, publishedSlug]);

  const message = (() => {
    switch (check.state) {
      case "available":
        return { tone: "ok", text: "Available" };
      case "checking":
        return { tone: "meta", text: "Checking…" };
      case "redirect":
        return {
          tone: "warning",
          text: `Old URL of “${check.label}”. Publishing replaces that redirect.`,
        };
      case "taken":
        return {
          tone: "danger",
          text: `Taken by “${check.label}” (${check.status}).`,
        };
      case "invalid":
        return {
          tone: "danger",
          text: "Use lowercase letters, digits and hyphens (no leading or trailing hyphen).",
        };
      default:
        return null;
    }
  })();

  const changedPublished =
    published && publishedSlug && value && value !== publishedSlug;

  return (
    <div
      className="studio-field studio-slug"
      data-invalid={error ? "" : undefined}
    >
      <div className="studio-field__head">
        <label className="studio-field__label" htmlFor={id}>
          Slug
        </label>
        {auto ? (
          <span className="studio-field__required">Auto from EN title</span>
        ) : null}
      </div>
      <div className="studio-slug__control">
        <span className="studio-slug__prefix" aria-hidden="true">
          {prefix}
        </span>
        <input
          ref={inputRef}
          id={id}
          name={name}
          className="studio-input studio-slug__input"
          value={value}
          readOnly={locked}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={`${id}-status`}
          aria-invalid={
            check.state === "invalid" || check.state === "taken" || undefined
          }
          onChange={(event) => {
            setAuto(false);
            setValue(event.currentTarget.value.toLowerCase());
          }}
          onBlur={() => setValue((current) => slugify(current))}
        />
      </div>
      <p className="studio-slug__status" id={`${id}-status`} aria-live="polite">
        {message ? (
          <span
            className={`studio-slug__message studio-slug__message--${message.tone}`}
          >
            {message.text}
          </span>
        ) : null}
      </p>
      {changedPublished ? (
        <p className="studio-hint">
          After you publish, {prefix}
          {publishedSlug} will redirect here.
        </p>
      ) : null}
      {locked ? (
        <p className="studio-hint">
          This slug is fixed for commission services.
        </p>
      ) : null}
      {error ? (
        <p className="studio-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
