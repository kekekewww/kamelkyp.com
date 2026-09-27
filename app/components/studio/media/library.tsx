/**
 * Studio → Media (brief §18–19, admin-architecture §2.2, §5.11): upload and
 * URL registration panels, upload / analysis status, search and filters,
 * a ruled ledger of assets (thumbnail, type, size, duration or dimensions,
 * usage, state, copy URL, play) and cursor paging.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  Form,
  Link,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";
import {
  formatBytes,
  formatDuration,
  type MediaSummary,
} from "../../../lib/cms/media/summary";
import type {
  LibraryItemView,
  MediaLibraryData,
} from "../../../lib/cms/repositories/media-library.server";
import type { MediaKind } from "../../../lib/cms/schemas/media-asset";
import { StudioPage } from "../shell/studio-page";
import { EmptyState } from "../ui/list";
import { MediaThumb } from "../ui/media-field";
import { StudioForm } from "../ui/studio-form";
import { useToast } from "../ui/toast";
import { CopyUrlButton } from "./copy-url";
import { MediaUploader } from "./uploader";

const KIND_OPTIONS: Array<{ value: MediaKind | ""; label: string }> = [
  { value: "", label: "All kinds" },
  { value: "image", label: "Images" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "document", label: "Documents" },
  { value: "embed", label: "Embeds" },
  { value: "link", label: "Links" },
];

const KIND_LABEL: Record<MediaKind, string> = {
  image: "Image",
  audio: "Audio",
  video: "Video",
  document: "Document",
  embed: "Embed",
  link: "Link",
};

type ActionData = {
  ok?: boolean;
  message?: string;
  asset?: MediaSummary;
  assets?: number;
  usages?: number;
};

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function assetMeta(summary: MediaSummary): string {
  const parts: string[] = [KIND_LABEL[summary.kind]];
  const size = formatBytes(summary.sizeBytes);
  if (size) parts.push(size);
  const duration = formatDuration(summary.durationMs);
  if (duration) parts.push(duration);
  if (summary.width && summary.height) {
    parts.push(`${summary.width} × ${summary.height}`);
  }
  return parts.join(" · ");
}

function StatusStrip({ data }: { data: MediaLibraryData }) {
  const fetcher = useFetcher<ActionData>();
  const toast = useToast();
  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data;
      if (result?.ok) {
        toast.show({
          message: `Usage index rebuilt: ${result.usages ?? 0} usages across ${result.assets ?? 0} assets`,
        });
      } else if (result) {
        toast.show({
          tone: "error",
          message: result.message ?? "The usage index could not be rebuilt.",
        });
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, toast]);

  const { uploads, analysis } = data;
  return (
    <section className="studio-media-status" aria-label="Media status">
      <p className="studio-media-status__item">
        <span
          className="studio-media-status__dot"
          data-on={uploads.enabled ? "" : undefined}
          aria-hidden="true"
        />
        {uploads.enabled ? (
          <>
            Uploads on
            <span className="studio-media-status__host">{uploads.host}</span>
          </>
        ) : (
          <>
            Uploads off
            <span className="studio-media-status__note">
              No media bucket is configured. Register URL still works.
            </span>
          </>
        )}
      </p>
      <p className="studio-media-status__item">
        <span
          className="studio-media-status__dot"
          data-on={analysis.enabled ? "" : undefined}
          aria-hidden="true"
        />
        {analysis.enabled ? "Audio analysis on" : "Audio analysis off"}
        {analysis.host ? (
          <span className="studio-media-status__host">{analysis.host}</span>
        ) : null}
        <span className="studio-media-status__note">
          {analysis.enabled
            ? "The public player reads levels from audio on this host."
            : analysis.host
              ? "Add the bucket's CORS rule, test an audio file, then add the host to MEDIA_CORS_HOSTS."
              : "Set MEDIA_PUBLIC_BASE_URL to serve uploads."}
          {analysis.corsHosts.length > 0
            ? ` Analysis runs for: ${analysis.corsHosts.join(", ")}.`
            : ""}
        </span>
      </p>
      {data.pendingCount > 0 ? (
        <p className="studio-media-status__item studio-media-status__item--warn">
          {data.pendingCount}{" "}
          {data.pendingCount === 1 ? "upload" : "uploads"} pending or failed
          <span className="studio-media-status__note">
            Unfinished uploads are removed after 24 hours.
          </span>
        </p>
      ) : null}
      <StudioForm fetcher={fetcher} className="studio-media-status__action">
        <button
          type="submit"
          name="intent"
          value="rebuild-usages"
          className="studio-btn studio-btn--ghost studio-btn--compact"
          aria-busy={fetcher.state !== "idle" || undefined}
        >
          {fetcher.state !== "idle" ? "Rebuilding…" : "Rebuild usage index"}
        </button>
      </StudioForm>
    </section>
  );
}

function RegisterUrlPanel({ onDone }: { onDone: () => void }) {
  const fetcher = useFetcher<ActionData>();
  const toast = useToast();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current !== "idle" && fetcher.state === "idle") {
      if (fetcher.data?.ok && fetcher.data.asset) {
        toast.show({ message: `Registered ${fetcher.data.asset.filename}` });
        formRef.current?.reset();
        onDone();
      }
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, toast, onDone]);

  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;
  return (
    <section className="studio-media-panel" aria-labelledby={`${id}-title`}>
      <h2 className="studio-section-label" id={`${id}-title`}>
        Register URL
      </h2>
      <StudioForm
        fetcher={fetcher}
        ref={formRef}
        className="studio-media-register"
      >
        <label className="studio-field__label" htmlFor={`${id}-url`}>
          Address (https://)
        </label>
        <input
          id={`${id}-url`}
          className="studio-input"
          name="url"
          type="url"
          inputMode="url"
          required
          placeholder="https://www.youtube.com/watch?v=…"
          aria-describedby={`${id}-hint`}
        />
        <p className="studio-hint" id={`${id}-hint`}>
          YouTube, Google Drive, GitHub raw audio, or any https:// image, audio,
          video or PDF. Dropbox and MediaFire are kept as links.
        </p>
        <div className="studio-picker__pair">
          <input
            className="studio-input"
            name="title.zh"
            lang="zh-Hant"
            aria-label="Title ZH"
            placeholder="Title ZH"
          />
          <input
            className="studio-input"
            name="title.en"
            lang="en"
            aria-label="Title EN"
            placeholder="Title EN"
          />
        </div>
        <div className="studio-picker__pair">
          <input
            className="studio-input"
            name="alt.zh"
            lang="zh-Hant"
            aria-label="Alt text ZH (images)"
            placeholder="Alt text ZH (images)"
          />
          <input
            className="studio-input"
            name="alt.en"
            lang="en"
            aria-label="Alt text EN (images)"
            placeholder="Alt text EN (images)"
          />
        </div>
        {error ? (
          <p className="studio-field__error" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            name="intent"
            value="register-url"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-busy={fetcher.state !== "idle" || undefined}
          >
            {fetcher.state !== "idle" ? "Registering…" : "Register"}
          </button>
        </div>
      </StudioForm>
    </section>
  );
}

function Filters({ filters }: { filters: MediaLibraryData["filters"] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || isTyping(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const submit = () => formRef.current?.requestSubmit();
  return (
    <Form
      ref={formRef}
      method="get"
      role="search"
      aria-label="Filter media"
      className="studio-filterbar"
      preventScrollReset
    >
      <div className="studio-filterbar__search">
        <label className="visually-hidden" htmlFor={`${id}-q`}>
          Search media
        </label>
        <input
          ref={searchRef}
          id={`${id}-q`}
          className="studio-input"
          type="search"
          name="q"
          placeholder="Search filename, title, alt text  /"
          defaultValue={filters.q}
        />
      </div>
      <label className="visually-hidden" htmlFor={`${id}-kind`}>
        Kind
      </label>
      <select
        id={`${id}-kind`}
        className="studio-input studio-select studio-media-filter__kind"
        name="kind"
        defaultValue={filters.kind ?? ""}
        onChange={submit}
      >
        {KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <fieldset className="studio-segmented">
        <legend className="visually-hidden">Usage</legend>
        {[
          { value: "", label: "Any use" },
          { value: "used", label: "Used" },
          { value: "unused", label: "Unused" },
        ].map((option) => (
          <label className="studio-segmented__option" key={option.value}>
            <input
              type="radio"
              name="usage"
              value={option.value}
              defaultChecked={(filters.usage ?? "") === option.value}
              onChange={submit}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="studio-check studio-media-filter__check">
        <input
          type="checkbox"
          name="missingAlt"
          value="1"
          defaultChecked={filters.missingAlt}
          onChange={submit}
        />
        <span>Missing alt text</span>
      </label>
      <label className="studio-check studio-media-filter__check">
        <input
          type="checkbox"
          name="archived"
          value="1"
          defaultChecked={filters.archived}
          onChange={submit}
        />
        <span>Archived</span>
      </label>
      <button
        type="submit"
        className="studio-btn studio-btn--ghost studio-btn--compact"
      >
        Apply
      </button>
    </Form>
  );
}

function usageLabel(item: LibraryItemView): string {
  if (item.usageCount === 0) return "Unused";
  return `Used in ${item.usageCount} ${item.usageCount === 1 ? "place" : "places"}`;
}

function Row({ item }: { item: LibraryItemView }) {
  const { summary } = item;
  const title = summary.title?.en.trim() || summary.title?.zh.trim() || "";
  const playable =
    Boolean(summary.url) &&
    (summary.kind === "audio" || summary.kind === "video") &&
    item.provider !== "youtube";
  return (
    <li className="studio-media-row" data-state={summary.state}>
      <MediaThumb asset={summary} />
      <div className="studio-media-row__main">
        <Link
          className="studio-media-row__name"
          to={`/studio/media/${summary.id}`}
        >
          {summary.filename}
        </Link>
        {title ? (
          <span className="studio-media-row__title">{title}</span>
        ) : null}
        <span className="studio-media-row__meta">{assetMeta(summary)}</span>
      </div>
      <div className="studio-media-row__flags">
        <span className="studio-media-row__usage">{usageLabel(item)}</span>
        {item.publishedUsageCount > 0 ? (
          <span className="studio-badge studio-badge--published">Live</span>
        ) : null}
        {item.missingAlt ? (
          <span className="studio-badge studio-media-flag--warn">
            Alt text missing
          </span>
        ) : null}
        {summary.state === "pending" ? (
          <span className="studio-badge studio-media-flag--warn">
            Upload pending
          </span>
        ) : null}
        {summary.state === "failed" ? (
          <span className="studio-badge studio-media-flag--danger">
            Upload failed
          </span>
        ) : null}
        {item.archived ? (
          <span className="studio-badge studio-badge--archived">Archived</span>
        ) : null}
      </div>
      <span className="studio-media-row__date">
        {item.createdAt.slice(0, 10)}
      </span>
      <div className="studio-media-row__actions">
        {summary.url ? <CopyUrlButton url={summary.url} /> : null}
        {playable && summary.url ? (
          <details className="studio-media-row__play">
            <summary className="studio-btn studio-btn--ghost studio-btn--compact">
              Play
            </summary>
            {summary.kind === "audio" ? (
              // biome-ignore lint/a11y/useMediaCaption: owner-side preview of an uploaded file
              <audio controls preload="none" src={summary.url} />
            ) : (
              // biome-ignore lint/a11y/useMediaCaption: owner-side preview of an uploaded file
              <video controls preload="none" src={summary.url} />
            )}
          </details>
        ) : null}
      </div>
    </li>
  );
}

function pageHref(
  params: URLSearchParams,
  cursor: string | null,
): string {
  const next = new URLSearchParams(params);
  if (cursor) next.set("cursor", cursor);
  else next.delete("cursor");
  const query = next.toString();
  return query ? `?${query}` : "?";
}

export function MediaLibraryView({ data }: { data: MediaLibraryData }) {
  const [params] = useSearchParams();
  const revalidator = useRevalidator();
  const toast = useToast();
  const [panel, setPanel] = useState<"upload" | "url" | null>(() =>
    params.get("upload") === "1" ? "upload" : null,
  );
  const deleted = params.get("deleted");
  const shownDeleted = useRef<string | null>(null);
  useEffect(() => {
    if (deleted && shownDeleted.current !== deleted) {
      shownDeleted.current = deleted;
      toast.show({ message: `Deleted ${deleted}` });
    }
  }, [deleted, toast]);

  const filtered = Boolean(
    data.filters.q ||
      data.filters.kind ||
      data.filters.usage ||
      data.filters.missingAlt ||
      data.filters.archived,
  );
  const toggle = (value: "upload" | "url") =>
    setPanel((current) => (current === value ? null : value));

  return (
    <StudioPage
      title="Media"
      actions={
        <>
          <button
            type="button"
            className="studio-btn studio-btn--primary studio-btn--compact"
            aria-expanded={panel === "upload"}
            onClick={() => toggle("upload")}
          >
            Upload
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            aria-expanded={panel === "url"}
            onClick={() => toggle("url")}
          >
            Register URL
          </button>
        </>
      }
    >
      <div className="studio-media">
        <StatusStrip data={data} />
        {panel === "upload" ? (
          <section className="studio-media-panel" aria-label="Upload">
            <MediaUploader
              variant="library"
              onUploaded={() => revalidator.revalidate()}
            />
          </section>
        ) : null}
        {panel === "url" ? (
          <RegisterUrlPanel onDone={() => revalidator.revalidate()} />
        ) : null}
        <Filters filters={data.filters} />
        {data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No media matches these filters"
              action={
                <Link className="studio-link" to="/studio/media">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No media yet"
              body="Upload a file or register a URL to start the library."
              action={
                <button
                  type="button"
                  className="studio-btn studio-btn--secondary studio-btn--compact"
                  onClick={() => setPanel("upload")}
                >
                  Upload
                </button>
              }
            />
          )
        ) : (
          <ul className="studio-media-rows" aria-label="Media assets">
            {data.items.map((item) => (
              <Row key={item.summary.id} item={item} />
            ))}
          </ul>
        )}
        {data.next || data.filters.cursor ? (
          <nav className="studio-media-pager" aria-label="Pages">
            {data.filters.cursor ? (
              <Link className="studio-link" to={pageHref(params, null)}>
                Newest
              </Link>
            ) : null}
            {data.next ? (
              <Link className="studio-link" to={pageHref(params, data.next)}>
                Older media
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </StudioPage>
  );
}
