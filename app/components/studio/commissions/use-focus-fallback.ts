/**
 * Focus never falls back to `<body>` (wp1 §4.10): when a result removes the
 * control that had focus (a row leaving a filtered list, a queue item that
 * is done or stale), focus moves to the section heading instead.
 *
 * A success arrives together with React Router's revalidation, so the page
 * already shows the new list one frame later. A stale-page code only asks
 * for a reload (`useCommissionAction` revalidates explicitly): the focused
 * control disappears when that reload commits, which the next loader data
 * marks.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  type CommissionResult,
  STALE_PAGE_CODES,
} from "./use-commission-action";

type FocusFallback = "now" | "after-reload";

/** When a finished action can have removed the focused control. */
export function focusFallbackAfter(
  result: CommissionResult,
): FocusFallback | null {
  if (result.ok) return "now";
  return STALE_PAGE_CODES.has(result.code) ? "after-reload" : null;
}

/**
 * Returns the function to call with each finished result. `data` is the
 * route's loader data: a new value means a reload has committed.
 */
export function useFocusFallback(
  data: unknown,
  target: React.RefObject<HTMLElement | null>,
): (result: CommissionResult) => void {
  const awaitingReload = useRef(false);
  const seen = useRef(data);

  const rescue = useCallback(() => {
    const active = document.activeElement;
    if (!active || active === document.body) target.current?.focus();
  }, [target]);

  useEffect(() => {
    if (seen.current === data) return;
    seen.current = data;
    if (!awaitingReload.current) return;
    awaitingReload.current = false;
    rescue();
  }, [data, rescue]);

  return useCallback(
    (result: CommissionResult) => {
      const when = focusFallbackAfter(result);
      if (when === "after-reload") awaitingReload.current = true;
      else if (when === "now") window.requestAnimationFrame(rescue);
    },
    [rescue],
  );
}
