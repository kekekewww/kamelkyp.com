/**
 * One fetcher per commissions resource route (`/studio/commissions/status`,
 * `/student-discount`, `/cleanup`), owned by a component that stays mounted
 * (the inbox or the queues), so a result still reaches its toast after the
 * row or queue item that started it has left the page.
 *
 * `submit` posts the fields with the CSRF token; a `fetcher.Form` posting
 * the same route calls `track` first. `onResult` runs once per finished
 * submission with the fields that were sent. React Router does not
 * revalidate after a 4xx action, so the "stale page" codes revalidate here:
 * the list, the queues and the sidebar count then match D1 again.
 *
 * "Finished" is the shared Studio settle rule (`useFetcherSettled`, wp6):
 * idle and either a busy state was seen or the data is new, so a result
 * is reported even when React skipped the busy renders.
 *
 * Every other row stays usable while one submission is in flight, but a
 * second `fetcher.submit` would abort the first (`router.fetch` starts with
 * `abortFetcher`), losing its toast, its Undo and maybe the change itself.
 * So `submit` queues behind the submission in flight and posts the next one
 * once that has settled; `pendingCaseIds` names every case in flight or
 * waiting.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type FetcherWithComponents,
  useFetcher,
  useRevalidator,
} from "react-router";
import type { ActionResult } from "../../../lib/cms/studio/responses";
import { useFetcherSettled, useStudioSession } from "../ui";

export type SentFields = Record<string, string>;

export type CommissionResult = ActionResult<Record<string, unknown>>;

/** Codes whose message promises a refreshed list. */
export const STALE_PAGE_CODES: ReadonlySet<string> = new Set([
  "case_not_found",
  "student_review_conflict",
  "cleanup_not_due",
  "student_review_pending",
]);

const NO_ANSWER: CommissionResult = {
  ok: false,
  code: "no_answer",
  message: "The Studio did not answer. Check the connection and retry.",
};

/** One fetcher's submissions: the one in flight, then the waiting ones. */
export type SubmissionQueue = {
  readonly inFlight: SentFields | null;
  readonly waiting: readonly SentFields[];
};

export const EMPTY_QUEUE: SubmissionQueue = { inFlight: null, waiting: [] };

/**
 * A new submission is posted at once only when the fetcher is idle and
 * nothing is in flight; otherwise it waits its turn.
 */
export function enqueueSubmission(
  queue: SubmissionQueue,
  fields: SentFields,
  fetcherIdle: boolean,
): { queue: SubmissionQueue; post: SentFields | null } {
  if (queue.inFlight || !fetcherIdle) {
    return {
      queue: { inFlight: queue.inFlight, waiting: [...queue.waiting, fields] },
      post: null,
    };
  }
  return { queue: { inFlight: fields, waiting: queue.waiting }, post: fields };
}

/** A `fetcher.Form` is posting `fields` itself. */
export function trackSubmission(
  queue: SubmissionQueue,
  fields: SentFields,
): SubmissionQueue {
  return { inFlight: fields, waiting: queue.waiting };
}

/**
 * The fetcher settled: `finished` is the submission to report (null when
 * the request was not made through the queue), `post` the next one.
 */
export function settleSubmission(queue: SubmissionQueue): {
  queue: SubmissionQueue;
  finished: SentFields | null;
  post: SentFields | null;
} {
  const [next = null, ...rest] = queue.waiting;
  return {
    queue: next ? { inFlight: next, waiting: rest } : EMPTY_QUEUE,
    finished: queue.inFlight,
    post: next,
  };
}

/** Cases with a submission in flight or waiting. */
export function queuedCaseIds(queue: SubmissionQueue): Set<string> {
  const ids = new Set<string>();
  for (const fields of [queue.inFlight, ...queue.waiting]) {
    if (fields?.caseId) ids.add(fields.caseId);
  }
  return ids;
}

export type CommissionAction = {
  fetcher: FetcherWithComponents<CommissionResult>;
  /**
   * Posts `fields` (plus the CSRF token) to the route, or queues them until
   * the submission in flight has settled.
   */
  submit: (fields: SentFields) => void;
  /** Records the fields a `fetcher.Form` is about to post. */
  track: (fields: SentFields) => void;
  /** A submission is in flight or waiting. */
  busy: boolean;
  /** The fields in flight. */
  sent: SentFields | null;
  /** Cases with a submission in flight or waiting. */
  pendingCaseIds: ReadonlySet<string>;
};

export function useCommissionAction(
  action: string,
  onResult: (data: CommissionResult, sent: SentFields) => void,
): CommissionAction {
  const fetcher = useFetcher<CommissionResult>();
  const { csrfToken } = useStudioSession();
  const revalidator = useRevalidator();
  // The ref is what the handlers read; the state renders it.
  const queue = useRef<SubmissionQueue>(EMPTY_QUEUE);
  const [shown, setShown] = useState<SubmissionQueue>(EMPTY_QUEUE);
  const latest = useRef({ fetcher, csrfToken });
  latest.current = { fetcher, csrfToken };

  const apply = useCallback(
    (next: SubmissionQueue, post: SentFields | null) => {
      queue.current = next;
      setShown(next);
      if (!post) return;
      const { fetcher: current, csrfToken: token } = latest.current;
      void current.submit(
        { csrfToken: token, ...post },
        { method: "post", action },
      );
    },
    [action],
  );

  useFetcherSettled(fetcher, {
    onSettled: (data) => {
      const { queue: next, finished, post } = settleSubmission(queue.current);
      apply(next, post);
      // Only submissions made through this hook are reported.
      if (!finished) return;
      const result = data ?? NO_ANSWER;
      if (!result.ok && STALE_PAGE_CODES.has(result.code)) {
        void revalidator.revalidate();
      }
      onResult(result, finished);
    },
  });

  const track = useCallback(
    (fields: SentFields) => apply(trackSubmission(queue.current, fields), null),
    [apply],
  );

  const submit = useCallback(
    (fields: SentFields) => {
      const step = enqueueSubmission(
        queue.current,
        fields,
        latest.current.fetcher.state === "idle",
      );
      apply(step.queue, step.post);
    },
    [apply],
  );

  const pendingCaseIds = useMemo(() => queuedCaseIds(shown), [shown]);
  const busy =
    shown.inFlight !== null ||
    shown.waiting.length > 0 ||
    fetcher.state !== "idle";
  return {
    fetcher,
    submit,
    track,
    busy,
    sent: shown.inFlight,
    pendingCaseIds,
  };
}
