import { useViewTransitionState } from "react-router";
import { useReducedMotion } from "./reduced-motion";

/**
 * Route-level view transitions (docs/motion-system.md §2.6).
 *
 * Contract:
 *   - Links that should animate use React Router's `viewTransition` prop:
 *       <Link to={href} viewTransition data-vt={useVtFlag(href)}>…</Link>
 *   - `data-vt="active"` is set ONLY on the item being navigated, so the
 *     named elements inside it (`.project-row__title` → `vt-project-title`,
 *     `.project-row__cover` → `vt-project-cover`) are unique (motion.css).
 *   - Detail pages carry the names statically via `.project-hero__title` and
 *     `.project-hero__cover`.
 *   - Never use style={{ viewTransitionName }} (CSP blocks SSR style attributes).
 *
 * Returns undefined on the server, when not transitioning, and under reduced
 * motion (named morphs are off; the root cross-fade stays).
 */
export function useVtFlag(href: string): "active" | undefined {
  const transitioning = useViewTransitionState(href);
  const reduced = useReducedMotion();
  return transitioning && !reduced ? "active" : undefined;
}
