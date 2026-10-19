/**
 * `/studio/services/pricing/:serviceId` (wp2 §4.3, §4.9): CURRENT PRICE,
 * NEW VERSION, CHECK and HISTORY.
 *
 * - The form prefills only from the active rule; fields the service's quote
 *   does not use are shown as text and copied by the server from the
 *   baseline rule. No placeholder ever shows a number.
 * - Publishing is always a deliberate click (no dialog: the Check section is
 *   the review step). Mod+S and Enter in a field submit nothing here, and
 *   leaving never publishes: the leave guard offers Stay or Discard only.
 * - HISTORY sits outside the price form; each "Cancel scheduled change" is
 *   its own small form, confirmed first while the price form has edits
 *   (the form resets after the cancel).
 */
import { useCallback, useEffect, useState } from "react";
import {
  type FetcherWithComponents,
  Link,
  useFetcher,
  useRevalidator,
} from "react-router";
import type {
  PriceEditorData,
  StudioPriceVersion,
} from "../../../lib/cms/repositories/pricing.server";
import type { ValidationIssue } from "../../../lib/cms/types";
import {
  bpsToPercentLabel,
  percentInputToBps,
} from "../../../lib/pricing/percent";
import { ruleActiveAt } from "../../../lib/pricing/price-history";
import {
  formatPriceValue,
  formatTwd,
  isAmountField,
  PRICE_FIELD_LABELS,
  PRICE_VALUE_FIELDS,
  type PriceValues,
  priceChangeWarnings,
  priceInputName,
} from "../../../lib/pricing/sample-quotes";
import {
  formatTaipei,
  isoToTaipeiLocal,
  taipeiLocalToIso,
} from "../../../lib/time/taipei";
import {
  type ActionData,
  BackupBanner,
  errorFor,
  type FieldErrors,
  fieldErrors,
  LeaveGuard,
  useActionToasts,
} from "../settings/form-kit";
import { StudioPage } from "../shell/studio-page";
import {
  ConfirmDialog,
  EditorLayout,
  EditorSection,
  IntentButton,
  NumberInput,
  StudioForm,
  TextInput,
  useEditorForm,
  useStudioSession,
} from "../ui";
import { PriceHistoryTable } from "./price-history";
import { priceFigure, rateLine } from "./pricing-index";
import { QuoteCheck } from "./quote-check";

const FORM_ID = "price-version-editor";
const SECTION_KEY = "studio:sections:price-version";

type Prefill = { values: PriceValues; effectiveAt: string };

/** A prefill belongs to the history it was made from. */
type StoredPrefill = Prefill & { forKey: string };

type PriceActionData = ActionData & { versionId?: string };

export function valuesOf(version: PriceValues): PriceValues {
  return {
    baseTwd: version.baseTwd,
    perSongAfterFiveTwd: version.perSongAfterFiveTwd,
    studentDiscountBps: version.studentDiscountBps,
    rushBps: version.rushBps,
    consultationBps: version.consultationBps,
    sourcePrepBps: version.sourcePrepBps,
  };
}

/** The editable values as typed; null while any of them is invalid. */
function readPosted(
  form: HTMLFormElement,
  editable: ReadonlyArray<keyof PriceValues>,
): Partial<PriceValues> | null {
  const data = new FormData(form);
  const posted: Partial<PriceValues> = {};
  for (const field of editable) {
    if (isAmountField(field)) {
      const raw = String(data.get(`${field}:number`) ?? "").trim();
      const value = /^\d{1,15}$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isSafeInteger(value) || (field === "baseTwd" && value < 1)) {
        return null;
      }
      posted[field] = value;
    } else {
      const bps = percentInputToBps(
        String(data.get(priceInputName(field)) ?? ""),
      );
      if (bps === null) return null;
      posted[field] = bps;
    }
  }
  return posted;
}

function pickEditable(
  values: PriceValues | null,
  editable: ReadonlyArray<keyof PriceValues>,
): Partial<PriceValues> | null {
  if (!values) return null;
  return Object.fromEntries(editable.map((field) => [field, values[field]]));
}

function same(a: PriceValues, b: PriceValues): boolean {
  return PRICE_VALUE_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Enter in a field would submit the form through its only submit button,
 * Publish. Publishing is always a deliberate click (R18), so it does not.
 */
function blockImplicitSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (event.target instanceof HTMLInputElement) event.preventDefault();
}

