/**
 * Motion tokens (docs/motion-system.md §1). Mirrors the `--dur-*`, `--stagger*`
 * and `--ease-*` custom properties in app/styles/tokens.css; a unit test keeps
 * the two in sync. Pure constants: safe to import anywhere, including SSR.
 */

export const DUR = { d1: 120, d2: 200, d3: 320, d4: 480, d5: 720 } as const;

export const STAGGER = 60;
export const STAGGER_LINE = 80;

export const EASE = {
  outQuart: "cubic-bezier(0.25, 1, 0.5, 1)",
  outExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
  weighted: "cubic-bezier(0.33, 0, 0.13, 1)",
  inOutQuint: "cubic-bezier(0.83, 0, 0.17, 1)",
  inQuart: "cubic-bezier(0.5, 0, 0.75, 0)",
  linear: "linear",
} as const;

/** JS easing functions for rAF / canvas lerps (t in [0, 1]). */
export const EASE_FN = {
  linear: (t: number) => t,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inQuart: (t: number) => t ** 4,
  inOutQuint: (t: number) =>
    t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2,
} as const;

/** Distance caps (px unless noted). */
export const CAPS = {
  revealBlock: 24,
  revealText: 16,
  filter: 8,
  parallax: 0.06,
  parallaxMaxPx: 48,
  magneticPx: 6,
  magneticLabelPx: 2,
  rowShift: 8,
} as const;

export const MAX_STAGGER_CHILDREN = 6;
export const MAX_STAGGER_CHILDREN_LITE = 4;
export const PAGE_TRANSITION_MAX = 480;

/**
 * Frame-rate-independent lerp factor: `perFrame` is the factor at 60fps,
 * `dtMs` the elapsed time since the last frame.
 */
export function lerpFactor(perFrame: number, dtMs: number): number {
  return 1 - (1 - perFrame) ** (dtMs / 16.667);
}
