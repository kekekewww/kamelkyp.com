/**
 * Studio pricing helpers (client-safe): which fields a service's quote uses,
 * sample quotes computed with the wizard's own `calculateQuote`, change
 * warnings and NT$ amounts mentioned in legal text. No number here is a
 * price: every figure comes from a stored price version.
 */
import type { ServiceId } from "../services/service-id";
import { calculateQuote } from "./calculate-quote";
import { bpsToPercentLabel } from "./percent";
import type { PriceRule, QuoteBreakdown, QuoteInput } from "./types";

/** The six values of a price version. */
export type PriceValues = {
  baseTwd: number;
  perSongAfterFiveTwd: number;
  studentDiscountBps: number;
  rushBps: number;
  consultationBps: number;
  sourcePrepBps: number;
};

export const PRICE_VALUE_FIELDS: ReadonlyArray<keyof PriceValues> = [
  "baseTwd",
  "perSongAfterFiveTwd",
  "studentDiscountBps",
  "rushBps",
  "consultationBps",
  "sourcePrepBps",
];

/**
 * Fields each service's quote actually uses (`calculate-quote.ts`): the
 * Studio edits these; the others are carried over from the baseline rule.
 */
export const EDITABLE_PRICE_FIELDS: Record<
  ServiceId,
  ReadonlyArray<keyof PriceValues>
> = {
  full_mix: ["baseTwd", "studentDiscountBps", "rushBps", "sourcePrepBps"],
  vocal_mix: ["baseTwd", "studentDiscountBps", "rushBps", "sourcePrepBps"],
  simple_transition: PRICE_VALUE_FIELDS,
  edit_transition: [
    "baseTwd",
    "perSongAfterFiveTwd",
    "studentDiscountBps",
    "rushBps",
    "sourcePrepBps",
  ],
};

export const PRICE_FIELD_LABELS: Record<keyof PriceValues, string> = {
  baseTwd: "Base price",
  perSongAfterFiveTwd: "Price per song after the 5th",
  studentDiscountBps: "Student discount",
  rushBps: "Rush",
  consultationBps: "Consultation",
  sourcePrepBps: "Source prep",
};

export function isAmountField(field: keyof PriceValues): boolean {
  return field === "baseTwd" || field === "perSongAfterFiveTwd";
}

/** Percent inputs are posted as plain strings (no `:number` suffix). */
const PERCENT_INPUT_NAMES: Record<
  Exclude<keyof PriceValues, "baseTwd" | "perSongAfterFiveTwd">,
  string
> = {
  studentDiscountBps: "studentDiscountPercent",
  rushBps: "rushPercent",
  consultationBps: "consultationPercent",
  sourcePrepBps: "sourcePrepPercent",
};

/**
 * The form name of a value without its type suffix: amounts post as
 * `baseTwd:number`, percentages as `studentDiscountPercent`. Issues use it.
 */
export function priceInputName(field: keyof PriceValues): string {
  return isAmountField(field)
    ? field
    : PERCENT_INPUT_NAMES[field as keyof typeof PERCENT_INPUT_NAMES];
}

/** A scheduled price takes effect at least this far ahead. */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

function isTransition(serviceId: ServiceId): boolean {
  return serviceId === "simple_transition" || serviceId === "edit_transition";
}

/** Songs included in a transition's base price (none for mixing). */
export function includedSongsFor(serviceId: ServiceId): number {
  return isTransition(serviceId) ? 5 : 0;
}

