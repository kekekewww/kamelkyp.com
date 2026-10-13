/**
 * Studio → Pricing (wp2 §4.3-4.4; admin-architecture §2.2).
 *
 * `price_versions` is the only price store and it is insert-only: a new
 * price is a new row, published now or scheduled, through the reused
 * `publishPriceVersion` (which also writes the publish metadata that breaks
 * ties at the same effective time). A scheduled change is replaced by a
 * later publish at the same instant and cancelled by a copy of the baseline
 * rule at that instant; no row is ever updated or deleted.
 *
 * Never invent pricing: the form prefills from the active rule, the fields
 * a service's quote does not use are copied from the baseline rule, and
 * without a baseline nothing is inserted.
 */
import { publishPriceVersion } from "../../admin/service-catalog-service.server";
import {
  type CommissionReadiness,
  getCommissionReadiness,
} from "../../commission/availability.server";
import { SERVICE_TERM_DOCUMENT } from "../../commission/term-outline";
import type { Env } from "../../env.server";
import { formatFxRate } from "../../pricing/fx";
import {
  getUsableFxSnapshot,
  refreshFxRate,
} from "../../pricing/fx-repository.server";
import { percentInputToBps } from "../../pricing/percent";
import {
  classifyPriceVersions,
  type PriceVersionState,
  ruleActiveAt,
} from "../../pricing/price-history";
import {
  EDITABLE_PRICE_FIELDS,
  extractTwdAmounts,
  isAmountField,
  PRICE_VALUE_FIELDS,
  type PriceValues,
  priceChangeWarnings,
} from "../../pricing/sample-quotes";
import { commissionServicePath, getService } from "../../services/catalog";
import {
  isServiceId,
  SERVICE_IDS,
  type ServiceId,
} from "../../services/service-id";
import { formatTaipei, taipeiLocalToIso } from "../../time/taipei";
import { formDataToObject, readString } from "../forms";
import { parseLocalizedText } from "../localized";
import { actionError, actionOk, unknownIntent } from "../studio/responses";
import type {
  EntryStatus,
  Locale,
  LocalizedText,
  ValidationIssue,
} from "../types";

export type { PriceValues } from "../../pricing/sample-quotes";
export { EDITABLE_PRICE_FIELDS } from "../../pricing/sample-quotes";

export type PublishAction = "publish" | "replace" | "cancel";

export type StudioPriceVersion = PriceValues & {
  id: string;
  serviceId: ServiceId;
  effectiveFrom: string;
  retiredAt: string | null;
  publishedAt: string | null;
  action: PublishAction | null;
  replacesVersionId: string | null;
  state: PriceVersionState;
};

export type PricingServiceSummary = {
  serviceId: ServiceId;
  category: "mixing" | "song_transition";
  /** From the services row (published name, else working name). */
  name: LocalizedText;
  serviceRow: { id: string; status: EntryStatus } | null;
  active: StudioPriceVersion | null;
  /** The next scheduled change (earliest), if any. */
  next: StudioPriceVersion | null;
  /** `commissionServicePath(serviceId)`, without the locale. */
  livePath: string;
};

export type FxStatus = {
  state: "ok" | "stale" | "missing";
  rateDate: string | null;
  rateScaled: number | null;
  fetchedAt: string | null;
};

export type PricingIndexData = {
  services: PricingServiceSummary[];
  readiness: CommissionReadiness[];
  fx: FxStatus;
  now: string;
};

export type TermMention = {
  locale: Locale;
  versionNumber: number;
  amounts: number[];
};

export type PriceEditorData = {
  service: PricingServiceSummary;
  editable: ReadonlyArray<keyof PriceValues>;
  history: StudioPriceVersion[];
  /** `history.length`; posted back as `expectedVersionCount`. */
  versionCount: number;
  termMentions: TermMention[];
  now: string;
};

/** Percent inputs are posted as plain strings (no `:number` suffix). */
export const PERCENT_INPUT_NAMES: Record<
  Exclude<keyof PriceValues, "baseTwd" | "perSongAfterFiveTwd">,
  string
> = {
  studentDiscountBps: "studentDiscountPercent",
  rushBps: "rushPercent",
  consultationBps: "consultationPercent",
  sourcePrepBps: "sourcePrepPercent",
};

