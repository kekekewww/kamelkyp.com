import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

type ProgressState = "idle" | "loading" | "done";

/**
 * 1px hairline under the header while a navigation takes longer than 150ms
 * (docs/motion-system.md §2.6). State lives in `data-state`; motion.css owns
 * the animation. Never a full-screen loader.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [state, setState] = useState<ProgressState>("idle");

  useEffect(() => {
    if (busy) {
      const timer = window.setTimeout(() => setState("loading"), 150);
      return () => window.clearTimeout(timer);
    }
    setState((current) => (current === "loading" ? "done" : "idle"));
    return undefined;
  }, [busy]);

  useEffect(() => {
    if (state !== "done") return;
    const timer = window.setTimeout(() => setState("idle"), 240);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <span className="nav-progress" aria-hidden="true" data-state={state} />
  );
}
