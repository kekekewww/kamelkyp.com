import { describe, expect, it } from "vitest";
import {
  backupKey,
  initialSaveState,
  isBackupNewer,
  saveStateLabel,
  saveStateReducer,
  serializeForm,
} from "../../app/components/studio/ui/editor-state";
import {
  type KeyboardReorderState,
  keyboardReorderReducer,
  moveItem,
  reorderAnnouncement,
} from "../../app/components/studio/ui/reorder";

describe("save state", () => {
  it("is always exactly one of saved, unsaved, saving or error", () => {
    let state = initialSaveState(null);
    expect(saveStateLabel(state)).toBe("NO CHANGES");
    state = saveStateReducer(state, { type: "change", dirty: true });
    expect(state.kind).toBe("unsaved");
    expect(saveStateLabel(state)).toBe("UNSAVED CHANGES");
    state = saveStateReducer(state, { type: "submit" });
    expect(saveStateLabel(state)).toBe("SAVING…");
    state = saveStateReducer(state, { type: "change", dirty: true });
    expect(state.kind).toBe("saving");
    state = saveStateReducer(state, {
      type: "success",
      at: "2026-09-24T14:02:00Z",
    });
    expect(state).toMatchObject({
      kind: "saved",
      lastSavedAt: "2026-09-24T14:02:00Z",
    });
    expect(saveStateLabel(state, "UTC")).toBe("SAVED 14:02");
  });

  it("keeps an error visible until the next successful save", () => {
    let state = saveStateReducer(initialSaveState("2026-09-24T10:00:00Z"), {
      type: "failure",
      message: "This entry changed elsewhere.",
    });
    expect(saveStateLabel(state)).toBe("ERROR — RETRY");
    state = saveStateReducer(state, { type: "change", dirty: true });
    expect(state.kind).toBe("error");
    state = saveStateReducer(state, { type: "change", dirty: false });
    expect(state.kind).toBe("error");
    state = saveStateReducer(state, { type: "submit" });
    state = saveStateReducer(state, {
      type: "success",
      at: "2026-09-24T11:00:00Z",
    });
    expect(state.kind).toBe("saved");
  });

  it("returns to saved when edits are undone", () => {
    let state = initialSaveState("2026-09-24T10:00:00Z");
    state = saveStateReducer(state, { type: "change", dirty: true });
    state = saveStateReducer(state, { type: "change", dirty: false });
    expect(state).toMatchObject({
      kind: "saved",
      lastSavedAt: "2026-09-24T10:00:00Z",
    });
  });
});

describe("form serialization and backup", () => {
  it("serializes content fields in a stable order without auth fields", () => {
    const a = new FormData();
    a.set("title.en", "A");
    a.set("title.zh", "甲");
    a.set("csrfToken", "t1");
    a.set("intent", "save");
    const b = new FormData();
    b.set("csrfToken", "t2");
    b.set("title.zh", "甲");
    b.set("title.en", "A");
    expect(serializeForm(a)).toBe(serializeForm(b));
    b.set("title.en", "B");
    expect(serializeForm(a)).not.toBe(serializeForm(b));
  });

  it("keys backups per entry and compares them with the server copy", () => {
    expect(backupKey("project", "abc")).toBe("studio:project:abc");
    expect(
      isBackupNewer(
        { savedAt: "2026-09-24T14:05:00Z", fields: "{}" },
        "2026-09-24T14:02:00Z",
      ),
    ).toBe(true);
    expect(
      isBackupNewer(
        { savedAt: "2026-09-24T14:00:00Z", fields: "{}" },
        "2026-09-24T14:02:00Z",
      ),
    ).toBe(false);
    expect(isBackupNewer(null, "2026-09-24T14:02:00Z")).toBe(false);
  });
});

describe("ordering", () => {
  it("moves items without mutating the list", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, -5)).toEqual(["d", "a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("picks up, moves, drops and cancels with the keyboard", () => {
    let state: KeyboardReorderState = {
      order: ["a", "b", "c"],
      picked: null,
      originIndex: null,
    };
    state = keyboardReorderReducer(state, { type: "pick", id: "a" });
    expect(state.picked).toBe("a");
    state = keyboardReorderReducer(state, { type: "move", delta: 1 });
    state = keyboardReorderReducer(state, { type: "move", delta: 1 });
    state = keyboardReorderReducer(state, { type: "move", delta: 1 });
    expect(state.order).toEqual(["b", "c", "a"]);
    const dropped = keyboardReorderReducer(state, { type: "drop" });
    expect(dropped).toEqual({
      order: ["b", "c", "a"],
      picked: null,
      originIndex: null,
    });
    const cancelled = keyboardReorderReducer(state, { type: "cancel" });
    expect(cancelled.order).toEqual(["a", "b", "c"]);
    expect(cancelled.picked).toBeNull();
  });

  it("announces pick-ups and positions", () => {
    expect(reorderAnnouncement("picked", "Signal Garden", 2, 12)).toBe(
      "Picked up Signal Garden, position 3 of 12.",
    );
    expect(reorderAnnouncement("dropped", "Signal Garden", 0, 12)).toBe(
      "Signal Garden dropped at position 1 of 12.",
    );
  });
});
