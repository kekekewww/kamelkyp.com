import { type RefObject, useEffect } from "react";
import { canObserve, observe } from "./observe";
import { getMotionTier } from "./reduced-motion";
import {
  CAPS,
  DUR,
  EASE,
  MAX_STAGGER_CHILDREN,
  MAX_STAGGER_CHILDREN_LITE,
  STAGGER,
} from "./tokens";

/**
 * Text Reveal + Scroll Reveal (docs/motion-system.md §2.1, §2.2).
 *
 * Markup contract (no hook needed; <RevealRoot /> scans after each navigation):
 *   <h2 data-reveal="mask">…</h2>               heading mask reveal
 *   <div data-reveal="up">…</div>               block rise (24px)
 *   <p data-reveal="fade">…</p>                 opacity only
 *   <ul data-reveal-group><li data-reveal-item>  staggered rows (16px, ≤ 6)
 *   data-reveal-delay="0–4"                     extra delay × 60ms
 *
 * SSR markup is the visible end state. Only elements entirely below the fold at
 * scan time are armed (data-reveal-state="armed"); everything else is "done".
 */

type Variant = "up" | "fade" | "mask" | "item";

const PROCESSED = "data-reveal-state";

function variantOf(element: HTMLElement): Variant {
  if (element.hasAttribute("data-reveal-item")) return "item";
  const value = element.dataset.reveal;
  return value === "fade" || value === "mask" ? value : "up";
}

function keyframes(variant: Variant, lite: boolean): Keyframe[] {
  const scale = lite ? 0.5 : 1;
  if (variant === "fade") return [{ opacity: 0 }, { opacity: 1 }];
  if (variant === "mask") {
    const y = Math.min(CAPS.revealBlock, 24) * scale;
    return [
      {
        clipPath: "inset(0 0 100% 0)",
        transform: `translateY(${y}px)`,
        opacity: 0,
        offset: 0,
      },
      { opacity: 1, offset: 0.4 },
      { clipPath: "inset(0 0 0 0)", transform: "none", opacity: 1, offset: 1 },
    ];
  }
  const distance =
    (variant === "up" ? CAPS.revealBlock : CAPS.revealText) * scale;
  return [
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: "none" },
  ];
}

function run(element: HTMLElement, delay: number, lite: boolean) {
  if (typeof element.animate !== "function") {
    element.setAttribute(PROCESSED, "done");
    return;
  }
  element.style.willChange = "transform, opacity";
  const animation = element.animate(keyframes(variantOf(element), lite), {
    duration: lite ? DUR.d4 : DUR.d5,
    easing: EASE.outExpo,
    delay,
    fill: "backwards",
  });
  // Drop the armed CSS state immediately; the WAAPI backwards fill holds the start frame.
  element.setAttribute(PROCESSED, "done");
  animation.finished
    .catch(() => undefined)
    .finally(() => {
      element.style.willChange = "";
      animation.cancel();
    });
}

function extraDelay(element: HTMLElement): number {
  const value = Number(element.dataset.revealDelay ?? 0);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 4) * STAGGER : 0;
}

/**
 * Safety net for IntersectionObserver misses. IO only samples at rendering
 * updates, so a fast jump (End key, scrollbar drag, find-in-page, a starved
 * main thread) can carry an armed element past the viewport without an
 * `isIntersecting` entry, leaving it invisible. A passive, rAF-throttled
 * scroll sweep reveals any pending target that has reached the reveal line.
 */
const pending = new Map<Element, () => void>();
let sweepFrame = 0;

function sweep() {
  sweepFrame = 0;
  const line = window.innerHeight * 0.9;
  for (const [element, reveal] of Array.from(pending)) {
    if (element.getBoundingClientRect().top < line) reveal();
  }
  if (pending.size === 0) window.removeEventListener("scroll", onScroll);
}

function onScroll() {
  if (!sweepFrame) sweepFrame = requestAnimationFrame(sweep);
}

