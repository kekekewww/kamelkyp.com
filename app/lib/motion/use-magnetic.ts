import { type RefObject, useEffect } from "react";
import { loop } from "./frame";
import { getMotionTier } from "./reduced-motion";
import { CAPS, DUR, EASE, lerpFactor } from "./tokens";

/**
 * Magnetic pull (docs/motion-system.md §2.5). Allowed targets ONLY: header CTA,
 * home hero / pricing / contact-band primary CTAs, software "Email me", and the
 * four desktop primary nav links. Tier "full" + fine mouse pointer only.
 *
 * The pointer listener lives on the nearest `[data-magnetic-scope]` ancestor
 * (the header, a CTA band), falling back to the parent element. An optional
 * inner `[data-magnetic-label]` moves an extra ≤ 2px. Writes transform via the
 * CSSOM; never on focus.
 */
export function useMagnetic(
  ref: RefObject<HTMLElement | null>,
  { radius = 48, strength = 0.25 }: { radius?: number; strength?: number } = {},
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;
    if (getMotionTier() !== "full") return;
    if (!window.matchMedia("(pointer: fine) and (hover: hover)").matches) {
      return;
    }

    const scope =
      element.closest<HTMLElement>("[data-magnetic-scope]") ??
      element.parentElement;
    if (!scope) return;
    const label = element.querySelector<HTMLElement>("[data-magnetic-label]");

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let stopLoop: (() => void) | null = null;

    const apply = () => {
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (label) {
        label.style.transform = `translate3d(${x * 0.35}px, ${y * 0.35}px, 0)`;
      }
    };

    const release = () => {
      stopLoop?.();
      stopLoop = null;
      targetX = 0;
      targetY = 0;
      const from = `translate3d(${x}px, ${y}px, 0)`;
      x = 0;
      y = 0;
      element.style.transform = "";
      if (label) label.style.transform = "";
      if (
        typeof element.animate === "function" &&
        from !== "translate3d(0px, 0px, 0)"
      ) {
        element.animate([{ transform: from }, { transform: "none" }], {
          duration: DUR.d3,
          easing: EASE.weighted,
        });
      }
    };

    const startLoop = () => {
      if (stopLoop) return;
      stopLoop = loop((_now, dt) => {
        const k = lerpFactor(0.2, dt);
        x += (targetX - x) * k;
        y += (targetY - y) * k;
        apply();
        if (Math.abs(targetX - x) < 0.25 && Math.abs(targetY - y) < 0.25) {
          stopLoop = null;
          return false;
        }
        return undefined;
      });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = element.getBoundingClientRect();
      const within =
        event.clientX > rect.left - radius &&
        event.clientX < rect.right + radius &&
        event.clientY > rect.top - radius &&
        event.clientY < rect.bottom + radius;
      if (!within) {
        if (x !== 0 || y !== 0 || stopLoop) release();
        return;
      }
      const cap = CAPS.magneticPx;
      // rect includes the current offset; subtract it to get the resting centre.
      const cx = rect.left + rect.width / 2 - x;
      const cy = rect.top + rect.height / 2 - y;
      targetX = Math.max(-cap, Math.min(cap, (event.clientX - cx) * strength));
      targetY = Math.max(-cap, Math.min(cap, (event.clientY - cy) * strength));
      startLoop();
    };

    scope.addEventListener("pointermove", onMove, { passive: true });
    scope.addEventListener("pointerleave", release, { passive: true });
    return () => {
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", release);
      stopLoop?.();
      element.style.transform = "";
      if (label) label.style.transform = "";
    };
  }, [ref, radius, strength]);
}
