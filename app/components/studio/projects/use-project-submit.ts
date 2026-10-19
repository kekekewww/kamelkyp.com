/**
 * One-off projects actions (feature, reorder, archive, …) through their own
 * fetcher, so they never touch an editor's save state. The CSRF token is
 * added here; `onResult` runs once per completed submission with the fields
 * that were sent (toasts, undo, resets).
 */
import { useCallback, useRef } from "react";
import { useFetcher } from "react-router";
import { useFetcherSettled, useStudioSession } from "../ui";
import type { ProjectActionData } from "./types";

export type SentFields = Record<string, string>;

export function useProjectSubmit(
  onResult: (data: ProjectActionData, sent: SentFields) => void,
) {
  const fetcher = useFetcher<ProjectActionData>();
  const { csrfToken } = useStudioSession();
  const sent = useRef<SentFields | null>(null);

  // Router state updates are transitions: when rendering is slow, React can
  // skip the "submitting"/"loading" renders and go straight from idle to idle
  // with new data. `useFetcherSettled` counts fresh data as finished too.
  useFetcherSettled(fetcher, {
    onSettled: (data) => {
      const fields = sent.current;
      if (!fields) return;
      sent.current = null;
      onResult(
        data ?? {
          ok: false,
          message: "The Studio did not answer. Check the connection and retry.",
        },
        fields,
      );
    },
  });

  const submit = useCallback(
    (fields: SentFields) => {
      sent.current = fields;
      void fetcher.submit({ csrfToken, ...fields }, { method: "post" });
    },
    [fetcher, csrfToken],
  );

  return { submit, busy: fetcher.state !== "idle" };
}