/** The posted input name of a value (amounts carry a `:number` suffix). */
export function priceInputName(field: keyof PriceValues): string {
  return isAmountField(field)
    ? field
    : PERCENT_INPUT_NAMES[field as keyof typeof PERCENT_INPUT_NAMES];
}

/** A scheduled time must be at least this far ahead. */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

// ---- Reads -------------------------------------------------------------------

type PriceRow = {
  id: string;
  service_id: ServiceId;
  base_twd: number;
  per_song_after_five_twd: number;
  student_discount_bps: number;
  rush_bps: number;
  consultation_bps: number;
  source_prep_bps: number;
  effective_from: string;
  retired_at: string | null;
  published_at: string | null;
  action: PublishAction | null;
  replaces_version_id: string | null;
};

/** Every version of a service with its state, in the active-rule order. */
export async function listPriceHistory(
  db: D1Database,
  serviceId: ServiceId,
  now: Date,
): Promise<StudioPriceVersion[]> {
  const rows = await db
    .prepare(
      `SELECT v.id, v.service_id, v.base_twd, v.per_song_after_five_twd,
              v.student_discount_bps, v.rush_bps, v.consultation_bps,
              v.source_prep_bps, v.effective_from, v.retired_at,
              p.published_at, p.action, p.replaces_version_id
       FROM price_versions v
       LEFT JOIN price_version_publications p ON p.version_id = v.id
       WHERE v.service_id = ?
       ORDER BY v.effective_from DESC, p.published_at DESC, v.id DESC`,
    )
    .bind(serviceId)
    .all<PriceRow>();
  const versions = rows.results.map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    baseTwd: row.base_twd,
    perSongAfterFiveTwd: row.per_song_after_five_twd,
    studentDiscountBps: row.student_discount_bps,
    rushBps: row.rush_bps,
    consultationBps: row.consultation_bps,
    sourcePrepBps: row.source_prep_bps,
    effectiveFrom: row.effective_from,
    retiredAt: row.retired_at,
    publishedAt: row.published_at,
    action: row.action,
    replacesVersionId: row.replaces_version_id,
  }));
  return classifyPriceVersions(versions, now.toISOString());
}

type ServiceRowInfo = {
  id: string;
  commission_service_id: ServiceId;
  status: EntryStatus;
  name: string;
};

async function serviceRows(
  db: D1Database,
): Promise<Map<ServiceId, ServiceRowInfo>> {
  const rows = await db
    .prepare(
      `SELECT id, commission_service_id, status,
              COALESCE(json_extract(published_json, '$.core.name_i18n'), name_i18n) AS name
       FROM services WHERE commission_service_id IS NOT NULL`,
    )
    .all<ServiceRowInfo>();
  return new Map(rows.results.map((row) => [row.commission_service_id, row]));
}

function summarize(
  serviceId: ServiceId,
  row: ServiceRowInfo | undefined,
  history: StudioPriceVersion[],
): PricingServiceSummary {
  const name = row ? parseLocalizedText(row.name) : { zh: "", en: "" };
  const scheduled = history.filter((version) => version.state === "scheduled");
  return {
    serviceId,
    category: getService(serviceId).category,
    name: {
      zh: name.zh.trim() || serviceId,
      en: name.en.trim() || serviceId,
    },
    serviceRow: row ? { id: row.id, status: row.status } : null,
    active: history.find((version) => version.state === "active") ?? null,
    // History is newest first: the earliest scheduled change is the last one.
    next: scheduled.at(-1) ?? null,
    livePath: commissionServicePath(serviceId),
  };
}

/** FX state with the same date basis as every public reader (UTC date). */
export async function loadFxStatus(
  db: D1Database,
  now: Date,
): Promise<FxStatus> {
  const date = now.toISOString().slice(0, 10);
  try {
    const snapshot = await getUsableFxSnapshot(db, date);
    return {
      state: "ok",
      rateDate: snapshot.rateDate,
      rateScaled: snapshot.rateScaled,
      fetchedAt: snapshot.fetchedAt,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "fx_rate_missing") {
      return {
        state: "missing",
        rateDate: null,
        rateScaled: null,
        fetchedAt: null,
      };
    }
    if (code !== "fx_rate_stale") throw error;
    const row = await db
      .prepare(
        "SELECT rate_date, rate_scaled, fetched_at FROM fx_rates " +
          "WHERE rate_date <= ? ORDER BY rate_date DESC LIMIT 1",
      )
      .bind(date)
      .first<{ rate_date: string; rate_scaled: number; fetched_at: string }>();
    return {
      state: "stale",
      rateDate: row?.rate_date ?? null,
      rateScaled: row?.rate_scaled ?? null,
      fetchedAt: row?.fetched_at ?? null,
    };
  }
}

