/**
 * Studio → Media → asset (admin-architecture §4.4 "Media asset", §4.9):
 * preview, facts, public URL (copy), title / alt text / caption ZH·EN,
 * credit, focal point (images: a 5 × 5 grid of radio buttons over the image,
 * rendered with classes, no inline style), preview range (audio/video), tags,
 * every usage with a link, audio analysis status with "Test CORS", archive,
 * and delete with the safety rules (refused while live; drafts listed).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import {
  formatBytes,
  formatDuration,
} from "../../../lib/cms/media/summary";
import { focalClasses } from "../../../lib/cms/media/urls";
import type { MediaDetailData } from "../../../lib/cms/repositories/media-library.server";
import type { ActionResult } from "../../../lib/cms/studio/responses";
import { StudioPage } from "../shell/studio-page";
import { SaveStateIndicator } from "../ui/badges";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { NumberInput, TextInput } from "../ui/fields";
import { TagInput } from "../ui/list-editor";
import { LocalizedTextArea, LocalizedTextField } from "../ui/localized-field";
import { IntentButton, StudioForm } from "../ui/studio-form";
import { useToast } from "../ui/toast";
import { useEditorForm } from "../ui/use-editor-form";
import { CopyUrlButton } from "./copy-url";
import { CorsTest } from "./cors-test";
import { LeaveGuard } from "./leave-guard";
import { groupUsages, usageHref, usageTypeLabel } from "./usage";

const FOCAL_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;
const FORM_ID = "asset-form";

const KIND_LABEL = {
  image: "Image",
  audio: "Audio",
  video: "Video",
  document: "Document",
  embed: "Embed",
  link: "Link",
} as const;

function quantize(value: number | null): number | null {
  if (value === null) return null;
  return FOCAL_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}

function stepPercent(value: number): string {
  return String(Math.round(value * 100));
}

function FocalPoint({
  src,
  width,
  height,
  initial,
}: {
  src: string;
  width: number | null;
  height: number | null;
  initial: { x: number | null; y: number | null };
}) {
  const id = useId();
  const [point, setPoint] = useState(() => ({
    x: quantize(initial.x),
    y: quantize(initial.y),
  }));
  const classes = focalClasses({ focalX: point.x, focalY: point.y });
  return (
    <fieldset className="studio-focal" aria-describedby={`${id}-hint`}>
      <legend className="studio-field__label">Focal point</legend>
      <input
        type="hidden"
        name="focalX:number"
        value={point.x === null ? "" : String(point.x)}
      />
      <input
        type="hidden"
        name="focalY:number"
        value={point.y === null ? "" : String(point.y)}
      />
      <div className="studio-focal__stage">
        <img
          className="studio-focal__image"
          src={src}
          alt=""
          width={width ?? undefined}
          height={height ?? undefined}
          decoding="async"
        />
        <div className="studio-focal__grid">
          {FOCAL_STEPS.flatMap((y) =>
            FOCAL_STEPS.map((x) => {
              const checked = point.x === x && point.y === y;
              return (
                <label
                  className="studio-focal__cell"
                  key={`${x}-${y}`}
                  data-checked={checked ? "" : undefined}
                >
                  <input
                    className="visually-hidden"
                    type="radio"
                    name="focal"
                    value={`${x},${y}`}
                    defaultChecked={checked}
                    onChange={() => setPoint({ x, y })}
                  />
                  <span className="visually-hidden">
                    {`Focus ${stepPercent(x)}% from the left, ${stepPercent(y)}% from the top`}
                  </span>
                </label>
              );
            }),
          )}
        </div>
      </div>
      <div className="studio-focal__crops" aria-hidden="true">
        <img
          className={`studio-focal__crop studio-focal__crop--square ${classes}`}
          src={src}
          alt=""
          decoding="async"
        />
        <img
          className={`studio-focal__crop studio-focal__crop--wide ${classes}`}
          src={src}
          alt=""
          decoding="async"
        />
      </div>
      <p className="studio-hint" id={`${id}-hint`}>
        {point.x === null
          ? "Centered. Choose the part of the image that must stay visible when covers crop it."
          : `Crops keep ${stepPercent(point.x)}% from the left, ${stepPercent(point.y ?? 0.5)}% from the top.`}{" "}
        {point.x !== null ? (
          <button
            type="button"
            className="studio-link studio-focal__reset"
            onClick={(event) => {
              setPoint({ x: null, y: null });
              const form = event.currentTarget.form;
              form
                ?.querySelectorAll<HTMLInputElement>('input[name="focal"]')
                .forEach((input) => {
                  input.checked = false;
                });
              form?.dispatchEvent(new Event("input", { bubbles: true }));
            }}
          >
            Reset to center
          </button>
        ) : null}
      </p>
    </fieldset>
  );
}

function Preview({ data }: { data: MediaDetailData }) {
  const { asset, publicUrl } = data;
  if (!publicUrl) {
    return (
      <div className="studio-asset__missing">
        No public address: MEDIA_PUBLIC_BASE_URL is not configured.
      </div>
    );
  }
  switch (asset.kind) {
    case "image":
      return null; // The focal point stage shows the image.
    case "audio":
      return (
        <div className="studio-asset__player">
          {/* Never autoplays: nothing loads until the owner presses play. */}
          {/* biome-ignore lint/a11y/useMediaCaption: owner-side preview of an uploaded file */}
          <audio controls preload="none" src={publicUrl} />
        </div>
      );
    case "video":
      if (asset.provider === "youtube") break;
      return (
        <div className="studio-asset__player">
          {/* biome-ignore lint/a11y/useMediaCaption: owner-side preview of an uploaded file */}
          <video
            className="studio-asset__video"
            controls
            preload="none"
            src={publicUrl}
          />
        </div>
      );
    default:
      break;
  }
  return (
    <p className="studio-asset__external">
      <a
        className="studio-link"
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open {asset.provider === "youtube" ? "on YouTube" : "the file"}
      </a>
    </p>
  );
}

