/**
 * Content block editor for internal articles (admin-architecture §4.4:
 * "CONTENT block editor with ZH/EN tabs"). Ported from the legacy
 * `app/components/admin/BlockEditor.tsx` and extended to every block type of
 * `block-schema.ts`. Each locale posts one hidden `<name>.<locale>:json`
 * field; the block fields themselves have no `name`.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { LocalizedBlocks } from "../../../lib/cms/types";
import { MediaPicker, MediaThumb } from "../ui";
import {
  BLOCK_KINDS,
  BLOCK_LABEL,
  type BlockKind,
  copyEditorBlocks,
  createEditorBlock,
  type EditorBlock,
  moveEditorBlock,
  serializeBlocks,
  toEditorBlocks,
} from "./block-model";

type Locale = "zh" | "en";

const LOCALES: ReadonlyArray<{ key: Locale; label: string; lang: string }> = [
  { key: "zh", label: "ZH", lang: "zh-Hant" },
  { key: "en", label: "EN", lang: "en" },
];

type Patch = Partial<Omit<EditorBlock, "key" | "type">>;

function BlockFields({
  item,
  lang,
  idPrefix,
  asset,
  onPatch,
  onPickAsset,
}: {
  item: EditorBlock;
  lang: string;
  idPrefix: string;
  asset: MediaSummary | null;
  onPatch: (patch: Patch) => void;
  onPickAsset: (asset: MediaSummary) => void;
}) {
  const [picking, setPicking] = useState(false);
  const id = (field: string) => `${idPrefix}-${field}`;
  const input = (
    field: string,
    label: string,
    value: string,
    options: { type?: string; placeholder?: string; hint?: string } = {},
  ) => (
    <div className="studio-block__field">
      <label className="studio-field__label" htmlFor={id(field)}>
        {label}
      </label>
      <input
        id={id(field)}
        className="studio-input"
        type={options.type ?? "text"}
        lang={options.type === "url" ? undefined : lang}
        value={value}
        placeholder={options.placeholder}
        spellCheck={options.type !== "url"}
        onChange={(event) => onPatch({ [field]: event.currentTarget.value })}
      />
      {options.hint ? <p className="studio-hint">{options.hint}</p> : null}
    </div>
  );
  const textarea = (
    field: string,
    label: string,
    value: string,
    hint?: string,
  ) => (
    <div className="studio-block__field">
      <label className="studio-field__label" htmlFor={id(field)}>
        {label}
      </label>
      <textarea
        id={id(field)}
        className="studio-input studio-textarea"
        lang={lang}
        rows={field === "itemsText" ? 4 : 5}
        value={value}
        onChange={(event) => onPatch({ [field]: event.currentTarget.value })}
      />
      {hint ? <p className="studio-hint">{hint}</p> : null}
    </div>
  );

  switch (item.type) {
    case "heading":
      return (
        <div className="studio-block__grid studio-block__grid--heading">
          <div className="studio-block__field">
            <label className="studio-field__label" htmlFor={id("level")}>
              Level
            </label>
            <select
              id={id("level")}
              className="studio-input studio-select"
              value={item.level}
              onChange={(event) =>
                onPatch({
                  level: Number(event.currentTarget.value) === 3 ? 3 : 2,
                })
              }
            >
              <option value={2}>H2 section</option>
              <option value={3}>H3 subsection</option>
            </select>
          </div>
          {input("text", "Heading text", item.text)}
        </div>
      );
    case "paragraph":
      return textarea("text", "Paragraph", item.text);
    case "list":
      return (
        <div className="studio-block__grid">
          <div className="studio-block__field">
            <label className="studio-field__label" htmlFor={id("style")}>
              Style
            </label>
            <select
              id={id("style")}
              className="studio-input studio-select"
              value={item.style}
              onChange={(event) =>
                onPatch({
                  style:
                    event.currentTarget.value === "ordered"
                      ? "ordered"
                      : "unordered",
                })
              }
            >
              <option value="unordered">Bulleted</option>
              <option value="ordered">Numbered</option>
            </select>
          </div>
          {textarea("itemsText", "Items", item.itemsText, "One item per line.")}
        </div>
      );
    case "quote":
      return (
        <div className="studio-block__grid">
          {textarea("text", "Quote", item.text)}
          {input("attribution", "Attribution (optional)", item.attribution)}
        </div>
      );
    case "external_image":
      return (
        <div className="studio-block__grid">
          {input("url", "Image address", item.url, {
            type: "url",
            placeholder: "https://",
          })}
          {input("alt", "Alt text", item.alt, {
            hint: "Describe the image for people who cannot see it.",
          })}
          {input("caption", "Caption (optional)", item.caption)}
        </div>
      );
    case "external_link":
      return (
        <div className="studio-block__grid">
          {input("url", "Link address", item.url, {
            type: "url",
            placeholder: "https://",
          })}
          {input("label", "Link label", item.label)}
        </div>
      );
    case "media":
      return (
        <div className="studio-block__media">
          <div className="studio-block__media-summary">
            <MediaThumb asset={asset} />
            <span>
              {asset ? (
                <span className="studio-block__media-name">
                  {asset.filename}
                </span>
              ) : item.mediaId ? (
                <span className="studio-hint">Missing asset</span>
              ) : (
                <span className="studio-hint">No media chosen</span>
              )}
            </span>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              aria-expanded={picking}
              onClick={() => setPicking((open) => !open)}
            >
              {item.mediaId ? "Change…" : "Choose…"}
            </button>
          </div>
          {picking ? (
            <MediaPicker
              onSelect={(selected) => {
                onPickAsset(selected);
                onPatch({ mediaId: selected.id });
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          ) : null}
        </div>
      );
    case "divider":
      return (
        <p className="studio-block__divider">
          <span aria-hidden="true" className="studio-block__rule" />A thin rule
          between sections.
        </p>
      );
  }
}

function LocalePanel({
  locale,
  items,
  assets,
  errors,
  focusKey,
  onChange,
  onPickAsset,
  otherCount,
  onCopyOther,
  hidden,
  panelId,
  tabId,
}: {
  locale: (typeof LOCALES)[number];
  items: EditorBlock[];
  assets: ReadonlyMap<string, MediaSummary>;
  errors: Record<string, string>;
  focusKey: string | null;
  onChange: (next: EditorBlock[], focus?: string) => void;
  onPickAsset: (asset: MediaSummary) => void;
  otherCount: number;
  onCopyOther: () => void;
  hidden: boolean;
  panelId: string;
  tabId: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    const block = listRef.current?.querySelector<HTMLElement>(
      `[data-block-key="${CSS.escape(focusKey)}"]`,
    );
    block
      ?.querySelector<HTMLElement>(
        ".studio-block__body input, .studio-block__body textarea, .studio-block__body select, .studio-block__body button",
      )
      ?.focus();
  }, [focusKey]);

  const patch = (key: string, value: Patch) =>
    onChange(
      items.map((item) =>
        item.key === key ? ({ ...item, ...value } as EditorBlock) : item,
      ),
    );

  const add = (type: BlockKind) => {
    const block = createEditorBlock(type);
    onChange([...items, block], block.key);
  };

  return (
    <div
      className="studio-blocks__panel"
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={hidden}
    >
      {items.length === 0 ? (
        <div className="studio-blocks__empty">
          <p className="studio-hint">
            No {locale.label} blocks yet. Add a paragraph to start the article.
          </p>
          {otherCount > 0 ? (
            <button
              type="button"
              className="studio-btn studio-btn--secondary studio-btn--compact"
              onClick={onCopyOther}
            >
              Copy {otherCount} {otherCount === 1 ? "block" : "blocks"} from{" "}
              {locale.key === "zh" ? "EN" : "ZH"} to translate
            </button>
          ) : null}
        </div>
      ) : (
        <ol className="studio-blocks__list" ref={listRef}>
          {items.map((item, index) => {
            const error = errors[item.key];
            const idPrefix = `${panelId}-${item.key}`;
            return (
              <li
                className="studio-block"
                key={item.key}
                data-block-key={item.key}
                data-invalid={error ? "" : undefined}
              >
                <div className="studio-block__head">
                  <span className="studio-block__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="studio-block__type">
                    {BLOCK_LABEL[item.type]}
                  </span>
                  <div className="studio-block__controls">
                    <button
                      type="button"
                      className="studio-order__step"
                      disabled={index === 0}
                      onClick={() =>
                        onChange(moveEditorBlock(items, item.key, -1))
                      }
                    >
                      <span className="visually-hidden">
                        Move block {index + 1} up
                      </span>
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      className="studio-order__step"
                      disabled={index === items.length - 1}
                      onClick={() =>
                        onChange(moveEditorBlock(items, item.key, 1))
                      }
                    >
                      <span className="visually-hidden">
                        Move block {index + 1} down
                      </span>
                      <span aria-hidden="true">↓</span>
                    </button>
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--compact"
                      onClick={() =>
                        onChange(
                          items.filter((entry) => entry.key !== item.key),
                        )
                      }
                    >
                      Remove
                      <span className="visually-hidden">
                        {` block ${index + 1}`}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="studio-block__body">
                  <BlockFields
                    item={item}
                    lang={locale.lang}
                    idPrefix={idPrefix}
                    asset={
                      item.type === "media"
                        ? (assets.get(item.mediaId) ?? null)
                        : null
                    }
                    onPatch={(value) => patch(item.key, value)}
                    onPickAsset={onPickAsset}
                  />
                  {error ? (
                    <p className="studio-field__error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <fieldset className="studio-blocks__add">
        <legend className="studio-section-label">Add block</legend>
        {BLOCK_KINDS.map((kind) => (
          <button
            key={kind.type}
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => add(kind.type)}
          >
            {kind.label}
            <span className="visually-hidden">{` (${locale.label})`}</span>
          </button>
        ))}
      </fieldset>
    </div>
  );
}

export function BlockEditor({
  name,
  defaultValue,
  assets,
  onChange,
  label = "Article content",
  errors: serverErrors,
}: {
  name: string;
  defaultValue: LocalizedBlocks;
  /** Summaries of media referenced by the blocks. */
  assets: readonly MediaSummary[];
  /** Called after the posted value changed (dirty tracking, checklist). */
  onChange?: () => void;
  label?: string;
  /** Server messages for this field per locale. */
  errors?: Partial<Record<Locale, string>>;
}) {
  const baseId = useId();
  const [blocks, setBlocks] = useState(() => ({
    zh: toEditorBlocks(defaultValue.zh),
    en: toEditorBlocks(defaultValue.en),
  }));
  const [active, setActive] = useState<Locale>("zh");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [known, setKnown] = useState<ReadonlyMap<string, MediaSummary>>(
    () => new Map(assets.map((asset) => [asset.id, asset])),
  );
  const tabRefs = useRef<Record<Locale, HTMLButtonElement | null>>({
    zh: null,
    en: null,
  });

  const serialized = useMemo(
    () => ({ zh: serializeBlocks(blocks.zh), en: serializeBlocks(blocks.en) }),
    [blocks],
  );

  const first = useRef(true);
  const zhJson = JSON.stringify(serialized.zh.blocks);
  const enJson = JSON.stringify(serialized.en.blocks);
  // biome-ignore lint/correctness/useExhaustiveDependencies: notify only when the posted value changes
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange?.();
  }, [zhJson, enJson]);

  const update = (locale: Locale, next: EditorBlock[], focus?: string) => {
    setBlocks((current) => ({ ...current, [locale]: next }));
    setFocusKey(focus ?? null);
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const next: Locale =
      event.key === "Home"
        ? "zh"
        : event.key === "End"
          ? "en"
          : active === "zh"
            ? "en"
            : "zh";
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <fieldset className="studio-blocks">
      <legend className="studio-field__label">{label}</legend>
      {LOCALES.map((locale) => (
        <input
          key={locale.key}
          type="hidden"
          name={`${name}.${locale.key}:json`}
          value={locale.key === "zh" ? zhJson : enJson}
        />
      ))}
      <div className="studio-blocks__tabs" role="tablist" aria-label={label}>
        {LOCALES.map((locale) => {
          const count = serialized[locale.key].blocks.length;
          const invalid =
            Object.keys(serialized[locale.key].errors).length > 0 ||
            Boolean(serverErrors?.[locale.key]);
          return (
            <button
              key={locale.key}
              aria-selected={active === locale.key}
              ref={(element) => {
                tabRefs.current[locale.key] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${locale.key}`}
              aria-controls={`${baseId}-panel-${locale.key}`}
              tabIndex={active === locale.key ? 0 : -1}
              className="studio-blocks__tab"
              data-invalid={invalid ? "" : undefined}
              onClick={() => setActive(locale.key)}
              onKeyDown={onTabKey}
            >
              {locale.label}
              <span className="studio-blocks__count">
                {count === 0
                  ? " · empty"
                  : ` · ${count} ${count === 1 ? "block" : "blocks"}`}
              </span>
            </button>
          );
        })}
      </div>
      {LOCALES.map((locale) => {
        const other: Locale = locale.key === "zh" ? "en" : "zh";
        return (
          <div key={locale.key}>
            {serverErrors?.[locale.key] && active === locale.key ? (
              <p className="studio-field__error" role="alert">
                {serverErrors[locale.key]}
              </p>
            ) : null}
            <LocalePanel
              locale={locale}
              items={blocks[locale.key]}
              assets={known}
              errors={serialized[locale.key].errors}
              focusKey={active === locale.key ? focusKey : null}
              onChange={(next, focus) => update(locale.key, next, focus)}
              onPickAsset={(asset) =>
                setKnown((current) => new Map(current).set(asset.id, asset))
              }
              otherCount={serialized[other].blocks.length}
              onCopyOther={() =>
                update(locale.key, copyEditorBlocks(blocks[other]))
              }
              hidden={active !== locale.key}
              panelId={`${baseId}-panel-${locale.key}`}
              tabId={`${baseId}-tab-${locale.key}`}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
