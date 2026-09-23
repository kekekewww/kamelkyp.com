import { useEffect } from "react";
import { useLocation } from "react-router";
import { revealScan } from "../../lib/motion/use-reveal";

/**
 * Mounted once in root.tsx. After hydration and after every client
 * navigation, scans the document for `[data-reveal]` / `[data-reveal-group]`
 * so route components need no hook. Renders nothing.
 */
export function RevealRoot(): null {
  const location = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: rescan on every navigation commit
  useEffect(() => {
    return revealScan(document.body);
  }, [location.key]);

  return null;
}
