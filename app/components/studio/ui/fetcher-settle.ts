/**
 * Fetcher lifecycle tracking (admin-architecture §4.6–4.8). Router state
 * updates are transitions: when rendering is slow, React can skip the
 * "submitting"/"loading" renders and go straight from idle to idle with new
 * data (227faa1). A submission has therefore finished when the fetcher is idle
 * and either its data is new or a busy state was observed since the last
 * report.
 *
 * An observed busy cycle without new data (idle → submitting → idle with the
 * same data) still settles once, as 227faa1 does: the handler then sees the
 * previous result, which is what the fetcher holds.
 *
 * React Router keeps fetcher data outside the router state (a map it fills
 * before it starts the transition), so an urgent render, such as typing while
 * a save is in flight, can see the action's data while the transition that
 * carries the "loading" state has not committed yet. The submission settles on
 * that render. The "loading" state that commits afterwards with the same data
 * belongs to it: it is neither a new start nor a second settle. A new
 * submission always differs: "submitting" counts as a start whatever its data,
 * and "loading" after an action carries that action's new data.
 */
export type FetcherPhase = "idle" | "submitting" | "loading";
type FetcherEvent = "start" | "settled" | null;

interface SettleTracker {
  /** State seen on the previous observation. */
  state: FetcherPhase;
  /** Data already reported (or present at mount): never reported again. */
  handled: unknown;
  /** `handled` came from a report, not from the mount. */
  reported: boolean;
  /** A start was reported and its submission has not settled yet. */
  open: boolean;
}

export function createSettleTracker(
  state: FetcherPhase,
  data: unknown,
): SettleTracker {
  return { state, handled: data, reported: false, open: false };
}

/** Advances `tracker` (mutates it) and says what this observation means. */
export function observeFetcher(
  tracker: SettleTracker,
  state: FetcherPhase,
  data: unknown,
): FetcherEvent {
  const previous = tracker.state;
  tracker.state = state;
  if (state !== "idle") {
    if (previous !== "idle") return null;
    // The late commit of a submission that already settled (see above).
    if (state === "loading" && tracker.reported && data === tracker.handled) {
      return null;
    }
    tracker.open = true;
    return "start";
  }
  const sameData = data === tracker.handled;
  if (sameData && (previous === "idle" || !tracker.open)) return null;
  tracker.handled = data;
  tracker.reported = true;
  tracker.open = false;
  return "settled";
}

/** A Studio action answer that reports a failure (`{ ok: false, … }`). */
export function isFailedAnswer(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { ok?: unknown }).ok === false
  );
}
