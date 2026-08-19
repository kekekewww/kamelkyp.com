import type { Locale } from "../i18n/locale";
import { type CommissionDraft, CommissionDraftSchema } from "./schema";

const PREFIX = "kamel:commission:v1";
const ATTEMPT_PREFIX = "kamel:commission-attempt:v1";
const CASE_ID_PATTERN = /^KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/;

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

function key(locale: Locale, serviceId: CommissionDraft["serviceId"]) {
  return `${PREFIX}:${locale}:${serviceId}`;
}

function resolveStorage(storage?: DraftStorage): DraftStorage {
  if (storage) return storage;
  if (typeof localStorage === "undefined") {
    throw new Error("local_storage_unavailable");
  }
  return localStorage;
}

export function saveDraft(
  locale: Locale,
  draft: CommissionDraft,
  storage?: DraftStorage,
): void {
  const parsed = CommissionDraftSchema.parse(draft);
  resolveStorage(storage).setItem(
    key(locale, parsed.serviceId),
    JSON.stringify(parsed),
  );
}

export function loadDraft(
  locale: Locale,
  serviceId: CommissionDraft["serviceId"],
  storage?: DraftStorage,
): CommissionDraft | null {
  const target = resolveStorage(storage);
  const storageKey = key(locale, serviceId);
  const raw = target.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = CommissionDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // The invalid value is removed below without exposing its contents.
  }
  target.removeItem(storageKey);
  return null;
}

export function clearDraft(
  locale: Locale,
  serviceId: CommissionDraft["serviceId"],
  storage?: DraftStorage,
): void {
  resolveStorage(storage).removeItem(key(locale, serviceId));
}

function attemptKey(serviceId: CommissionDraft["serviceId"]): string {
  return `${ATTEMPT_PREFIX}:${serviceId}`;
}

export function saveRetryCaseId(
  serviceId: CommissionDraft["serviceId"],
  caseId: string,
  storage?: DraftStorage,
): void {
  if (!CASE_ID_PATTERN.test(caseId)) throw new Error("retry_case_id_invalid");
  resolveStorage(storage).setItem(attemptKey(serviceId), caseId);
}

export function loadRetryCaseId(
  serviceId: CommissionDraft["serviceId"],
  storage?: DraftStorage,
): string | null {
  const target = resolveStorage(storage);
  const storageKey = attemptKey(serviceId);
  const caseId = target.getItem(storageKey);
  if (!caseId) return null;
  if (CASE_ID_PATTERN.test(caseId)) return caseId;
  target.removeItem(storageKey);
  return null;
}

export function clearRetryCaseId(
  serviceId: CommissionDraft["serviceId"],
  storage?: DraftStorage,
): void {
  resolveStorage(storage).removeItem(attemptKey(serviceId));
}
