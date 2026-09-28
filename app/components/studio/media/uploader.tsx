/**
 * Media uploader (content-architecture §4.3–4.4, admin-architecture §4.13):
 * the upload tab of every media picker and the upload panel of the library.
 *
 * Choose or drop a file → it is checked against the upload rules, its
 * width/height/duration are read in the browser, and a local preview plays
 * from a `blob:` URL (never autoplay). Upload declares the file, streams it
 * with a native `<progress>`, and hands the ready asset to `onUploaded`.
 * Props contract (foundation): `{ kind, onUploaded(summary) }`.
 *
 * The uploader sits inside editor forms: none of its controls has a `name`
 * (nothing leaks into the entry's form data), every button is
 * `type="button"`, and Enter never submits the surrounding form.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useMediaConfig } from "../../../lib/cms/media/media-config-context";
import {
  type ExtractedMetadata,
  extractMediaMetadata,
} from "../../../lib/cms/media/metadata.client";
import {
  acceptAttribute,
  UPLOAD_RULES,
  type UploadKind,
} from "../../../lib/cms/media/signatures";
import {
  formatBytes,
  formatDuration,
  type MediaSummary,
} from "../../../lib/cms/media/summary";
import type { MediaKind } from "../../../lib/cms/schemas/media-asset";
import type { LocalizedText } from "../../../lib/cms/types";
import { useStudioSession } from "../ui/studio-session";
import { useToast } from "../ui/toast";
import { preflightUpload, UploadFailure, uploadFile } from "./upload-client";

export interface MediaUploaderProps {
  kind?: MediaKind;
  onUploaded: (asset: MediaSummary) => void;
  /** `picker` (inside a media field) or `library` (the Media page). */
  variant?: "picker" | "library";
}

type Selected = {
  file: File;
  kind: UploadKind;
  mimeType: string;
  metadata: ExtractedMetadata;
};

type Phase =
  | { name: "idle"; message?: string }
  | { name: "reading"; file: File }
  | { name: "ready"; selected: Selected }
  | {
      name: "uploading";
      selected: Selected;
      loaded: number;
      total: number;
    }
  | { name: "failed"; selected: Selected; message: string }
  | { name: "done"; asset: MediaSummary };

const KIND_LABEL: Record<UploadKind, string> = {
  image: "Images",
  audio: "Audio",
  video: "Video",
  document: "PDF",
};

/** "Images 20 MB · Audio 95 MB · …" for the kinds this uploader accepts. */
export function uploadLimitsLabel(kind?: MediaKind): string {
  const kinds = (Object.keys(UPLOAD_RULES) as UploadKind[]).filter(
    (item) => !kind || !(kind in UPLOAD_RULES) || item === kind,
  );
  return kinds
    .map(
      (item) =>
        `${KIND_LABEL[item]} up to ${Math.round(UPLOAD_RULES[item].maxBytes / (1024 * 1024))} MB`,
    )
    .join(" · ");
}

function stopEnter(event: React.KeyboardEvent) {
  if (event.key === "Enter") event.preventDefault();
}

function LocalPreview({ selected }: { selected: Selected }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(selected.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [selected.file]);
  if (!url) return <div className="studio-uploader__preview" />;
  switch (selected.kind) {
    case "image":
      return (
        <div className="studio-uploader__preview">
          <img className="studio-uploader__image" src={url} alt="" />
        </div>
      );
    case "audio":
      return (
        <div className="studio-uploader__preview studio-uploader__preview--audio">
          {/* Local preview of the chosen file; never autoplays. */}
          {/* biome-ignore lint/a11y/useMediaCaption: owner's own unpublished audio; no captions exist yet */}
          <audio controls preload="metadata" src={url} />
        </div>
      );
    case "video":
      return (
        <div className="studio-uploader__preview">
          {/* biome-ignore lint/a11y/useMediaCaption: owner's own unpublished video preview */}
          <video
            className="studio-uploader__video"
            controls
            preload="metadata"
            src={url}
          />
        </div>
      );
    default:
      return (
        <div className="studio-uploader__preview studio-uploader__preview--doc">
          <span className="studio-uploader__doc" aria-hidden="true">
            PDF
          </span>
        </div>
      );
  }
}

