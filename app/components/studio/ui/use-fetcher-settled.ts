import { useEffect, useRef, useState } from "react";
import {
  createSettleTracker,
  type FetcherPhase,
  isFailedAnswer,
  observeFetcher,
} from "./fetcher-settle";

export type FetcherLike<D> = { state: FetcherPhase; data: D | undefined };

/**
 * Calls `onStart` when a submission leaves idle and `onSettled` exactly once
 * per finished submission, even when React skipped the busy renders
 * (`fetcher-settle.ts`). Handlers are read from a ref (latest closure), like
 * `useProjectSubmit`, so callers need no dependency list.
 */
export function useFetcherSettled<D>(
  fetcher: FetcherLike<D>,
  handlers: {
    onStart?: () => void;
    onSettled: (data: D | undefined) => void;
  },
): void {
  // Only the first render's value is kept (like `useRef(fetcher.state)` in
  // use-project-submit); later allocations are discarded.
  const tracker = useRef(createSettleTracker(fetcher.state, fetcher.data));
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const event = observeFetcher(tracker.current, fetcher.state, fetcher.data);
    if (event === "start") latest.current.onStart?.();
    else if (event === "settled") latest.current.onSettled(fetcher.data);
  }, [fetcher.state, fetcher.data]);
}

/**
 * How many of this fetcher's submissions have finished with a failed answer.
 * A list passes it as `useKeyboardReorder`'s `resetKey`, so a refused order
 * goes back to the server order (admin-architecture §4.12).
 */
export function useFailureCount(fetcher: FetcherLike<unknown>): number {
  const [failures, setFailures] = useState(0);
  useFetcherSettled(fetcher, {
    onSettled: (data) => {
      if (isFailedAnswer(data)) setFailures((count) => count + 1);
    },
  });
  return failures;
}
