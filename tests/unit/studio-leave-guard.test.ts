import { describe, expect, it } from "vitest";
import {
  leaveGuardStep,
  requestSave,
  unsentMessage,
} from "../../app/components/studio/media/leave-guard";
import {
  initialSaveState,
  type SaveState,
  saveStateReducer,
} from "../../app/components/studio/ui/editor-state";

/** The editor's save state after a failed save and a later fix of the value. */
function afterFailedSave(): SaveState {
  let state = initialSaveState("2026-10-28T10:00:00Z");
  state = saveStateReducer(state, { type: "change", dirty: true });
  state = saveStateReducer(state, { type: "submit" });
  state = saveStateReducer(state, {
    type: "failure",
    message: "Use minutes:seconds, for example 3:15.",
  });
  // Typing the fix keeps the visible error until the next save resolves it.
  return saveStateReducer(state, { type: "change", dirty: true });
}

function unsaved(): SaveState {
  return saveStateReducer(initialSaveState(null), {
    type: "change",
    dirty: true,
  });
}

describe("Save and leave (leaveGuardStep)", () => {
  it("waits while the state is still the one seen at the click", () => {
    const clicked = unsaved();
    expect(leaveGuardStep(clicked, clicked)).toBe("wait");
  });

  it("waits while the save is in flight, then proceeds once it is saved", () => {
    const clicked = unsaved();
    const saving = saveStateReducer(clicked, { type: "submit" });
    expect(leaveGuardStep(clicked, saving)).toBe("wait");
    const saved = saveStateReducer(saving, {
      type: "success",
      at: "2026-10-28T10:05:00Z",
    });
    expect(leaveGuardStep(clicked, saved)).toBe("proceed");
  });

  it("stays on the page when this save fails", () => {
    const clicked = unsaved();
    const failed = saveStateReducer(
      saveStateReducer(clicked, { type: "submit" }),
      { type: "failure", message: "The save failed. Try again." },
    );
    expect(leaveGuardStep(clicked, failed)).toBe("reset");
  });

  it("does not treat the error shown at the click as this save's answer", () => {
    const clicked = afterFailedSave();
    expect(clicked.kind).toBe("error");
    // Before the submission starts, the state is still the clicked ERROR.
    expect(leaveGuardStep(clicked, clicked)).toBe("wait");
    const saving = saveStateReducer(clicked, { type: "submit" });
    expect(leaveGuardStep(clicked, saving)).toBe("wait");
    const saved = saveStateReducer(saving, {
      type: "success",
      at: "2026-10-28T10:06:00Z",
    });
    expect(leaveGuardStep(clicked, saved)).toBe("proceed");
  });

  it("acts on the answer when React skipped the SAVING render", () => {
    const clicked = afterFailedSave();
    // submit + success in one render: only the result is ever seen.
    const saved = saveStateReducer(
      saveStateReducer(clicked, { type: "submit" }),
      { type: "success", at: "2026-10-28T10:07:00Z" },
    );
    expect(leaveGuardStep(clicked, saved)).toBe("proceed");
    // A second failure is a new ERROR object, so it resets.
    const failedAgain = saveStateReducer(
      saveStateReducer(clicked, { type: "submit" }),
      { type: "failure", message: "Use minutes:seconds, for example 3:15." },
    );
    expect(failedAgain).not.toBe(clicked);
    expect(leaveGuardStep(clicked, failedAgain)).toBe("reset");
  });
});

/**
 * A form as `requestSubmit` treats it: a valid one dispatches `submit`
 * synchronously; constraint validation stops an invalid one before any
 * submit event (12.5 in a `step=1` number field, say).
 */
class StandInForm extends EventTarget {
  submits = 0;
  constructor(private readonly valid: boolean) {
    super();
  }
  requestSubmit() {
    if (!this.valid) return;
    this.submits += 1;
    this.dispatchEvent(new Event("submit", { cancelable: true }));
  }
}

describe("Save and leave: the save request (requestSave)", () => {
  it("reports a save the browser sent", () => {
    const form = new StandInForm(true);
    expect(requestSave(form)).toBe(true);
    expect(form.submits).toBe(1);
  });

  it("reports a save that constraint validation kept from starting", () => {
    // No submit event, so no fetcher and no new save state: waiting for one
    // would leave the dialog on "Saving…" for good.
    const form = new StandInForm(false);
    expect(requestSave(form)).toBe(false);
  });
});

describe("Save and leave: the unsent message", () => {
  it("names the field the browser refused", () => {
    expect(unsentMessage(" Preview starts (seconds) ")).toBe(
      "“Preview starts (seconds)” has a value this form cannot save. Stay to correct it, or discard the changes.",
    );
  });

  it("still explains when the field has no label", () => {
    expect(unsentMessage(null)).toBe(
      "A field has a value this form cannot save. Stay to correct it, or discard the changes.",
    );
    expect(unsentMessage("  ")).toBe(unsentMessage(null));
  });
});
