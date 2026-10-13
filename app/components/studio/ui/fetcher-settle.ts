/**
 * Fetcher lifecycle tracking (admin-architecture §4.6–4.8). Router state
 * updates are transitions: when rendering is slow, React can skip the
 * "submitting"/"loading" renders and go straight from idle to idle with new
 * data (227faa1). A submission has therefore finished when the fetcher is idle
 * and either a busy state was observed or its data is new.
 *
 * An observed busy cycle without new data (idle → submitting → idle with the
 * same data) still settles once, as 227faa1 does: the handler then sees the
 * previous result, which is what the fetcher holds.
 */
export type FetcherPhase = "idle" | "submitting" | "loading";
export type FetcherEvent = "start" | "settled" | null;

export interface SettleTracker {
  /** State seen on the previous observation. */
  state: FetcherPhase;
  /** Data already reported (or present at mount): never reported again. */
  handled: unknown;
}

export function createSettleTracker(
  state: FetcherPhase,
  data: unknown,
): SettleTracker {
  return { state, handled: data };
}

/** Advances `tracker` (mutates it) and says what this observation means. */
export function observeFetcher(
  tracker: SettleTracker,
  state: FetcherPhase,
  data: unknown,
): FetcherEvent {
  const previous = tracker.state;
  tracker.state = state;
  if (state !== "idle") return previous === "idle" ? "start" : null;
  if (previous === "idle" && data === tracker.handled) return null;
  tracker.handled = data;
  return "settled";
}
