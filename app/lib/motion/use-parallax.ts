import { type RefObject, useEffect } from "react";
import { scheduleRead, scheduleWrite } from "./frame";
import { observe } from "./observe";
import { getMotionTier } from "./reduced-motion";
import { CAPS } from "./tokens";

/**
 * Project media parallax, JS fallback (docs/motion-system.md §2.3).
 *
 * Markup: <figure class="parallax" ref={frameRef}><img class="parallax__media" …/></figure>
 * CSS scroll-driven animation handles supporting browsers (motion.css); this
 * hook only runs when `animation-timeline: view()` is unsupported, tier is
 * "full" and the viewport is ≥ 1024px with a hover pointer. Writes the inner
 * media transform through the CSSOM (CSP-safe). Max 2 per viewport.
 */
export function useParallax(
  frameRef: RefObject<HTMLElement | null>,
  strength: number = CAPS.parallax,
): void {
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof window === "undefined") return;
    if (getMotionTier() !== "full") return;
    if (!window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) {
      return;
    }
    if (
      typeof CSS !== "undefined" &&
      CSS.supports("animation-timeline: view()")
    ) {
      return;
    }
    const media = frame.querySelector<HTMLElement>(".parallax__media");
    if (!media) return;

    let active = false;
    let pending = false;

    const update = () => {
      pending = false;
      if (!active) return;
      scheduleRead(() => {
        const rect = frame.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const progress = Math.max(
          -1,
          Math.min(
            1,
            (viewportH / 2 - (rect.top + rect.height / 2)) /
              (viewportH / 2 + rect.height / 2),
          ),
        );
        const offset = Math.max(
          -CAPS.parallaxMaxPx,
          Math.min(CAPS.parallaxMaxPx, -progress * strength * rect.height),
        );
        const rounded = Math.round(offset * 2) / 2;
        scheduleWrite(() => {
          media.style.transform = `translate3d(0, ${rounded}px, 0) scale(1.12)`;
        });
      });
    };

    const onScroll = () => {
      if (pending || !active) return;
      pending = true;
      update();
    };

    const stop = observe(frame, "parallax", (entry) => {
      active = entry.isIntersecting;
      media.style.willChange = active ? "transform" : "";
      if (active) update();
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stop();
      window.removeEventListener("scroll", onScroll);
      media.style.transform = "";
      media.style.willChange = "";
    };
  }, [frameRef, strength]);
}
