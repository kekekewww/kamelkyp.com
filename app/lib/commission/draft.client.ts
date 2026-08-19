import type { Locale } from "../i18n/locale";
import { type CommissionDraft, CommissionDraftSchema } from "./schema";

const PREFIX = "kamel:commission:v1";

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
