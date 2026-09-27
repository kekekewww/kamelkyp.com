/**
 * STUB (P5 Preview layout): will render the real public shell plus the fixed
 * "PREVIEW · NOT PUBLISHED" bar. Guarded by the /studio middleware and
 * `withOwner`; responses carry `no-store`, `X-Robots-Tag` and the
 * `frame-ancestors 'self'` CSP variant (headers.server.ts).
 */
import { Outlet } from "react-router";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PreviewLayoutRoute() {
  return <Outlet />;
}