export function formatTwd(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

/** One value as the Studio shows it: "NT$8,000" or "30%". */
export function formatPriceValue(
  field: keyof PriceValues,
  value: number,
): string {
  return isAmountField(field)
    ? formatTwd(value)
    : `${bpsToPercentLabel(value)}%`;
}

export function priceRuleFromValues(
  serviceId: ServiceId,
  values: PriceValues,
  versionId: string,
): PriceRule {
  return {
    versionId,
    serviceId,
    baseTwd: values.baseTwd,
    includedSongs: includedSongsFor(serviceId),
    perSongAfterIncludedTwd: values.perSongAfterFiveTwd,
    studentDiscountBps: values.studentDiscountBps,
    rushBps: values.rushBps,
    consultationBps: values.consultationBps,
    sourcePrepBps: values.sourcePrepBps,
  };
}

type Sample = {
  key: string;
  label: string;
  songs?: number;
  rush?: boolean;
  consultation?: boolean;
  sourcePrep?: boolean;
  student?: boolean;
};

const MIX_SAMPLES: Sample[] = [
  { key: "base", label: "Base" },
  { key: "rush", label: "Base + rush", rush: true },
  {
    key: "all",
    label: "Base + rush + source prep + student",
    rush: true,
    sourcePrep: true,
    student: true,
  },
];

const SIMPLE_SAMPLES: Sample[] = [
  { key: "five", label: "5 songs", songs: 5 },
  { key: "eight", label: "8 songs", songs: 8 },
  {
    key: "eight-consultation-rush",
    label: "8 songs + consultation + rush",
    songs: 8,
    consultation: true,
    rush: true,
  },
  { key: "five-student", label: "5 songs + student", songs: 5, student: true },
];

const EDIT_SAMPLES: Sample[] = [
  { key: "five", label: "5 songs", songs: 5 },
  { key: "eight", label: "8 songs", songs: 8 },
  {
    key: "eight-all",
    label: "8 songs + rush + source prep + student",
    songs: 8,
    rush: true,
    sourcePrep: true,
    student: true,
  },
];

const SAMPLES: Record<ServiceId, Sample[]> = {
  full_mix: MIX_SAMPLES,
  vocal_mix: MIX_SAMPLES,
  simple_transition: SIMPLE_SAMPLES,
  edit_transition: EDIT_SAMPLES,
};

type SampleQuote = { key: string; label: string; quote: QuoteBreakdown };

/**
 * Sample quotes through `calculateQuote`, so the Studio shows exactly what
 * the wizard computes. Song counts are sample sizes, not prices.
 */
export function sampleQuotes(
  serviceId: ServiceId,
  rule: PriceRule,
): SampleQuote[] {
  return SAMPLES[serviceId].map((sample) => {
    const input: QuoteInput = {
      serviceId,
      ...(sample.songs ? { songCount: sample.songs } : {}),
      rush: sample.rush ?? false,
      consultation: sample.consultation ?? false,
      sourcePrep: sample.sourcePrep ?? false,
      studentRequested: sample.student ?? false,
    };
    return {
      key: sample.key,
      label: sample.label,
      quote: calculateQuote(rule, input),
    };
  });
}

type PriceChangeWarning = { field: keyof PriceValues; message: string };

/** Values that change by more than 50 % relative to the baseline. */
export function priceChangeWarnings(
  baseline: PriceValues,
  next: PriceValues,
  fields: ReadonlyArray<keyof PriceValues> = PRICE_VALUE_FIELDS,
): PriceChangeWarning[] {
  const warnings: PriceChangeWarning[] = [];
  for (const field of fields) {
    const before = baseline[field];
    const after = next[field];
    if (before === after) continue;
    const from = formatPriceValue(field, before);
    const to = formatPriceValue(field, after);
    const label = PRICE_FIELD_LABELS[field];
    if (before === 0) {
      warnings.push({
        field,
        message: `${label} changes from ${from} to ${to}. Check the number.`,
      });
      continue;
    }
    const change = ((after - before) / before) * 100;
    if (Math.abs(change) <= 50) continue;
    const rounded = Math.round(change);
    warnings.push({
      field,
      message: `${label} changes by ${rounded > 0 ? "+" : ""}${rounded} %: ${from} → ${to}. Check the number.`,
    });
  }
  return warnings;
}

export type ActiveAmounts = {
  /** The NT$ amounts this service's quote uses (base, per song for transitions). */
  amounts: number[];
  /** "the active Full Song Mixing base price is NT$8,000" (figures from D1). */
  text: string;
};

/** The amounts of a service's active rule that legal text may mention. */
export function describeActiveAmounts(
  serviceName: string,
  serviceId: ServiceId,
  values: PriceValues,
): ActiveAmounts {
  if (EDITABLE_PRICE_FIELDS[serviceId].includes("perSongAfterFiveTwd")) {
    return {
      amounts: [values.baseTwd, values.perSongAfterFiveTwd],
      text: `the active ${serviceName} price is base ${formatTwd(values.baseTwd)}, ${formatTwd(values.perSongAfterFiveTwd)} per song after the 5th`,
    };
  }
  return {
    amounts: [values.baseTwd],
    text: `the active ${serviceName} base price is ${formatTwd(values.baseTwd)}`,
  };
}

const TWD_AMOUNT = /(?:NT\$|新[臺台]幣|TWD)\s*(\d{1,3}(?:,\d{3})+|\d+)/g;

/** NT$ / 新臺幣 / 新台幣 / TWD amounts in a text, first-seen order, no repeats. */
export function extractTwdAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(TWD_AMOUNT)) {
    const amount = Number((match[1] ?? "").replaceAll(",", ""));
    if (Number.isSafeInteger(amount) && !amounts.includes(amount)) {
      amounts.push(amount);
    }
  }
  return amounts;
}
