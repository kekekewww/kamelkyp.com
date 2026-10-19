/**
 * Fetcher lifecycle tracking (admin-architecture §4.6–4.8, wp6 a). Router
 * state updates are transitions: on a slow render React can skip the
 * "submitting"/"loading" renders and go straight from idle to idle with new
 * data (227faa1). Every Studio result handler therefore settles on new data
 * too, through `observeFetcher` / `useFetcherSettled`.
 */
import { describe, expect, it } from "vitest";
import {
  createSettleTracker,
  type FetcherPhase,
  observeFetcher,
} from "../../app/components/studio/ui/fetcher-settle";

const A = { ok: true, n: 1 };
const B = { ok: true, n: 2 };
const C = { ok: true, n: 3 };

function observeAll(
  start: [FetcherPhase, unknown],
  steps: Array<[FetcherPhase, unknown]>,
) {
  const tracker = createSettleTracker(start[0], start[1]);
  return steps.map(([state, data]) => observeFetcher(tracker, state, data));
}

describe("fetcher settle tracker", () => {
  it("settles once for a full submission cycle", () => {
    expect(
      observeAll(
        ["idle", undefined],
        [
          ["submitting", undefined],
          ["loading", undefined],
          ["idle", B],
          ["idle", B],
        ],
      ),
    ).toEqual(["start", null, "settled", null]);
  });

  it("settles when React skips the busy renders", () => {
    // The pre-227faa1 rule (`previous !== "idle" && state === "idle"`) sees
    // idle → idle here and reports nothing: no toast, no SAVED, the guard
    // stays armed.
    expect(observeAll(["idle", A], [["idle", B]])).toEqual(["settled"]);
  });

  it("starts when only the loading render is seen", () => {
    expect(
      observeAll(
        ["idle", A],
        [
          ["loading", A],
          ["idle", B],
        ],
      ),
    ).toEqual(["start", "settled"]);
  });

  it("never settles at mount or on unrelated re-renders", () => {
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", A],
          ["idle", A],
          ["idle", A],
        ],
      ),
    ).toEqual([null, null, null]);
  });

  it("two submissions in a row settle twice", () => {
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", B],
          ["idle", C],
        ],
      ),
    ).toEqual(["settled", "settled"]);
  });

  it("an observed cycle without new data still settles once", () => {
    expect(
      observeAll(
        ["idle", A],
        [
          ["submitting", A],
          ["idle", A],
          ["idle", A],
        ],
      ),
    ).toEqual(["start", "settled", null]);
  });

  it("does not report a submission again when its busy state commits late", () => {
    // React Router keeps fetcher data outside the router state, so an urgent
    // render (typing during a save) can read the action's data while the
    // transition that carries the "loading" state has not committed yet. The
    // submission settles on that render; the late loading and idle renders
    // belong to it. Reporting them again showed two toasts and SAVED →
    // SAVING… → SAVED.
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", B],
          ["loading", B],
          ["idle", B],
          ["idle", B],
        ],
      ),
    ).toEqual(["settled", null, null, null]);
  });

  it("a new submission after a settle still starts and settles", () => {
    // "submitting" keeps the previous data, so it always starts.
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", B],
          ["submitting", B],
          ["loading", C],
          ["idle", C],
        ],
      ),
    ).toEqual(["settled", "start", null, "settled"]);
    // Submitting render skipped: "loading" already carries the new data.
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", B],
          ["loading", C],
          ["idle", C],
        ],
      ),
    ).toEqual(["settled", "start", "settled"]);
  });

  it("an observed cycle without new data after a settle still settles", () => {
    expect(
      observeAll(
        ["idle", A],
        [
          ["idle", B],
          ["submitting", B],
          ["idle", B],
          ["idle", B],
        ],
      ),
    ).toEqual(["settled", "start", "settled", null]);
  });
});

// Source text of every Studio component and route module, keyed by repository path.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      [
        "../../app/components/studio/**/*.{ts,tsx}",
        "../../app/routes/studio/**/*.{ts,tsx}",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  ).map(([path, source]) => [path.replace(/^(\.\.\/)+/, ""), source]),
);

/** "Finished" decided only from an observed busy state (misses idle → idle). */
const BUSY_STATE_ONLY: readonly RegExp[] = [
  /\.current\s*!==\s*"idle"\s*&&\s*[\w.]+\.state\s*===\s*"idle"/g,
  /\.current\s*===\s*"idle"\s*&&\s*[\w.]+\.state\s*===\s*"submitting"/g,
];

describe("studio fetcher handlers", () => {
  it("finds the Studio modules", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(Object.keys(sources)).toContain(
      "app/components/studio/ui/use-editor-form.ts",
    );
  });

  it("no Studio module uses the busy-state-only pattern", () => {
    const hits: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      for (const pattern of BUSY_STATE_ONLY) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          hits.push(`${path}:${line}`);
        }
      }
    }
    expect(hits.sort()).toEqual([]);
  });
});
