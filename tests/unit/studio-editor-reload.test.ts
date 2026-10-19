/**
 * Remounting an editor with the server copy (wp6 a review). The project
 * editor's fields are uncontrolled, so a revert shows the published text only
 * through a remount, and that remount must render the loader data that
 * carries the revert. A submission can settle before that data commits
 * (`fetcher-settle.ts`: the fetcher's data is read outside the router state),
 * so a remount at settle time kept the pre-revert text under the new
 * revision, and the next save wrote it back.
 */
import { describe, expect, it } from "vitest";
import {
  NO_RELOAD,
  reloadFor,
  requestReload,
} from "../../app/components/studio/ui/editor-reload";
import {
  createSettleTracker,
  observeFetcher,
} from "../../app/components/studio/ui/fetcher-settle";

const at = (revision: number, id = "p1") => ({ id, revision });

describe("editor reload", () => {
  it("leaves the editor mounted until something asks for a reload", () => {
    expect(reloadFor(NO_RELOAD, at(4))).toBe(NO_RELOAD);
  });

  it("waits for the loader data that carries the revert", () => {
    // The revert produced revision 5; the editor still renders revision 4.
    let state = requestReload(NO_RELOAD, at(5));
    expect(state.epoch).toBe(0);
    // Renders before the revalidated loader data commits keep the editor.
    expect(reloadFor(state, at(4))).toBe(state);
    expect(reloadFor(state, at(4))).toBe(state);
    // The revalidated data remounts it, once.
    state = reloadFor(state, at(5));
    expect(state).toEqual({ epoch: 1, awaiting: null });
    expect(reloadFor(state, at(5))).toBe(state);
  });

  it("remounts at once when the loader data already carries the revert", () => {
    const state = requestReload(NO_RELOAD, at(5));
    expect(reloadFor(state, at(5))).toEqual({ epoch: 1, awaiting: null });
  });

  it("also remounts on a newer copy (saved elsewhere after the revert)", () => {
    const state = requestReload(NO_RELOAD, at(5));
    expect(reloadFor(state, at(6))).toEqual({ epoch: 1, awaiting: null });
  });

  it("remounts at once when no revision is given (Reload latest)", () => {
    const state = requestReload({ epoch: 2, awaiting: null });
    expect(state).toEqual({ epoch: 3, awaiting: null });
    expect(reloadFor(state, at(4))).toBe(state);
  });

  it("drops the wait when another entry is rendered", () => {
    const state = requestReload({ epoch: 1, awaiting: null }, at(5));
    expect(reloadFor(state, at(9, "p2"))).toEqual({
      epoch: 1,
      awaiting: null,
    });
  });

  it("a revert that settles on an urgent render remounts on the revalidated data", () => {
    // The review scenario: the action's data arrives (RouterProvider's
    // fetcher data map) while the committed router state still says idle and
    // still holds the loader data of revision 4. An urgent render (typing)
    // settles the submission there.
    const before = { ok: true, intent: "save", meta: at(4) };
    const reverted = { ok: true, intent: "revert", meta: at(5) };
    const tracker = createSettleTracker("idle", before);
    let state = NO_RELOAD;
    const render = (
      phase: "idle" | "loading",
      data: typeof before,
      loaded: ReturnType<typeof at>,
    ) => {
      if (observeFetcher(tracker, phase, data) === "settled") {
        state = requestReload(state, data.meta);
      }
      state = reloadFor(state, loaded);
      return state.epoch;
    };
    // Settles here, on the pre-revert loader data: no remount yet.
    expect(render("idle", reverted, at(4))).toBe(0);
    // The late "loading" commit still carries revision 4.
    expect(render("loading", reverted, at(4))).toBe(0);
    // The revalidated loader data remounts the editor with the reverted copy.
    expect(render("idle", reverted, at(5))).toBe(1);
    expect(render("idle", reverted, at(5))).toBe(1);
  });
});
