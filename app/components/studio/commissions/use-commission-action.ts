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
 */
import { useCallback, useRef, useState } from "react";
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

export type CommissionAction = {
  fetcher: FetcherWithComponents<CommissionResult>;
  /** Posts `fields` (plus the CSRF token) to the route. */
  submit: (fields: SentFields) => void;
  /** Records the fields a `fetcher.Form` is about to post. */
  track: (fields: SentFields) => void;
  busy: boolean;
  /** The fields in flight, while busy. */
  sent: SentFields | null;
};

export function useCommissionAction(
  action: string,
  onResult: (data: CommissionResult, sent: SentFields) => void,
): CommissionAction {
  const fetcher = useFetcher<CommissionResult>();
  const { csrfToken } = useStudioSession();
  const revalidator = useRevalidator();
  const pending = useRef<SentFields | null>(null);
  const [sent, setSent] = useState<SentFields | null>(null);

  useFetcherSettled(fetcher, {
    onSettled: (data) => {
      const fields = pending.current;
      // Only submissions made through this hook are reported.
      if (!fields) return;
      pending.current = null;
      setSent(null);
      const result = data ?? NO_ANSWER;
      if (!result.ok && STALE_PAGE_CODES.has(result.code)) {
        void revalidator.revalidate();
      }
      onResult(result, fields);
    },
  });

  const track = useCallback((fields: SentFields) => {
    pending.current = fields;
    setSent(fields);
  }, []);

  const submit = useCallback(
    (fields: SentFields) => {
      track(fields);
      void fetcher.submit({ csrfToken, ...fields }, { method: "post", action });
    },
    [fetcher, csrfToken, action, track],
  );

  const busy = fetcher.state !== "idle";
  return { fetcher, submit, track, busy, sent: busy ? sent : null };
}
