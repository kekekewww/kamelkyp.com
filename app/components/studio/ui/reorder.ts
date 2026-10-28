/**
 * Ordering logic (admin-architecture §4.12), dependency-free. Explicit Move
 * up / Move down controls plus a keyboard pick-up / move / drop model; each
 * drop saves the full ordered id list in one request. The order restarts from
 * the server order when that order changes, or when the caller's reset key
 * does (a failed answer) while this list has an order out, so a refused order
 * never stays on screen.
 */

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** Names one server order: a different value is a new server order. */
export function reorderSource(ids: readonly string[]): string {
  return JSON.stringify(ids);
}

export interface KeyboardReorderState {
  order: string[];
  picked: string | null;
  /** Where the picked row started (Escape restores it). */
  originIndex: number | null;
  /** The `reorderSource` the order started from (absent: never synced). */
  source?: string;
  /** The caller's reset key at the last sync. */
  resetKey?: string | number;
  /**
   * The caller has sent an order (a drop, Alt+arrows, Move up / Move down)
   * since the order last restarted from the server order.
   */
  sent?: boolean;
  /** Live-region text (`reorderAnnouncement`). */
  announcement?: string;
}

export type KeyboardReorderAction =
  | { type: "pick"; id: string }
  | { type: "move"; delta: number }
  /** Drops the picked row; the caller sends the order. */
  | { type: "drop" }
  | { type: "cancel" }
  /** A local order set at once and sent (Alt+arrows, Move up / Move down). */
  | { type: "reset"; order: string[] }
  | { type: "announce"; text: string }
  /** The server order and the caller's reset key of this render. */
  | {
      type: "sync";
      order: string[];
      source: string;
      resetKey: string | number;
    };

export function keyboardReorderReducer(
  state: KeyboardReorderState,
  action: KeyboardReorderAction,
): KeyboardReorderState {
  switch (action.type) {
    case "pick": {
      const index = state.order.indexOf(action.id);
      if (index < 0) return state;
      return { ...state, picked: action.id, originIndex: index };
    }
    case "move": {
      if (!state.picked) return state;
      const index = state.order.indexOf(state.picked);
      return {
        ...state,
        order: moveItem(state.order, index, index + action.delta),
      };
    }
    case "drop":
      return { ...state, picked: null, originIndex: null, sent: true };
    case "cancel": {
      if (!state.picked || state.originIndex === null) return state;
      const index = state.order.indexOf(state.picked);
      return {
        ...state,
        order: moveItem(state.order, index, state.originIndex),
        picked: null,
        originIndex: null,
      };
    }
    case "reset":
      return {
        ...state,
        order: action.order,
        picked: null,
        originIndex: null,
        sent: true,
      };
    case "announce":
      if (state.announcement === action.text) return state;
      return { ...state, announcement: action.text };
    case "sync": {
      const newOrder = state.source !== action.source;
      const newKey = state.resetKey !== action.resetKey;
      if (!newOrder && !newKey) return state;
      // A new key alone is a failed answer on the caller's fetcher. Only a
      // list with an order out may show what the server refused; any other
      // list on that fetcher (another services group, the projects strip
      // beside the rows, a failed row action) keeps its order and a pick in
      // progress.
      if (!newOrder && !state.sent) {
        return { ...state, resetKey: action.resetKey };
      }
      return {
        order: action.order,
        picked: null,
        originIndex: null,
        source: action.source,
        resetKey: action.resetKey,
        sent: false,
        // After a failure the last announcement no longer describes the
        // list; cleared, the same move tried again is announced again.
        announcement: newKey ? "" : state.announcement,
      };
    }
  }
}

export function reorderAnnouncement(
  event: "picked" | "moved" | "dropped" | "cancelled",
  label: string,
  index: number,
  total: number,
): string {
  const position = `position ${index + 1} of ${total}`;
  switch (event) {
    case "picked":
      return `Picked up ${label}, ${position}.`;
    case "moved":
      return `${label} moved to ${position}.`;
    case "dropped":
      return `${label} dropped at ${position}.`;
    case "cancelled":
      return `Reorder cancelled. ${label} returned to ${position}.`;
  }
}