export async function loadPricingIndex(
  db: D1Database,
  now: Date,
): Promise<PricingIndexData> {
  const [rows, histories, readiness, fx] = await Promise.all([
    serviceRows(db),
    Promise.all(SERVICE_IDS.map((id) => listPriceHistory(db, id, now))),
    getCommissionReadiness(db, now),
    loadFxStatus(db, now),
  ]);
  return {
    services: SERVICE_IDS.map((id, index) =>
      summarize(id, rows.get(id), histories[index] ?? []),
    ),
    readiness,
    fx,
    now: now.toISOString(),
  };
}

/** NT$ amounts the live terms of a service mention (either locale). */
async function termMentions(
  db: D1Database,
  serviceId: ServiceId,
  now: Date,
): Promise<TermMention[]> {
  const rows = await db
    .prepare(
      `SELECT p.locale, v.version_number, v.body_json
       FROM term_publications p JOIN term_versions v ON v.id = p.version_id
       WHERE p.document_id = ? AND p.effective_from <= ?
       ORDER BY p.locale DESC`,
    )
    .bind(SERVICE_TERM_DOCUMENT[serviceId], now.toISOString())
    .all<{ locale: Locale; version_number: number; body_json: string }>();
  return rows.results.flatMap((row) => {
    let text = "";
    try {
      const clauses = JSON.parse(row.body_json) as unknown;
      if (Array.isArray(clauses)) {
        text = clauses
          .map((clause) =>
            clause && typeof clause === "object"
              ? `${String((clause as { title?: unknown }).title ?? "")}\n${String((clause as { text?: unknown }).text ?? "")}`
              : "",
          )
          .join("\n");
      }
    } catch {
      return [];
    }
    const amounts = extractTwdAmounts(text);
    return amounts.length
      ? [{ locale: row.locale, versionNumber: row.version_number, amounts }]
      : [];
  });
}

