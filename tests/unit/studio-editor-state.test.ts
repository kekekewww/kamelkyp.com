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
  reorderSource,
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
    expect(state.sent).toBeFalsy();
    // The caller sends the order on a drop.
    const dropped = keyboardReorderReducer(state, { type: "drop" });
    expect(dropped).toEqual({
      order: ["b", "c", "a"],
      picked: null,
      originIndex: null,
      sent: true,
    });
    const cancelled = keyboardReorderReducer(state, { type: "cancel" });
    expect(cancelled.order).toEqual(["a", "b", "c"]);
    expect(cancelled.picked).toBeNull();
    expect(cancelled.sent).toBeFalsy();
  });

  /** A list as `useKeyboardReorder` starts it: the server order, key 0. */
  function startedAt(server: string[]): KeyboardReorderState {
    return {
      order: server,
      picked: null,
      originIndex: null,
      source: reorderSource(server),
      resetKey: 0,
      sent: false,
      announcement: "",
    };
  }

  it("restarts from the server order on a new server order or reset key", () => {
    const server = ["a", "b", "c"];
    const source = reorderSource(server);
    const initial = startedAt(server);
    // A drop the server then refuses leaves the local order behind.
    let state = keyboardReorderReducer(initial, { type: "pick", id: "a" });
    state = keyboardReorderReducer(state, { type: "move", delta: 1 });
    state = keyboardReorderReducer(state, { type: "drop" });
    expect(state.order).toEqual(["b", "a", "c"]);
    expect(state.source).toBe(source);
    expect(state.sent).toBe(true);
    // Alt+arrow moves set and send the order at once and keep the source too.
    const altMoved = keyboardReorderReducer(initial, {
      type: "reset",
      order: ["c", "a", "b"],
    });
    expect(altMoved.source).toBe(source);
    expect(altMoved.sent).toBe(true);

    // Same server order, same key (the request is in flight): kept as is.
    expect(
      keyboardReorderReducer(state, {
        type: "sync",
        order: server,
        source,
        resetKey: 0,
      }),
    ).toBe(state);

    // The caller bumps its key after the failure: back to the server order.
    expect(
      keyboardReorderReducer(state, {
        type: "sync",
        order: server,
        source,
        resetKey: 1,
      }),
    ).toEqual({ ...initial, resetKey: 1 });

    // A new server order (a saved reorder, another tab) restarts it as well,
    // also while a row is picked up.
    const saved = ["b", "a", "c"];
    const picked = keyboardReorderReducer(state, { type: "pick", id: "c" });
    expect(
      keyboardReorderReducer(picked, {
        type: "sync",
        order: saved,
        source: reorderSource(saved),
        resetKey: 0,
      }),
    ).toEqual(startedAt(saved));
  });

  it("a new reset key leaves a list alone that sent no order since it restarted", () => {
    // Another group on the same fetcher failed, or a row action did, while
    // this list has a row picked up and moved but not dropped.
    const server = ["a", "b", "c"];
    let state = keyboardReorderReducer(startedAt(server), {
      type: "pick",
      id: "a",
    });
    state = keyboardReorderReducer(state, { type: "move", delta: 1 });
    state = keyboardReorderReducer(state, {
      type: "announce",
      text: "a moved to position 2 of 3.",
    });
    const synced = keyboardReorderReducer(state, {
      type: "sync",
      order: server,
      source: reorderSource(server),
      resetKey: 1,
    });
    expect(synced).toEqual({ ...state, resetKey: 1 });
    expect(synced.picked).toBe("a");
    expect(synced.order).toEqual(["b", "a", "c"]);

    // Once it drops, its own failure restarts it.
    const dropped = keyboardReorderReducer(synced, { type: "drop" });
    expect(
      keyboardReorderReducer(dropped, {
        type: "sync",
        order: server,
        source: reorderSource(server),
        resetKey: 2,
      }).order,
    ).toEqual(server);
  });

  it("a restore after a failure clears the announcement, so the same move retried is announced", () => {
    const server = ["a", "b", "c"];
    const moved = "c moved to position 2 of 3.";
    let state = keyboardReorderReducer(startedAt(server), {
      type: "reset",
      order: ["a", "c", "b"],
    });
    state = keyboardReorderReducer(state, { type: "announce", text: moved });
    expect(state.announcement).toBe(moved);
    // The same text again is no change.
    expect(
      keyboardReorderReducer(state, { type: "announce", text: moved }),
    ).toBe(state);

    const restored = keyboardReorderReducer(state, {
      type: "sync",
      order: server,
      source: reorderSource(server),
      resetKey: 1,
    });
    expect(restored.order).toEqual(server);
    expect(restored.announcement).toBe("");
    const retried = keyboardReorderReducer(
      keyboardReorderReducer(restored, {
        type: "reset",
        order: ["a", "c", "b"],
      }),
      { type: "announce", text: moved },
    );
    expect(retried.announcement).toBe(moved);

    // A saved order keeps what was last announced: it describes the list.
    const saved = ["a", "c", "b"];
    expect(
      keyboardReorderReducer(state, {
        type: "sync",
        order: saved,
        source: reorderSource(saved),
        resetKey: 0,
      }).announcement,
    ).toBe(moved);
  });

  it("tells server orders apart", () => {
    expect(reorderSource(["a", "b"])).toBe(reorderSource(["a", "b"]));
    expect(reorderSource(["a", "b"])).not.toBe(reorderSource(["b", "a"]));
    expect(reorderSource(["ab"])).not.toBe(reorderSource(["a", "b"]));
    expect(reorderSource([])).not.toBe(reorderSource([""]));
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