function Facts({ data }: { data: MediaDetailData }) {
  const { asset } = data;
  const duration = formatDuration(asset.durationMs);
  return (
    <dl className="studio-facts studio-facts--wide">
      <div>
        <dt>Type</dt>
        <dd>
          {KIND_LABEL[asset.kind]}
          {asset.mimeType ? ` · ${asset.mimeType}` : ""}
        </dd>
      </div>
      {asset.sizeBytes ? (
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(asset.sizeBytes)}</dd>
        </div>
      ) : null}
      {asset.width && asset.height ? (
        <div>
          <dt>Dimensions</dt>
          <dd>
            {asset.width} × {asset.height}
          </dd>
        </div>
      ) : null}
      {duration ? (
        <div>
          <dt>Duration</dt>
          <dd>{duration}</dd>
        </div>
      ) : null}
      <div>
        <dt>Source</dt>
        <dd>
          {asset.source === "r2"
            ? "Uploaded"
            : `External · ${asset.provider.replace("_", " ")}`}
        </dd>
      </div>
      <div>
        <dt>Added</dt>
        <dd>{asset.createdAt.slice(0, 10)}</dd>
      </div>
    </dl>
  );
}

function Usages({ data }: { data: MediaDetailData }) {
  const groups = groupUsages(data.usages);
  return (
    <section className="studio-asset__section" aria-labelledby="asset-usages">
      <h2 className="studio-section-label" id="asset-usages">
        Used in
      </h2>
      {groups.length === 0 ? (
        <p className="studio-hint">
          Not used anywhere. It can be deleted safely.
        </p>
      ) : (
        <ul className="studio-usages">
          {groups.map((group) => (
            <li className="studio-usages__row" key={group.key}>
              <span className="studio-usages__type">
                {usageTypeLabel(group.usage)}
              </span>
              <Link className="studio-usages__link" to={usageHref(group.usage)}>
                {group.usage.label}
              </Link>
              <span className="studio-usages__fields">
                {group.fields.join(", ")}
              </span>
              {group.live ? (
                <span className="studio-badge studio-badge--published">
                  Live
                </span>
              ) : (
                <span className="studio-badge studio-badge--draft">
                  Draft only
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DangerZone({ data }: { data: MediaDetailData }) {
  const deleteFetcher = useFetcher<ActionResult>();
  const archiveFetcher = useFetcher<ActionResult>();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const groups = groupUsages(data.usages);
  const live = groups.filter((group) => group.live);
  const drafts = groups.filter((group) => !group.live);
  const { asset } = data;
  const previous = useRef(archiveFetcher.state);
  useEffect(() => {
    if (previous.current !== "idle" && archiveFetcher.state === "idle") {
      const result = archiveFetcher.data;
      if (result?.ok) {
        toast.show({
          message: asset.archivedAt ? "Restored" : "Archived",
        });
      } else if (result && !result.ok) {
        toast.show({ tone: "error", message: result.message });
      }
    }
    previous.current = archiveFetcher.state;
  }, [archiveFetcher.state, archiveFetcher.data, toast, asset.archivedAt]);

  const deleteError =
    deleteFetcher.data && !deleteFetcher.data.ok
      ? deleteFetcher.data.message
      : null;

  return (
    <section className="studio-asset__section" aria-labelledby="asset-danger">
      <h2 className="studio-section-label" id="asset-danger">
        Archive and delete
      </h2>
      <StudioForm fetcher={archiveFetcher} className="studio-asset__archive">
        <input type="hidden" name="id" value={asset.id} />
        <button
          type="submit"
          name="intent"
          value={asset.archivedAt ? "restore" : "archive"}
          className="studio-btn studio-btn--secondary studio-btn--compact"
        >
          {asset.archivedAt ? "Restore" : "Archive"}
        </button>
        <span className="studio-hint">
          {asset.archivedAt
            ? "Archived: hidden from pickers; entries that use it keep working."
            : "Archiving hides it from pickers; entries that use it keep working."}
        </span>
      </StudioForm>
      {live.length > 0 ? (
        <p className="studio-asset__blocked">
          {`Published content uses this asset. Unpublish or replace it in: ${live
            .map((group) => group.usage.label)
            .join(", ")}.`}
        </p>
      ) : (
        <>
          <button
            type="button"
            className="studio-btn studio-btn--danger studio-btn--compact"
            onClick={() => setConfirming(true)}
          >
            Delete…
          </button>
          <ConfirmDialog
            open={confirming}
            tone="danger"
            title={`Delete ${asset.filename}?`}
            onClose={() => setConfirming(false)}
            actions={
              <>
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost studio-btn--compact"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <StudioForm fetcher={deleteFetcher}>
                  <input type="hidden" name="id" value={asset.id} />
                  <input type="hidden" name="filename" value={asset.filename} />
                  <input
                    type="hidden"
                    name="acknowledgeDraftUsages:bool"
                    value="true"
                  />
                  <button
                    type="submit"
                    name="intent"
                    value="delete"
                    className="studio-btn studio-btn--danger-filled"
                    aria-busy={deleteFetcher.state !== "idle" || undefined}
                  >
                    {deleteFetcher.state !== "idle"
                      ? "Deleting…"
                      : "Delete permanently"}
                  </button>
                </StudioForm>
              </>
            }
          >
            {drafts.length > 0 ? (
              <>
                <p>
                  Drafts use this asset. Deleting clears these references; the
                  drafts keep everything else:
                </p>
                <ul className="studio-usages studio-usages--compact">
                  {drafts.map((group) => (
                    <li key={group.key}>
                      {usageTypeLabel(group.usage)} · {group.usage.label} (
                      {group.fields.join(", ")})
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>It is not used anywhere.</p>
            )}
            <p>
              {asset.source === "r2"
                ? "The file is removed from storage. This cannot be undone."
                : "The link is removed from the library. This cannot be undone."}
            </p>
            {deleteError ? (
              <p className="studio-field__error" role="alert">
                {deleteError}
              </p>
            ) : null}
          </ConfirmDialog>
        </>
      )}
    </section>
  );
}

export function MediaDetailView({ data }: { data: MediaDetailData }) {
  const fetcher = useFetcher<ActionResult>();
  const { asset } = data;
  const editor = useEditorForm({
    type: "media",
    id: asset.id,
    updatedAt: asset.updatedAt,
    fetcher,
    saveIntent: "update",
  });
  const toast = useToast();
  const previous = useRef(fetcher.state);
  useEffect(() => {
    if (previous.current !== "idle" && fetcher.state === "idle") {
      if (fetcher.data?.ok) toast.show({ message: "Saved" });
    }
    previous.current = fetcher.state;
  }, [fetcher.state, fetcher.data, toast]);

  const issues =
    fetcher.data && !fetcher.data.ok ? (fetcher.data.issues ?? []) : [];
  const errorFor = (field: string, locale?: "zh" | "en") =>
    issues.find(
      (issue) =>
        issue.field === field && (!locale || !issue.locale || issue.locale === locale),
    )?.message;
  const localeErrors = (field: string) => ({
    ...(errorFor(field, "zh") ? { zh: errorFor(field, "zh") } : {}),
    ...(errorFor(field, "en") ? { en: errorFor(field, "en") } : {}),
  });
  const timed = asset.kind === "audio" || asset.kind === "video";

  return (
    <StudioPage
      title={asset.filename}
      breadcrumb={<Link to="/studio/media">Media</Link>}
      status={
        <>
          <SaveStateIndicator state={editor.state} />
          {asset.archivedAt ? (
            <span className="studio-badge studio-badge--archived">
              Archived
            </span>
          ) : null}
        </>
      }
      actions={
        <>
          {data.publicUrl ? <CopyUrlButton url={data.publicUrl} /> : null}
          <IntentButton
            form={FORM_ID}
            intent="update"
            variant="primary"
            compact
            pending={editor.state.kind === "saving"}
            pendingLabel="Saving…"
          >
            Save
          </IntentButton>
        </>
      }
    >
      {editor.state.kind === "error" ? (
        <p className="studio-editor-error" role="alert">
          {editor.state.message}
        </p>
      ) : null}
      <div className="studio-asset">
        <div className="studio-asset__media">
          <Preview data={data} />
          <Facts data={data} />
          {data.publicUrl ? (
            <div className="studio-asset__url">
              <label className="studio-field__label" htmlFor="asset-url">
                Public URL
              </label>
              <input
                id="asset-url"
                className="studio-input"
                readOnly
                value={data.publicUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          ) : null}
          {asset.kind === "audio" && data.publicUrl ? (
            <section
              className="studio-asset__section"
              aria-labelledby="asset-analysis"
            >
              <h2 className="studio-section-label" id="asset-analysis">
                Audio analysis
              </h2>
              <p className="studio-hint">
                {data.analysable
                  ? "On: the public player reads live levels from this file."
                  : "Off: this file plays without level analysis. Its host is not in the CORS list."}
              </p>
              <CorsTest
                url={data.publicUrl}
                host={new URL(data.publicUrl).hostname}
              />
            </section>
          ) : null}
        </div>

        <StudioForm
          fetcher={fetcher}
          id={FORM_ID}
          ref={editor.formRef}
          onInput={editor.onInput}
          className="studio-asset__form"
        >
          <input type="hidden" name="id" value={asset.id} />
          {asset.kind === "image" && data.publicUrl ? (
            <FocalPoint
              src={data.image?.src ?? data.publicUrl}
              width={asset.width}
              height={asset.height}
              initial={{ x: asset.focalX, y: asset.focalY }}
            />
          ) : null}
          <LocalizedTextField
            name="title"
            label="Title"
            defaultValue={asset.title}
            maxLength={300}
            errors={localeErrors("title")}
            sameInBoth
          />
          {asset.kind === "image" ? (
            <LocalizedTextArea
              name="alt"
              label="Alt text"
              hint="What the image shows, for people who cannot see it. Required in both languages before a published entry can use it."
              required
              rows={2}
              defaultValue={asset.alt}
              maxLength={500}
              errors={localeErrors("alt")}
            />
          ) : null}
          <LocalizedTextArea
            name="caption"
            label="Caption"
            rows={2}
            defaultValue={asset.caption}
            maxLength={1000}
            errors={localeErrors("caption")}
          />
          <TextInput
            name="credit"
            label="Credit"
            hint="For example: Photo: Kamel."
            defaultValue={asset.credit ?? ""}
            maxLength={200}
            error={errorFor("credit")}
          />
          {timed ? (
            <div className="studio-asset__range">
              <NumberInput
                name="previewStartSeconds"
                label="Preview starts (seconds)"
                min={0}
                defaultValue={asset.previewStartSeconds}
              />
              <NumberInput
                name="previewEndSeconds"
                label="Preview ends (seconds)"
                min={1}
                defaultValue={asset.previewEndSeconds}
                error={errorFor("previewEndSeconds")}
              />
            </div>
          ) : null}
          <TagInput
            name="tags"
            label="Tags"
            hint="For finding it in the library. Not shown publicly."
            defaultValue={asset.tags}
            max={20}
          />
          <div>
            <IntentButton
              intent="update"
              variant="primary"
              compact
              pending={editor.state.kind === "saving"}
              pendingLabel="Saving…"
            >
              Save
            </IntentButton>
          </div>
        </StudioForm>

        <div className="studio-asset__side">
          <Usages data={data} />
          <DangerZone data={data} />
        </div>
      </div>
      <LeaveGuard
        blocker={editor.blocker}
        formRef={editor.formRef}
        saveIntent="update"
        saveState={editor.state.kind}
      />
    </StudioPage>
  );
}
