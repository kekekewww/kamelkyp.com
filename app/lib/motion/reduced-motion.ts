import { useEffect, useSyncExternalStore } from "react";

/**
 * Reduced-motion and motion-tier detection (docs/motion-system.md §2.0).
 * SSR-safe: nothing touches window/matchMedia at import time; the server
 * snapshot is the safe state (reduced = true, tier = "static").
 */

export type MotionTier = "static" | "lite" | "full";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const TIER_QUERIES = [
  REDUCED_QUERY,
  "(hover: none)",
  "(pointer: coarse)",
  "(max-width: 1023.98px)",
] as const;

function canMatchMedia(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

export function getReducedMotionSnapshot(): boolean {
  return canMatchMedia() ? window.matchMedia(REDUCED_QUERY).matches : true;
}

export function getServerSnapshot(): true {
  return true;
}

export function subscribeReducedMotion(callback: () => void): () => void {
  if (!canMatchMedia()) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** `true` on the server and whenever the visitor prefers reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot,
  );
}

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** First match wins: static → lite → full. */
export function getMotionTier(): MotionTier {
  if (!canMatchMedia()) return "static";
  if (window.matchMedia(REDUCED_QUERY).matches) return "static";

  const nav = navigator as Navigator & NavigatorHints;
  const lite =
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth < 1024 ||
    nav.connection?.saveData === true ||
    (typeof nav.hardwareConcurrency === "number" &&
      nav.hardwareConcurrency <= 4) ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4);

  return lite ? "lite" : "full";
}

export function subscribeMotionTier(callback: () => void): () => void {
  if (!canMatchMedia()) return () => {};
  const queries = TIER_QUERIES.map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", callback);
  return () => {
    for (const query of queries) query.removeEventListener("change", callback);
  };
}

function getServerTier(): MotionTier {
  return "static";
}

export function useMotionTier(): MotionTier {
  return useSyncExternalStore(
    subscribeMotionTier,
    getMotionTier,
    getServerTier,
  );
}

/**
 * Mount once (root.tsx). Writes `document.documentElement.dataset.motion`
 * after hydration so CSS can key off `:root[data-motion]`. Renders nothing.
 */
export function MotionTierSync(): null {
  const tier = useMotionTier();

  useEffect(() => {
    document.documentElement.dataset.motion = tier;
  }, [tier]);

  return null;
}
