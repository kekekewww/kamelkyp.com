/**
 * One-off projects actions (feature, reorder, archive, …) through their own
 * fetcher, so they never touch an editor's save state. The CSRF token is
 * added here; `onResult` runs once per completed submission with the fields
 * that were sent (toasts, undo, resets).
 */
import { useCallback, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useStudioSession } from "../ui";
import type { ProjectActionData } from "./types";

export type SentFields = Record<string, string>;

export function useProjectSubmit(
  onResult: (data: ProjectActionData, sent: SentFields) => void,
) {
  const fetcher = useFetcher<ProjectActionData>();
  const { csrfToken } = useStudioSession();
  const sent = useRef<SentFields | null>(null);
  const handler = useRef(onResult);
  handler.current = onResult;
  const previous = useRef(fetcher.state);

  useEffect(() => {
    const finished = previous.current !== "idle" && fetcher.state === "idle";
    previous.current = fetcher.state;
    if (!finished || !sent.current) return;
    const fields = sent.current;
    sent.current = null;
    handler.current(
      fetcher.data ?? {
        ok: false,
        message: "The Studio did not answer. Check the connection and retry.",
      },
      fields,
    );
  }, [fetcher.state, fetcher.data]);

  const submit = useCallback(
    (fields: SentFields) => {
      sent.current = fields;
      void fetcher.submit({ csrfToken, ...fields }, { method: "post" });
    },
    [fetcher, csrfToken],
  );

  return { submit, busy: fetcher.state !== "idle" };
}