function FileFacts({
  file,
  mimeType,
  metadata,
}: {
  file: File;
  mimeType: string;
  metadata: ExtractedMetadata;
}) {
  const duration = formatDuration(metadata.durationMs);
  return (
    <dl className="studio-facts">
      <div>
        <dt>File</dt>
        <dd className="studio-facts__name">{file.name}</dd>
      </div>
      <div>
        <dt>Type</dt>
        <dd>{mimeType}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>{formatBytes(file.size)}</dd>
      </div>
      {duration ? (
        <div>
          <dt>Duration</dt>
          <dd>{duration}</dd>
        </div>
      ) : null}
      {metadata.width && metadata.height ? (
        <div>
          <dt>Dimensions</dt>
          <dd>
            {metadata.width} × {metadata.height}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function TextPair({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
}) {
  const id = useId();
  return (
    <fieldset className="studio-uploader__pair">
      <legend className="studio-field__label">{label}</legend>
      <div className="studio-picker__pair">
        <input
          id={`${id}-zh`}
          className="studio-input"
          lang="zh-Hant"
          aria-label={`${label} ZH`}
          placeholder="ZH"
          value={value.zh}
          onKeyDown={stopEnter}
          onChange={(event) =>
            onChange({ ...value, zh: event.currentTarget.value })
          }
        />
        <input
          id={`${id}-en`}
          className="studio-input"
          lang="en"
          aria-label={`${label} EN`}
          placeholder="EN"
          value={value.en}
          onKeyDown={stopEnter}
          onChange={(event) =>
            onChange({ ...value, en: event.currentTarget.value })
          }
        />
      </div>
      {hint ? <p className="studio-hint">{hint}</p> : null}
    </fieldset>
  );
}

function percent(loaded: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
}

export function MediaUploader({
  kind,
  onUploaded,
  variant = "picker",
}: MediaUploaderProps) {
  const config = useMediaConfig();
  const { csrfToken, setToken } = useStudioSession();
  const toast = useToast();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [title, setTitle] = useState<LocalizedText>({ zh: "", en: "" });
  const [alt, setAlt] = useState<LocalizedText>({ zh: "", en: "" });
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!config.uploadsEnabled) {
    return (
      <div className="studio-uploader studio-uploader--off">
        <p className="studio-uploader__title">
          Uploads are off: no media bucket is configured for this site.
        </p>
        <p className="studio-hint">
          {variant === "library"
            ? "Register URL still adds media hosted elsewhere (YouTube, Google Drive, GitHub, or any https:// file)."
            : "Use Register URL to add media hosted elsewhere (YouTube, Google Drive, GitHub, or any https:// file)."}
        </p>
      </div>
    );
  }

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const check = preflightUpload(file, kind);
    if (!check.ok) {
      setPhase({ name: "idle", message: check.message });
      return;
    }
    setPhase({ name: "reading", file });
    const metadata = await extractMediaMetadata(file, check.kind);
    setTitle({ zh: "", en: "" });
    setAlt({ zh: "", en: "" });
    setPhase({
      name: "ready",
      selected: { file, kind: check.kind, mimeType: check.mimeType, metadata },
    });
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase({ name: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const start = async (selected: Selected) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({
      name: "uploading",
      selected,
      loaded: 0,
      total: selected.file.size,
    });
    try {
      const asset = await uploadFile(
        {
          file: selected.file,
          mimeType: selected.mimeType,
          kind,
          metadata: selected.metadata,
          title,
          alt: selected.kind === "image" ? alt : { zh: "", en: "" },
        },
        {
          csrfToken,
          onToken: setToken,
          signal: controller.signal,
          onProgress: (loaded, total) =>
            setPhase((current) =>
              current.name === "uploading"
                ? { ...current, loaded, total }
                : current,
            ),
        },
      );
      setPhase({ name: "done", asset });
      toast.show({
        message: `Uploaded ${asset.filename}${asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ""}`,
      });
      onUploaded(asset);
    } catch (error) {
      if (error instanceof UploadFailure && error.code === "aborted") {
        setPhase({ name: "ready", selected });
        return;
      }
      setPhase({
        name: "failed",
        selected,
        message:
          error instanceof Error && error.message
            ? error.message
            : "The upload failed. Try again.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const selected =
    phase.name === "ready" ||
    phase.name === "uploading" ||
    phase.name === "failed"
      ? phase.selected
      : null;

  return (
    <div className={`studio-uploader studio-uploader--${variant}`}>
      {phase.name === "idle" || phase.name === "reading" ? (
        <label
          className="studio-uploader__drop"
          htmlFor={`${id}-file`}
          data-dragging={dragging ? "" : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void choose(event.dataTransfer.files[0]);
          }}
        >
          <span className="studio-uploader__trace" aria-hidden="true" />
          <span className="studio-uploader__cta">
            {phase.name === "reading"
              ? `Reading ${phase.file.name}…`
              : "Drop a file here, or choose one"}
          </span>
          <span className="studio-uploader__limits">
            {uploadLimitsLabel(kind)}
          </span>
          <input
            ref={inputRef}
            id={`${id}-file`}
            className="visually-hidden"
            type="file"
            accept={acceptAttribute(kind)}
            disabled={phase.name === "reading"}
            onChange={(event) => void choose(event.currentTarget.files?.[0])}
          />
        </label>
      ) : null}

      {phase.name === "idle" && phase.message ? (
        <p className="studio-field__error" role="alert">
          {phase.message}
        </p>
      ) : null}

      {selected ? (
        <div className="studio-uploader__selected">
          <LocalPreview selected={selected} />
          <div className="studio-uploader__details">
            <FileFacts
              file={selected.file}
              mimeType={selected.mimeType}
              metadata={selected.metadata}
            />
            {phase.name === "ready" || phase.name === "failed" ? (
              <>
                <TextPair label="Title" value={title} onChange={setTitle} />
                {selected.kind === "image" ? (
                  <TextPair
                    label="Alt text"
                    hint="Describe the image. Required in both languages before a published entry can use it."
                    value={alt}
                    onChange={setAlt}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase.name === "uploading" ? (
        <div className="studio-uploader__progress">
          <progress
            className="studio-progress"
            max={phase.total || 1}
            value={phase.loaded}
            aria-label={`Uploading ${phase.selected.file.name}`}
          />
          <p className="studio-uploader__status" aria-live="polite">
            Uploading {percent(phase.loaded, phase.total)}% ·{" "}
            {formatBytes(phase.loaded) ?? "0 B"} of {formatBytes(phase.total)}
          </p>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel upload
          </button>
        </div>
      ) : null}

      {phase.name === "failed" ? (
        <p className="studio-field__error" role="alert">
          {phase.message}
        </p>
      ) : null}

      {phase.name === "ready" || phase.name === "failed" ? (
        <div className="studio-uploader__actions">
          <button
            type="button"
            className="studio-btn studio-btn--primary studio-btn--compact"
            onClick={() => void start(phase.selected)}
          >
            {phase.name === "failed" ? "Try again" : "Upload"}
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={reset}
          >
            Choose another file
          </button>
        </div>
      ) : null}

      {phase.name === "done" ? (
        <div className="studio-uploader__done" role="status">
          <p className="studio-uploader__title">
            Uploaded {phase.asset.filename}
            {phase.asset.sizeBytes
              ? ` · ${formatBytes(phase.asset.sizeBytes)}`
              : ""}
          </p>
          {variant === "library" ? (
            <div className="studio-uploader__actions">
              <a
                className="studio-btn studio-btn--secondary studio-btn--compact"
                href={`/studio/media/${phase.asset.id}`}
              >
                Open asset
              </a>
              <button
                type="button"
                className="studio-btn studio-btn--ghost studio-btn--compact"
                onClick={reset}
              >
                Upload another
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
