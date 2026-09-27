/**
 * Shared IntersectionObserver registry (docs/motion-system.md §2.0): one
 * observer per option set, not one per element. Lazy and SSR-safe; a no-op
 * when IntersectionObserver is unavailable.
 */

type Callback = (entry: IntersectionObserverEntry) => void;

interface Registry {
  observer: IntersectionObserver;
  callbacks: Map<Element, Callback>;
}

const registries = new Map<string, Registry>();

export const OBSERVE_OPTIONS = {
  reveal: { rootMargin: "0px 0px -10% 0px", threshold: 0 },
  parallax: { rootMargin: "20% 0px", threshold: 0 },
  canvas: { rootMargin: "0px", threshold: 0 },
} as const satisfies Record<string, IntersectionObserverInit>;

export type ObserveKey = keyof typeof OBSERVE_OPTIONS;

function getRegistry(key: ObserveKey): Registry | null {
  if (typeof IntersectionObserver === "undefined") return null;
  const existing = registries.get(key);
  if (existing) return existing;

  const callbacks = new Map<Element, Callback>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry);
  }, OBSERVE_OPTIONS[key]);
  const registry = { observer, callbacks };
  registries.set(key, registry);
  return registry;
}

/** Observe `element`; returns an unobserve function. */
export function observe(
  element: Element,
  key: ObserveKey,
  callback: Callback,
): () => void {
  const registry = getRegistry(key);
  if (!registry) return () => {};
  registry.callbacks.set(element, callback);
  registry.observer.observe(element);
  return () => {
    registry.callbacks.delete(element);
    registry.observer.unobserve(element);
  };
}

export function canObserve(): boolean {
  return typeof IntersectionObserver !== "undefined";
}
