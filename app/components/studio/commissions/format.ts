/**
 * Display helpers for the Commissions inbox (pure, client-safe).
 *
 * Every amount is a stored D1 value: `locked_price_minor` and the student
 * review candidates are whole NT$ for TWD and cents for USD. The only
 * arithmetic here is cents → dollars for display, in the public formats of
 * `components/pricing/service-price.tsx`. (The services editor's
 * `formatMoney` treats amounts as major units, so it must not print cases.)
 *
 * Dates are UTC: the submitted date matches the case ID's date segment, and
 * server and client render the same text.
 */
import type {
  CommissionCaseRow,
  CommissionService,
  ServiceId,
} from "../../../lib/cms/schemas/commission";

export function formatCaseMoney(
  minor: number,
  currency: "TWD" | "USD",
): string {
  return currency === "USD"
    ? `US$${(minor / 100).toFixed(2)}`
    : `NT$${new Intl.NumberFormat("en-US").format(minor)}`;
}

/** `YYYY-MM-DD` (UTC). */
export function formatCaseDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso.slice(0, 10)
    : date.toISOString().slice(0, 10);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `d Mon` (UTC), e.g. "20 Oct". */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function isDue(dueAt: string, now: string): boolean {
  return new Date(dueAt).getTime() <= new Date(now).getTime();
}

/** Badge text for a scheduled or due cleanup. */
export function cleanupLabel(dueAt: string, now: string): string {
  return isDue(dueAt, now)
    ? "CLEANUP DUE"
    : `CLEANUP ${formatShortDate(dueAt)}`;
}

export type CaseMarker = {
  kind: "student" | "cleanup-due" | "cleanup-scheduled" | "cleaned";
  label: string;
};

export function caseMarkers(
  row: Pick<
    CommissionCaseRow,
    "studentReviewPending" | "cleanupDueAt" | "temporaryRecords"
  >,
  now: string,
): CaseMarker[] {
  const markers: CaseMarker[] = [];
  if (row.studentReviewPending) {
    markers.push({ kind: "student", label: "STUDENT PRICE" });
  }
  if (row.cleanupDueAt) {
    markers.push({
      kind: isDue(row.cleanupDueAt, now) ? "cleanup-due" : "cleanup-scheduled",
      label: cleanupLabel(row.cleanupDueAt, now),
    });
  }
  if (row.temporaryRecords === "removed") {
    markers.push({ kind: "cleaned", label: "CLEANED" });
  }
  return markers;
}

export type ServiceNameView = {
  primary: string;
  primaryLang: "zh-Hant" | "en";
  /** EN name when it differs from the zh one. */
  secondary: string | null;
};

/** zh name first, EN as a secondary line; the service id when unnamed. */
export function serviceName(
  services: readonly CommissionService[],
  id: ServiceId,
): ServiceNameView {
  const name = services.find((service) => service.id === id)?.name;
  const zh = name?.zh.trim() ?? "";
  const en = name?.en.trim() ?? "";
  if (zh) {
    return {
      primary: zh,
      primaryLang: "zh-Hant",
      secondary: en && en !== zh ? en : null,
    };
  }
  return { primary: en || id, primaryLang: "en", secondary: null };
}

/** EN label for a filter option (Studio chrome is English). */
export function serviceOptionLabel(service: CommissionService): string {
  return service.name.en.trim() || service.name.zh.trim() || service.id;
}