/** Latest publish time, else the active rule's time (backup freshness). */
function lastChange(data: PriceEditorData): string | null {
  let latest: string | null = null;
  for (const version of data.history) {
    if (version.publishedAt && (!latest || version.publishedAt > latest)) {
      latest = version.publishedAt;
    }
  }
  return latest ?? data.service.active?.effectiveFrom ?? null;
}

function CurrentPrice({ data }: { data: PriceEditorData }) {
  const { service } = data;
  const active = service.active;
  return (
    <div className="studio-price-plate">
      <p className="studio-price-plate__label">Active price</p>
      {active ? (
        <>
          <p className="studio-price-plate__figure">
            {priceFigure(service, active)}
          </p>
          <p className="studio-pricing-row__rates">
            {rateLine(service, active)}
          </p>
          <p className="studio-hint">
            Active since {formatTaipei(active.effectiveFrom)} (Taipei) · version{" "}
            <code>{active.id}</code>
          </p>
        </>
      ) : (
        <p className="studio-price-plate__figure studio-price-plate__figure--missing">
          No active price
        </p>
      )}
      {service.next ? (
        <p className="studio-hint">
          Scheduled: {priceFigure(service, service.next)} from{" "}
          {formatTaipei(service.next.effectiveFrom)} (Taipei).
        </p>
      ) : null}
    </div>
  );
}

