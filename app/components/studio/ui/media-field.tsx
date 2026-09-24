/**
 * Media fields and picker (admin-architecture §4.13, content-architecture §4).
 * Entries reference assets by id, never by URL. The picker searches the
 * library (`/api/studio/media-search`), registers external URLs
 * (`/api/studio/media-register`, always available) and hosts the upload tab
 * (`MediaUploader`, provided by the uploads package).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatDuration,
  type MediaSummary,
} from "../../../lib/cms/media/summary";
import type { MediaKind } from "../../../lib/cms/schemas/media-asset";
import {
  SessionExpiredError,
  studioFetch,
} from "../../../lib/cms/studio/session.client";
import type { LocalizedText } from "../../../lib/cms/types";
import { MediaUploader } from "../media/uploader";
import { useStudioSession } from "./studio-session";

const KIND_LABEL: Record<MediaKind, string> = {
  image: "image",
  audio: "audio",
  video: "video",
  document: "document",
  embed: "embed",
  link: "link",
};

export function MediaThumb({ asset }: { asset: MediaSummary | null }) {
  if (!asset) {
    return (
      <span className="studio-thumb studio-thumb--empty" aria-hidden="true" />
    );
  }
  if (asset.kind === "image" && asset.url) {
    return (
      <img
        className="studio-thumb"
        src={asset.url}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="studio-thumb studio-thumb--kind" aria-hidden="true">
      {KIND_LABEL[asset.kind]}
    </span>
  );
}

function AssetSummaryLine({ asset }: { asset: MediaSummary }) {
  const duration = formatDuration(asset.durationMs);
  const altMissing =
    asset.kind === "image" && (!asset.alt.zh.trim() || !asset.alt.en.trim());
  return (
    <span className="studio-media-field__summary">
      <span className="studio-media-field__name">{asset.filename}</span>
      <span className="studio-media-field__meta">
        {KIND_LABEL[asset.kind]}
        {duration ? ` · ${duration}` : ""}
        {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
      </span>
      {altMissing ? (
        <span className="studio-media-field__warning">
          Alt text missing (needed before publishing)
        </span>
      ) : null}
    </span>
  );
}

type PickerTab = "library" | "url" | "upload";

export function MediaPicker({
  kind,
  onSelect,
  onClose,
}: {
  /** Restrict results to one kind (image fields show images only). */
  kind?: MediaKind;
  onSelect: (asset: MediaSummary) => void;
  onClose: () => void;
}) {
  const { csrfToken, setToken } = useStudioSession();
  const [tab, setTab] = useState<PickerTab>("library");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState<LocalizedText>({ zh: "", en: "" });
  const [alt, setAlt] = useState<LocalizedText>({ zh: "", en: "" });
  const id = useId();
  const panelRef = useRef<HTMLElement>(null);

  const search = useCallback(
    async (text: string, cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (text) params.set("q", text);
        if (kind) params.set("kind", kind);
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/studio/media-search?${params}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("search_failed");
        const body = (await response.json()) as {
          items: MediaSummary[];
          next: string | null;
        };
        setItems((current) =>
          cursor ? [...current, ...body.items] : body.items,
        );
        setNext(body.next);
      } catch {
        setError("The library could not be loaded. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    if (tab !== "library") return;
    const timer = window.setTimeout(() => void search(query, null), 250);
    return () => window.clearTimeout(timer);
  }, [tab, query, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const register = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await studioFetch("/api/studio/media-register", {
        method: "POST",
        csrfToken,
        onToken: setToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title, alt }),
      });
      const body = (await response.json()) as
        | { asset: MediaSummary }
        | { message?: string };
      if (!response.ok || !("asset" in body)) {
        setError(
          ("message" in body && body.message) ||
            "This address could not be registered.",
        );
        return;
      }
      if (kind && body.asset.kind !== kind) {
        setError(
          `That address is ${KIND_LABEL[body.asset.kind]}, not ${KIND_LABEL[kind]}. It was added to the library.`,
        );
        return;
      }
      onSelect(body.asset);
    } catch (caught) {
      setError(
        caught instanceof SessionExpiredError
          ? "Session expired. Sign in again, then retry."
          : "The address could not be registered. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const tabs: Array<[PickerTab, string]> = [
    ["library", "Library"],
    ["url", "Register URL"],
    ["upload", "Upload"],
  ];

  return (
    <section
      ref={panelRef}
      className="studio-picker"
      aria-labelledby={`${id}-title`}
    >
      <div className="studio-picker__head">
        <p className="studio-section-label" id={`${id}-title`}>
          Choose {kind ? KIND_LABEL[kind] : "media"}
        </p>
        <div className="studio-picker__tabs" role="tablist">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className="studio-picker__tab"
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {tab === "library" ? (
        <div className="studio-picker__body" role="tabpanel">
          <label className="visually-hidden" htmlFor={`${id}-q`}>
            Search media
          </label>
          <input
            id={`${id}-q`}
            className="studio-input"
            type="search"
            placeholder="Search filename, title or alt text"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {items.length === 0 && !loading ? (
            <p className="studio-hint">
              {query ? `No media matches “${query}”.` : "The library is empty."}{" "}
              Register a URL to add one.
            </p>
          ) : null}
          <ul className="studio-picker__results">
            {items.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className="studio-picker__result"
                  onClick={() => onSelect(asset)}
                >
                  <MediaThumb asset={asset} />
                  <AssetSummaryLine asset={asset} />
                </button>
              </li>
            ))}
          </ul>
          {next ? (
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => void search(query, next)}
              aria-busy={loading || undefined}
            >
              Load more
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === "url" ? (
        <div className="studio-picker__body" role="tabpanel">
          <label className="studio-field__label" htmlFor={`${id}-url`}>
            Address (https://)
          </label>
          <input
            id={`${id}-url`}
            className="studio-input"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
          />
          <div className="studio-picker__pair">
            <input
              className="studio-input"
              lang="zh-Hant"
              aria-label="Title ZH"
              placeholder="Title ZH"
              value={title.zh}
              onChange={(event) =>
                setTitle({ ...title, zh: event.currentTarget.value })
              }
            />
            <input
              className="studio-input"
              lang="en"
              aria-label="Title EN"
              placeholder="Title EN"
              value={title.en}
              onChange={(event) =>
                setTitle({ ...title, en: event.currentTarget.value })
              }
            />
          </div>
          {!kind || kind === "image" ? (
            <div className="studio-picker__pair">
              <input
                className="studio-input"
                lang="zh-Hant"
                aria-label="Alt text ZH"
                placeholder="Alt text ZH"
                value={alt.zh}
                onChange={(event) =>
                  setAlt({ ...alt, zh: event.currentTarget.value })
                }
              />
              <input
                className="studio-input"
                lang="en"
                aria-label="Alt text EN"
                placeholder="Alt text EN"
                value={alt.en}
                onChange={(event) =>
                  setAlt({ ...alt, en: event.currentTarget.value })
                }
              />
            </div>
          ) : null}
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            disabled={!url.trim().startsWith("https://") || loading}
            aria-busy={loading || undefined}
            onClick={() => void register()}
          >
            {loading ? "Registering…" : "Register and use"}
          </button>
        </div>
      ) : null}

      {tab === "upload" ? (
        <div className="studio-picker__body" role="tabpanel">
          <MediaUploader kind={kind} onUploaded={onSelect} />
        </div>
      ) : null}

      {error ? (
        <p className="studio-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** One asset reference (`<name>` = asset id, "" when empty). */
export function MediaField({
  name,
  label,
  kind,
  value,
  required,
  hint,
  error,
  onChange,
}: {
  name: string;
  label: string;
  kind?: MediaKind;
  value: MediaSummary | null;
  required?: boolean;
  hint?: string;
  error?: string | null;
  onChange?: (asset: MediaSummary | null) => void;
}) {
  const [asset, setAsset] = useState<MediaSummary | null>(value);
  const [picking, setPicking] = useState(false);
  const id = useId();
  const update = (next: MediaSummary | null) => {
    setAsset(next);
    onChange?.(next);
    setPicking(false);
  };
  return (
    <div
      className="studio-field studio-media-field"
      data-invalid={error ? "" : undefined}
    >
      <div className="studio-field__head">
        <span className="studio-field__label" id={`${id}-label`}>
          {label}
        </span>
        {required ? (
          <span className="studio-field__required">Required to publish</span>
        ) : null}
      </div>
      <input type="hidden" name={name} value={asset?.id ?? ""} />
      <fieldset
        className="studio-media-field__box"
        aria-labelledby={`${id}-label`}
      >
        <MediaThumb asset={asset} />
        {asset ? (
          <AssetSummaryLine asset={asset} />
        ) : (
          <span className="studio-media-field__empty">None selected</span>
        )}
        <div className="studio-media-field__actions">
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            {asset ? "Change…" : "Choose…"}
          </button>
          {asset ? (
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => update(null)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </fieldset>
      {picking ? (
        <MediaPicker
          kind={kind}
          onSelect={update}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {hint ? <p className="studio-hint">{hint}</p> : null}
      {error ? (
        <p className="studio-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ordered assets with per-item captions (gallery): `<name>.<i>.assetId`, `.caption.zh|en`. */
export function MediaListField({
  name,
  label,
  kind = "image",
  value,
  max = 40,
}: {
  name: string;
  label: string;
  kind?: MediaKind;
  value: Array<{ asset: MediaSummary; caption: LocalizedText }>;
  max?: number;
}) {
  // Stable keys keep typed (uncontrolled) captions attached to their item
  // when items move; the `name` attributes follow the new positions.
  const nextKey = useRef(0);
  const keyed = (item: { asset: MediaSummary; caption: LocalizedText }) => {
    nextKey.current += 1;
    return { ...item, key: `item-${nextKey.current}` };
  };
  const [items, setItems] = useState(() => value.map(keyed));
  const [picking, setPicking] = useState(false);
  const move = (index: number, delta: number) =>
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
  return (
    <fieldset className="studio-media-list">
      <legend className="studio-field__label">{label}</legend>
      {items.length === 0 ? (
        <>
          <p className="studio-hint">No items.</p>
          <input type="hidden" name={`${name}:json`} value="[]" />
        </>
      ) : null}
      <ol className="studio-media-list__items">
        {items.map((item, index) => (
          <li className="studio-media-list__item" key={item.key}>
            <input
              type="hidden"
              name={`${name}.${index}.assetId`}
              value={item.asset.id}
            />
            <MediaThumb asset={item.asset} />
            <AssetSummaryLine asset={item.asset} />
            <div className="studio-picker__pair">
              <input
                className="studio-input"
                name={`${name}.${index}.caption.zh`}
                lang="zh-Hant"
                aria-label={`Caption ZH, item ${index + 1}`}
                placeholder="Caption ZH"
                defaultValue={item.caption.zh}
              />
              <input
                className="studio-input"
                name={`${name}.${index}.caption.en`}
                lang="en"
                aria-label={`Caption EN, item ${index + 1}`}
                placeholder="Caption EN"
                defaultValue={item.caption.en}
              />
            </div>
            <div className="studio-list-editor__controls">
              <button
                type="button"
                className="studio-order__step"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <span className="visually-hidden">
                  Move item {index + 1} up
                </span>
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="studio-order__step"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <span className="visually-hidden">
                  Move item {index + 1} down
                </span>
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={() =>
                  setItems((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {items.length < max ? (
        <button
          type="button"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          Add {KIND_LABEL[kind]}…
        </button>
      ) : null}
      {picking ? (
        <MediaPicker
          kind={kind}
          onSelect={(asset) => {
            setItems((current) => [
              ...current,
              keyed({ asset, caption: { zh: "", en: "" } }),
            ]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </fieldset>
  );
}