export async function loadPriceEditor(
  db: D1Database,
  serviceId: string,
  now: Date,
): Promise<PriceEditorData> {
  if (!isServiceId(serviceId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const [rows, history, mentions] = await Promise.all([
    serviceRows(db),
    listPriceHistory(db, serviceId, now),
    termMentions(db, serviceId, now),
  ]);
  return {
    service: summarize(serviceId, rows.get(serviceId), history),
    editable: EDITABLE_PRICE_FIELDS[serviceId],
    history,
    versionCount: history.length,
    termMentions: mentions,
    now: now.toISOString(),
  };
}

// ---- Form --------------------------------------------------------------------

export type ParsedPriceVersion =
  | {
      ok: true;
      values: PriceValues;
      effectiveFrom: string;
      action: "publish" | "replace";
      replacesVersionId: string | null;
      basedOnVersionId: string | null;
      expectedVersionCount: number | null;
      /** Never blocking (identical scheduled values, large changes). */
      warnings: ValidationIssue[];
    }
  | { ok: false; issues: ValidationIssue[]; noBaseline?: boolean };

function readCount(formData: FormData): number | null {
  const raw = readString(formData, "expectedVersionCount");
  return raw && /^[0-9]{1,9}$/.test(raw) ? Number(raw) : null;
}

function valuesOf(version: PriceValues): PriceValues {
  return {
    baseTwd: version.baseTwd,
    perSongAfterFiveTwd: version.perSongAfterFiveTwd,
    studentDiscountBps: version.studentDiscountBps,
    rushBps: version.rushBps,
    consultationBps: version.consultationBps,
    sourcePrepBps: version.sourcePrepBps,
  };
}

function error(
  field: string,
  code: ValidationIssue["code"],
  message: string,
): ValidationIssue {
  return { field, code, severity: "error", message };
}

/**
 * Reads the price form: editable values, the effective time (now, or a
 * Taipei `datetime-local` at least 5 minutes ahead) and whether it replaces
 * a scheduled change at the same instant. Carried values come from the
 * baseline rule: the active rule for "now", else the rule active just
 * before the chosen time.
 */
export function parsePriceVersionForm(
  formData: FormData,
  ctx: {
    serviceId: ServiceId;
    history: readonly StudioPriceVersion[];
    now: Date;
  },
): ParsedPriceVersion {
  const object = formDataToObject(formData);
  const issues: ValidationIssue[] = [];
  const posted: Partial<PriceValues> = {};
  for (const field of EDITABLE_PRICE_FIELDS[ctx.serviceId]) {
    if (isAmountField(field)) {
      const value = object[field];
      const min = field === "baseTwd" ? 1 : 0;
      if (value === null || value === undefined || value === "") {
        issues.push(error(field, "required", "Enter an amount in NT$."));
      } else if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < min
      ) {
        issues.push(
          error(
            field,
            "invalid_value",
            min === 1
              ? "Enter a whole NT$ amount of at least 1."
              : "Enter a whole NT$ amount (0 or more).",
          ),
        );
      } else {
        posted[field] = value;
      }
      continue;
    }
    const name = priceInputName(field);
    const raw = (readString(formData, name) ?? "").trim();
    if (!raw) {
      issues.push(error(name, "required", "Enter a percentage."));
      continue;
    }
    const bps = percentInputToBps(raw);
    if (bps === null) {
      issues.push(
        error(
          name,
          "invalid_value",
          "Enter a percentage from 0 to 100 with at most two decimals.",
        ),
      );
    } else {
      posted[field] = bps;
    }
  }

  const nowIso = ctx.now.toISOString();
  const scheduled = readString(formData, "effectiveMode") === "scheduled";
  let effectiveFrom = nowIso;
  if (scheduled) {
    const iso = taipeiLocalToIso(readString(formData, "effectiveAt") ?? "");
    if (!iso) {
      issues.push(
        error(
          "effectiveAt",
          "invalid_value",
          "Enter a date and time (Taipei, UTC+8).",
        ),
      );
    } else if (Date.parse(iso) < ctx.now.getTime() + MIN_SCHEDULE_LEAD_MS) {
      issues.push(
        error(
          "effectiveAt",
          "effective_in_past",
          "Choose a time at least 5 minutes from now. Prices are never backdated.",
        ),
      );
    } else {
      effectiveFrom = iso;
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  // The same instant as a scheduled change: replace it, reusing its exact
  // stored string so text and instant comparisons agree.
  let action: "publish" | "replace" = "publish";
  let replacesVersionId: string | null = null;
  if (scheduled) {
    const instant = Date.parse(effectiveFrom);
    const group = ctx.history.find(
      (version) =>
        version.state === "scheduled" &&
        Date.parse(version.effectiveFrom) === instant,
    );
    if (group) {
      action = "replace";
      replacesVersionId = group.id;
      effectiveFrom = group.effectiveFrom;
    }
  }

  const baseline = scheduled
    ? ruleActiveAt(ctx.history, effectiveFrom, { before: true })
    : ruleActiveAt(ctx.history, nowIso);
  if (!baseline) return { ok: false, issues: [], noBaseline: true };

  const before = valuesOf(baseline);
  const values: PriceValues = { ...before, ...posted };
  const warnings: ValidationIssue[] = [];
  const unchanged = PRICE_VALUE_FIELDS.every(
    (field) => values[field] === before[field],
  );
  if (unchanged && !scheduled) {
    return {
      ok: false,
      issues: [
        error(
          "values",
          "unchanged",
          "Nothing changed: these values match the active price.",
        ),
      ],
    };
  }
  if (unchanged) {
    warnings.push({
      field: "values",
      code: "unchanged",
      severity: "warning",
      message: "These values match the price that will be active then.",
    });
  }
  for (const warning of priceChangeWarnings(
    before,
    values,
    EDITABLE_PRICE_FIELDS[ctx.serviceId],
  )) {
    warnings.push({
      field: priceInputName(warning.field),
      code: "large_change",
      severity: "warning",
      message: warning.message,
    });
  }

  const basedOn = readString(formData, "basedOnVersionId");
  return {
    ok: true,
    values,
    effectiveFrom,
    action,
    replacesVersionId,
    basedOnVersionId: basedOn ? basedOn : null,
    expectedVersionCount: readCount(formData),
    warnings,
  };
}

// ---- Actions -----------------------------------------------------------------

const staleHistory = () =>
  actionError("stale_revision", {
    status: 409,
    message:
      "The price history changed since this page was opened. Reload to review it.",
  });

const staleActive = () =>
  actionError("stale_revision", {
    status: 409,
    message:
      "The active price changed since this page was opened (a scheduled change may have taken effect). Reload to review it.",
  });

const noBaseline = () =>
  actionError("invalid_state", {
    status: 409,
    message: "There is no price to base this version on.",
  });

export async function handlePriceEditorAction({
  db,
  serviceId,
  formData,
  intent,
  now,
}: {
  db: D1Database;
  serviceId: string;
  formData: FormData | null;
  intent: string | null;
  now: Date;
}) {
  if (!isServiceId(serviceId)) {
    throw new Response("Not Found", { status: 404 });
  }
  if (intent !== "publish-price-version" && intent !== "cancel-scheduled") {
    return unknownIntent(intent);
  }
  const data = formData ?? new FormData();
  const history = await listPriceHistory(db, serviceId, now);
  // Concurrency token: rows are insert-only, so the count only grows.
  if (readCount(data) !== history.length) return staleHistory();

  if (intent === "cancel-scheduled") {
    const versionId = readString(data, "versionId") ?? "";
    const target = history.find((version) => version.id === versionId);
    if (target?.state !== "scheduled") {
      return actionError("invalid_state", {
        status: 409,
        message: "Only a scheduled change can be cancelled.",
      });
    }
    const baseline = ruleActiveAt(history, target.effectiveFrom, {
      before: true,
    });
    if (!baseline) return noBaseline();
    const version = await publishPriceVersion({
      db,
      serviceId,
      ...valuesOf(baseline),
      effectiveFrom: target.effectiveFrom,
      publishedAt: now.toISOString(),
      action: "cancel",
      replacesVersionId: target.id,
    });
    return actionOk({
      versionId: version.id,
      message: `Cancelled the change of ${formatTaipei(target.effectiveFrom)}.`,
    });
  }

  const activeId =
    history.find((version) => version.state === "active")?.id ?? "";
  if ((readString(data, "basedOnVersionId") ?? "") !== activeId) {
    return staleActive();
  }

  const parsed = parsePriceVersionForm(data, { serviceId, history, now });
  if (!parsed.ok) {
    if (parsed.noBaseline) return noBaseline();
    return actionError("invalid_content", {
      status: 422,
      message: parsed.issues[0]?.message ?? "Check the highlighted fields.",
      issues: parsed.issues,
    });
  }
  const version = await publishPriceVersion({
    db,
    serviceId,
    ...parsed.values,
    effectiveFrom: parsed.effectiveFrom,
    publishedAt: now.toISOString(),
    action: parsed.action,
    replacesVersionId: parsed.replacesVersionId,
  });
  const immediate = parsed.effectiveFrom === now.toISOString();
  const message = immediate
    ? "Published. The new price is active now."
    : `Scheduled for ${formatTaipei(parsed.effectiveFrom)}${
        parsed.action === "replace" ? " (replaces the earlier change)" : ""
      }`;
  return actionOk({
    versionId: version.id,
    effectiveFrom: parsed.effectiveFrom,
    publishAction: parsed.action,
    issues: parsed.warnings,
    message,
  });
}

const FX_REFRESH_CODES = new Set([
  "fx_upstream_unavailable",
  "fx_response_invalid",
]);

export async function handlePricingIndexAction({
  db,
  env,
  intent,
  now,
  fetcher = fetch,
}: {
  db: D1Database;
  env: Pick<Env, "FX_API_URL">;
  intent: string | null;
  now: Date;
  fetcher?: typeof fetch;
}) {
  if (intent !== "refresh-fx") return unknownIntent(intent);
  try {
    const snapshot = await refreshFxRate(
      db,
      env.FX_API_URL,
      fetcher,
      now.toISOString(),
    );
    return actionOk({
      message: `Exchange rate updated: 1 TWD = ${formatFxRate(snapshot.rateScaled)} USD (rate date ${snapshot.rateDate}).`,
    });
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "";
    if (!FX_REFRESH_CODES.has(code)) throw caught;
    return actionError("fx_refresh_failed", {
      status: 503,
      message: "The exchange-rate service did not answer. Try again later.",
    });
  }
}