function PriceForm({
  data,
  defaults,
  initialMode,
  initialEffectiveAt,
  prefilled,
  fetcher,
  editor,
  errors,
  onPrefill,
}: {
  data: PriceEditorData;
  defaults: PriceValues | null;
  initialMode: "now" | "scheduled";
  initialEffectiveAt: string;
  prefilled: boolean;
  fetcher: FetcherWithComponents<unknown>;
  editor: ReturnType<typeof useEditorForm>;
  errors: FieldErrors;
  onPrefill: (prefill: Prefill) => void;
}) {
  const { service, history, editable } = data;
  const name = service.name.en;
  const [mode, setMode] = useState(initialMode);
  const [effectiveAt, setEffectiveAt] = useState(initialEffectiveAt);
  const [posted, setPosted] = useState(() => pickEditable(defaults, editable));
  const pending = fetcher.state !== "idle";

  const sync = useCallback(() => {
    const form = editor.formRef.current;
    if (!form) return;
    const data = new FormData(form);
    setMode(data.get("effectiveMode") === "scheduled" ? "scheduled" : "now");
    setEffectiveAt(String(data.get("effectiveAt") ?? ""));
    setPosted(readPosted(form, editable));
  }, [editor.formRef, editable]);

  const onChange = useCallback(() => {
    editor.onInput();
    sync();
  }, [editor, sync]);

  // A prefilled remount (Replace…, scheduled values, backup) is an edit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per mount
  useEffect(() => {
    if (prefilled) onChange();
  }, []);

  const instant = mode === "scheduled" ? taipeiLocalToIso(effectiveAt) : null;
  const group = instant
    ? history.find(
        (version) =>
          version.state === "scheduled" &&
          Date.parse(version.effectiveFrom) === Date.parse(instant),
      )
    : undefined;
  const baselineVersion =
    mode === "now"
      ? service.active
      : instant
        ? ruleActiveAt(history, group?.effectiveFrom ?? instant, {
            before: true,
          })
        : service.active;
  const baseline = baselineVersion ? valuesOf(baselineVersion) : null;
  const next = posted && baseline ? { ...baseline, ...posted } : null;

  const warnings: string[] = [];
  if (next && baseline) {
    if (same(next, baseline)) {
      warnings.push(
        mode === "now"
          ? "Nothing changed: these values match the active price."
          : "These values match the price that will be active then.",
      );
    }
    for (const warning of priceChangeWarnings(baseline, next, editable)) {
      warnings.push(warning.message);
    }
    for (const field of ["baseTwd", "perSongAfterFiveTwd"] as const) {
      if (!editable.includes(field) || baseline[field] === next[field])
        continue;
      for (const mention of data.termMentions) {
        if (!mention.amounts.includes(baseline[field])) continue;
        warnings.push(
          `The live ${mention.locale.toUpperCase()} terms for ${name} (v${mention.versionNumber}) mention ${formatTwd(baseline[field])}. Update them in Terms.`,
        );
      }
    }
  }
  if (mode === "now" && service.next) {
    warnings.push(
      `A scheduled change (${priceFigure(service, service.next)} from ${formatTaipei(service.next.effectiveFrom)}) will still take effect after this publish.`,
    );
  }
  if (mode === "scheduled" && instant) {
    // History is newest first: the earliest later change is the last one.
    const later = history
      .filter(
        (version) =>
          version.state === "scheduled" &&
          Date.parse(version.effectiveFrom) > Date.parse(instant),
      )
      .at(-1);
    if (later) {
      warnings.push(
        `A scheduled change (${priceFigure(service, later)} from ${formatTaipei(later.effectiveFrom)}) will still take effect after this one.`,
      );
    }
  }

  const laterBaseline =
    mode === "scheduled" &&
    baselineVersion &&
    service.active &&
    baselineVersion.id !== service.active.id
      ? baselineVersion
      : null;
  const notes = (
    <>
      {group ? (
        <p className="studio-hint">
          This replaces the change scheduled for{" "}
          {formatTaipei(group.effectiveFrom)}.
        </p>
      ) : null}
      {laterBaseline ? (
        <p className="studio-hint">
          A scheduled change takes effect before this time; the check compares
          with the values scheduled for{" "}
          {formatTaipei(laterBaseline.effectiveFrom)}.{" "}
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--compact"
            onClick={() =>
              onPrefill({ values: valuesOf(laterBaseline), effectiveAt })
            }
          >
            Use the values scheduled for{" "}
            {formatTaipei(laterBaseline.effectiveFrom)}
          </button>
        </p>
      ) : null}
    </>
  );

  const carried = PRICE_VALUE_FIELDS.filter(
    (field) => !editable.includes(field),
  );
  const carriedFrom =
    baseline ?? (service.active ? valuesOf(service.active) : null);
  const summary = (() => {
    if (!baseline || !next) return null;
    const base =
      baseline.baseTwd === next.baseTwd
        ? `Base ${formatTwd(next.baseTwd)} (unchanged)`
        : `Base ${formatTwd(baseline.baseTwd)} → ${formatTwd(next.baseTwd)}`;
    const when =
      mode === "now"
        ? "effective immediately"
        : instant
          ? `effective ${formatTaipei(instant)} (Taipei)`
          : "choose a time";
    return `${base} · ${when}`;
  })();
  const submitLabel =
    mode === "now"
      ? "Publish now"
      : instant
        ? `Schedule for ${formatTaipei(instant)}`
        : "Schedule";

  return (
    <StudioForm
      id={FORM_ID}
      fetcher={fetcher}
      ref={editor.formRef}
      onInput={onChange}
      onChange={onChange}
      onKeyDown={blockImplicitSubmit}
      className="studio-price-form"
      aria-label={`New price version for ${name}`}
    >
      <input
        type="hidden"
        name="basedOnVersionId"
        value={service.active?.id ?? ""}
      />
      <input
        type="hidden"
        name="expectedVersionCount"
        value={String(data.versionCount)}
      />
      <EditorSection
        id="current"
        label="Current price"
        defaultOpen
        storageKey={SECTION_KEY}
      >
        <CurrentPrice data={data} />
      </EditorSection>

      <EditorSection
        id="new"
        label="New version"
        defaultOpen
        storageKey={SECTION_KEY}
      >
        {errorFor(errors, "values") ? (
          <p className="studio-field__error" role="alert">
            {errorFor(errors, "values")}
          </p>
        ) : null}
        <div className="studio-price-form__values">
          {editable.map((field) =>
            isAmountField(field) ? (
              <NumberInput
                key={field}
                name={field}
                label={`${PRICE_FIELD_LABELS[field]} (NT$)`}
                min={field === "baseTwd" ? 1 : 0}
                step={1}
                defaultValue={defaults ? defaults[field] : null}
                error={errorFor(errors, field)}
              />
            ) : (
              <TextInput
                key={field}
                name={priceInputName(field)}
                label={`${PRICE_FIELD_LABELS[field]} (%)`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                inputMode="decimal"
                defaultValue={
                  defaults ? bpsToPercentLabel(defaults[field]) : ""
                }
                error={errorFor(errors, priceInputName(field))}
              />
            ),
          )}
        </div>
        {carried.length > 0 && carriedFrom ? (
          <dl className="studio-price-form__carried">
            <dt>Not used by this service, carried over unchanged:</dt>
            {carried.map((field) => (
              <dd key={field}>
                {PRICE_FIELD_LABELS[field]}{" "}
                {formatPriceValue(field, carriedFrom[field])}
              </dd>
            ))}
          </dl>
        ) : null}
        <fieldset className="studio-price-form__effective">
          <legend className="studio-field__label">Takes effect</legend>
          <label className="studio-price-form__mode">
            <input
              type="radio"
              name="effectiveMode"
              value="now"
              defaultChecked={initialMode === "now"}
            />
            Immediately
          </label>
          <label className="studio-price-form__mode">
            <input
              type="radio"
              name="effectiveMode"
              value="scheduled"
              defaultChecked={initialMode === "scheduled"}
            />
            At a scheduled time
          </label>
          <div hidden={mode !== "scheduled"}>
            <TextInput
              name="effectiveAt"
              label="Date and time (Taipei, UTC+8)"
              type="datetime-local"
              defaultValue={initialEffectiveAt}
              hint="At least 5 minutes from now. Prices are never backdated."
              error={errorFor(errors, "effectiveAt")}
            />
          </div>
        </fieldset>
      </EditorSection>

      <EditorSection
        id="check"
        label="Check"
        defaultOpen
        storageKey={SECTION_KEY}
      >
        <QuoteCheck
          serviceId={service.serviceId}
          baseline={baseline}
          next={next}
          warnings={warnings}
          notes={notes}
        />
      </EditorSection>

      <div className="studio-kit-footer studio-price-form__footer">
        {summary ? (
          <p className="studio-price-form__summary">{summary}</p>
        ) : null}
        <IntentButton
          intent="publish-price-version"
          variant="primary"
          compact
          pending={pending}
          pendingLabel="Publishing…"
        >
          {submitLabel}
        </IntentButton>
      </div>
      <div className="studio-price-form__notes">
        <p className="studio-hint">
          New commissions are quoted with this version from its effective time.
          Submitted cases keep their locked price. A visitor who already has the
          form open keeps seeing the old figures until the page reloads, and is
          charged the price active when they submit. Scheduling the change for a
          quiet hour avoids that.
        </p>
        <p className="studio-hint">
          Review the price wording in{" "}
          <Link className="studio-link" to="/studio/services/terms">
            Terms
          </Link>
          .
        </p>
      </div>
    </StudioForm>
  );
}

export function PriceVersionEditor({ data }: { data: PriceEditorData }) {
  const { service, history, versionCount } = data;
  const name = service.name.en;
  const fetcher = useFetcher<PriceActionData>();
  const cancelFetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const { csrfToken } = useStudioSession();
  const editor = useEditorForm({
    type: "price-version",
    id: service.serviceId,
    updatedAt: lastChange(data),
    fetcher: fetcher as FetcherWithComponents<unknown>,
    saveIntent: null,
  });
  useActionToasts(fetcher as FetcherWithComponents<unknown>);
  useActionToasts(cancelFetcher as FetcherWithComponents<unknown>);

  const [stored, setStored] = useState<StoredPrefill | null>(null);
  const [prefillCount, setPrefillCount] = useState(0);
  const [confirmPrefill, setConfirmPrefill] = useState<Prefill | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<StudioPriceVersion | null>(
    null,
  );
  // 409 results whose "Reload" was clicked (fetcher data outlives a reload).
  const [dismissed, setDismissed] = useState<ReadonlySet<unknown>>(
    () => new Set(),
  );
  // The form remounts (and resets) whenever the history changes.
  const baseKey = `${service.active?.id ?? "none"}:${service.next?.id ?? "none"}:${versionCount}`;
  // A publish or cancel changes the history: an older prefill no longer applies.
  const prefill = stored?.forKey === baseKey ? stored : null;

  const applyPrefill = useCallback(
    (next: Prefill) => {
      setStored({ ...next, forKey: baseKey });
      setPrefillCount((count) => count + 1);
    },
    [baseKey],
  );
  const requestPrefill = useCallback(
    (next: Prefill) => {
      if (editor.dirty) setConfirmPrefill(next);
      else applyPrefill(next);
    },
    [editor.dirty, applyPrefill],
  );

  const result = fetcher.state === "idle" ? fetcher.data : null;
  const cancelResult =
    cancelFetcher.state === "idle" ? cancelFetcher.data : null;
  const errors = fieldErrors(
    result && result.ok === false ? (result.issues as ValidationIssue[]) : [],
  );
  // A publish or a cancel answered 409: the history changed since loading.
  const staleResult = [result, cancelResult].find(
    (item) =>
      item?.ok === false &&
      item.code === "stale_revision" &&
      !dismissed.has(item),
  );
  const stale = staleResult?.message ?? null;
  const reload = () => {
    setDismissed(
      (previous) =>
        new Set([...previous, result, cancelResult].filter(Boolean)),
    );
    revalidator.revalidate();
  };

  /** The cancel form's own submission, after the owner confirmed it. */
  const submitCancel = (version: StudioPriceVersion) => {
    const formData = new FormData();
    formData.set("csrfToken", csrfToken);
    formData.set("intent", "cancel-scheduled");
    formData.set("versionId", version.id);
    formData.set("expectedVersionCount", String(versionCount));
    cancelFetcher.submit(formData, { method: "post" });
  };

  const defaults =
    prefill?.values ?? (service.active ? valuesOf(service.active) : null);

  return (
    <StudioPage
      title={`${name} pricing`}
      breadcrumb={<Link to="/studio/services/pricing">Pricing</Link>}
      actions={
        <a
          className="studio-btn studio-btn--ghost studio-btn--compact"
          href={`/zh${service.livePath}`}
          target="_blank"
          rel="noopener"
        >
          View live
        </a>
      }
    >
      {stale ? (
        <div className="studio-kit-error" role="alert">
          {stale}{" "}
          <button
            type="button"
            className="studio-btn studio-btn--secondary studio-btn--compact"
            onClick={reload}
          >
            Reload
          </button>
        </div>
      ) : null}
      {editor.backup ? (
        <BackupBanner
          savedAt={editor.backup.savedAt}
          onRestore={() => {
            editor.restoreBackup();
          }}
          onDiscard={editor.discardBackup}
        />
      ) : null}
      <EditorLayout
        sections={[
          { id: "current", label: "Current price" },
          {
            id: "new",
            label: "New version",
            issues: errors.size || undefined,
          },
          { id: "check", label: "Check" },
          { id: "history", label: "History" },
        ]}
      >
        <PriceForm
          key={`${baseKey}:${prefillCount}`}
          data={data}
          defaults={defaults}
          initialMode={prefill ? "scheduled" : "now"}
          initialEffectiveAt={prefill?.effectiveAt ?? ""}
          prefilled={prefill !== null}
          fetcher={fetcher as FetcherWithComponents<unknown>}
          editor={editor}
          errors={errors}
          onPrefill={requestPrefill}
        />
        <EditorSection
          id="history"
          label="History"
          defaultOpen
          storageKey={SECTION_KEY}
        >
          <PriceHistoryTable
            name={name}
            history={history}
            versionCount={versionCount}
            cancelFetcher={cancelFetcher as FetcherWithComponents<unknown>}
            onCancelClick={(event, version) => {
              // A cancel resets the price form: confirm while it has edits.
              if (!editor.dirty) return;
              event.preventDefault();
              setConfirmCancel(version);
            }}
            onReplace={(version: StudioPriceVersion) =>
              requestPrefill({
                values: valuesOf(version),
                effectiveAt: isoToTaipeiLocal(version.effectiveFrom),
              })
            }
          />
        </EditorSection>
      </EditorLayout>
      <ConfirmDialog
        open={confirmPrefill !== null}
        title="Replace the editor content?"
        onClose={() => setConfirmPrefill(null)}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => setConfirmPrefill(null)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => {
                if (confirmPrefill) applyPrefill(confirmPrefill);
                setConfirmPrefill(null);
              }}
            >
              Replace
            </button>
          </>
        }
      >
        <p>Unsaved edits are lost.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmCancel !== null}
        title="Cancel the scheduled change?"
        tone="danger"
        onClose={() => setConfirmCancel(null)}
        actions={
          <>
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--compact"
              onClick={() => setConfirmCancel(null)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--danger studio-btn--compact"
              onClick={() => {
                if (confirmCancel) submitCancel(confirmCancel);
                setConfirmCancel(null);
              }}
            >
              Cancel the change
            </button>
          </>
        }
      >
        <p>
          {confirmCancel
            ? `The change of ${formatTaipei(confirmCancel.effectiveFrom)} will not take effect. `
            : null}
          Unsaved values in New version are lost.
        </p>
      </ConfirmDialog>
      <LeaveGuard blocker={editor.blocker} />
    </StudioPage>
  );
}