/** Call `onEnter` once when `element` reaches the reveal line (or was passed). */
function watch(element: Element, onEnter: () => void): () => void {
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    unobserve();
    pending.delete(element);
  };
  const enter = () => {
    if (!active) return;
    stop();
    onEnter();
  };
  const unobserve = observe(element, "reveal", (entry) => {
    if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) enter();
  });
  if (pending.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  pending.set(element, enter);
  return stop;
}

function arm(element: HTMLElement, delay: number, lite: boolean): () => void {
  element.setAttribute(PROCESSED, "armed");
  return watch(element, () => run(element, delay, lite));
}

/**
 * Scan `root` for unprocessed reveal targets and arm the ones below the fold.
 * Returns a cleanup that unobserves anything still pending.
 */
export function revealScan(root: Element | Document): () => void {
  if (typeof window === "undefined" || !canObserve()) return () => {};
  const tier = getMotionTier();
  const stops: Array<() => void> = [];

  const markDone = (element: Element) =>
    element.setAttribute(PROCESSED, "done");
  const belowFold = (element: Element) =>
    element.getBoundingClientRect().top >= window.innerHeight;

  const singles = root.querySelectorAll<HTMLElement>(
    `[data-reveal]:not([${PROCESSED}])`,
  );
  const groups = root.querySelectorAll<HTMLElement>(
    "[data-reveal-group]:not([data-reveal-group-scanned])",
  );

  if (tier === "static") {
    for (const element of singles) markDone(element);
    for (const group of groups) {
      group.setAttribute("data-reveal-group-scanned", "");
      for (const item of group.querySelectorAll("[data-reveal-item]")) {
        markDone(item);
      }
    }
    return () => {};
  }

  const lite = tier === "lite";
  const cap = lite ? MAX_STAGGER_CHILDREN_LITE : MAX_STAGGER_CHILDREN;

  for (const element of singles) {
    if (belowFold(element)) {
      stops.push(arm(element, extraDelay(element), lite));
    } else {
      markDone(element);
    }
  }

  for (const group of groups) {
    group.setAttribute("data-reveal-group-scanned", "");
    const items = Array.from(
      group.querySelectorAll<HTMLElement>(
        `[data-reveal-item]:not([${PROCESSED}])`,
      ),
    );
    if (!belowFold(group)) {
      for (const item of items) markDone(item);
      continue;
    }
    for (const item of items) item.setAttribute(PROCESSED, "armed");
    const stop = watch(group, () => {
      items.forEach((item, index) => {
        const staggerIndex = Math.min(index, cap - 1);
        const inView = item.getBoundingClientRect().top < window.innerHeight;
        if (inView) {
          run(item, staggerIndex * STAGGER, lite);
        } else {
          // Rows entering later reveal individually, without stagger.
          stops.push(arm(item, 0, lite));
        }
      });
    });
    stops.push(stop);
  }

  return () => {
    for (const stop of stops) stop();
    // Anything still armed must not stay hidden once its observer is gone.
    for (const element of root.querySelectorAll(`[${PROCESSED}="armed"]`)) {
      markDone(element);
    }
  };
}

export interface RevealOptions {
  variant?: "up" | "fade" | "mask";
  delay?: 0 | 1 | 2 | 3 | 4;
  group?: boolean;
}

/**
 * Programmatic form of the data-attribute contract. No-op on the server.
 * Sets the attributes on the element, then scans it.
 */
export function useReveal(
  ref: RefObject<HTMLElement | null>,
  { variant = "up", delay, group = false }: RevealOptions = {},
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (group) {
      element.setAttribute("data-reveal-group", "");
    } else {
      element.dataset.reveal = variant;
      if (delay !== undefined) element.dataset.revealDelay = String(delay);
    }
    return revealScan(element.parentElement ?? element);
  }, [ref, variant, delay, group]);
}
