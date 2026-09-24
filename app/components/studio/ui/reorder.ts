/**
 * Ordering logic (admin-architecture §4.12), dependency-free. Explicit Move
 * up / Move down controls plus a keyboard pick-up / move / drop model; each
 * drop saves the full ordered id list in one request.
 */

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

export interface KeyboardReorderState {
  order: string[];
  picked: string | null;
  /** Where the picked row started (Escape restores it). */
  originIndex: number | null;
}

export type KeyboardReorderAction =
  | { type: "pick"; id: string }
  | { type: "move"; delta: number }
  | { type: "drop" }
  | { type: "cancel" }
  | { type: "reset"; order: string[] };

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
      return { ...state, picked: null, originIndex: null };
    case "cancel": {
      if (!state.picked || state.originIndex === null) return state;
      const index = state.order.indexOf(state.picked);
      return {
        order: moveItem(state.order, index, state.originIndex),
        picked: null,
        originIndex: null,
      };
    }
    case "reset":
      return { order: action.order, picked: null, originIndex: null };
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
