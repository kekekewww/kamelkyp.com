/**
 * Save-state model (admin-architecture §4.6) and local backup helpers. Pure:
 * the editor hook wires these to the form, the fetcher and sessionStorage.
 */

export type SaveState =
  | { kind: "saved"; lastSavedAt: string | null }
  | { kind: "unsaved"; lastSavedAt: string | null }
  | { kind: "saving"; lastSavedAt: string | null }
  | { kind: "error"; lastSavedAt: string | null; message: string };

export type SaveEvent =
  | { type: "change"; dirty: boolean }
  | { type: "submit" }
  | { type: "success"; at: string }
  | { type: "failure"; message: string }
  | { type: "reset"; at: string | null };

export function initialSaveState(lastSavedAt: string | null): SaveState {
  return { kind: "saved", lastSavedAt };
}

export function saveStateReducer(
  state: SaveState,
  event: SaveEvent,
): SaveState {
  switch (event.type) {
    case "change":
      // An in-flight save and a visible error both stay until resolved.
      if (state.kind === "saving" || state.kind === "error") return state;
      return {
        kind: event.dirty ? "unsaved" : "saved",
        lastSavedAt: state.lastSavedAt,
      };
    case "submit":
      return { kind: "saving", lastSavedAt: state.lastSavedAt };
    case "success":
      return { kind: "saved", lastSavedAt: event.at };
    case "failure":
      return {
        kind: "error",
        lastSavedAt: state.lastSavedAt,
        message: event.message,
      };
    case "reset":
      return { kind: "saved", lastSavedAt: event.at };
  }
}

function clock(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/** `SAVED 14:02` · `NO CHANGES` · `UNSAVED CHANGES` · `SAVING…` · `ERROR — RETRY`. */
export function saveStateLabel(state: SaveState, timeZone?: string): string {
  switch (state.kind) {
    case "saved":
      return state.lastSavedAt
        ? `SAVED ${clock(state.lastSavedAt, timeZone)}`
        : "NO CHANGES";
    case "unsaved":
      return "UNSAVED CHANGES";
    case "saving":
      return "SAVING…";
    case "error":
      return "ERROR — RETRY";
  }
}

const IGNORED_FIELDS = new Set(["csrfToken", "intent", "expectedRevision"]);

/** Stable serialization of a form's content fields (dirty tracking, backups). */
export function serializeForm(formData: FormData): string {
  const entries: Array<[string, string]> = [];
  for (const [name, value] of formData.entries()) {
    if (IGNORED_FIELDS.has(name) || typeof value !== "string") continue;
    entries.push([name, value]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

export type FormBackup = { savedAt: string; fields: string };

export function backupKey(type: string, id: string): string {
  return `studio:${type}:${id}`;
}

/** A local backup is worth offering only when it is newer than the server copy. */
export function isBackupNewer(
  backup: FormBackup | null,
  serverUpdatedAt: string | null,
): boolean {
  if (!backup) return false;
  if (!serverUpdatedAt) return true;
  return Date.parse(backup.savedAt) > Date.parse(serverUpdatedAt);
}
