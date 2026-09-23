import { type LoaderFunctionArgs, redirect } from "react-router";
import { legacyWritingTarget } from "../../lib/i18n/path";

/**
 * Legacy `/:lang/other` and `/:lang/other/:slug` → 301 to `/:lang/writing…`,
 * preserving locale, slug and query string (IA §1). Renders no UI.
 */
export function loader({ request }: Pick<LoaderFunctionArgs, "request">) {
  const url = new URL(request.url);
  const target = legacyWritingTarget(url.pathname, url.search);
  if (!target) throw new Response("Not Found", { status: 404 });
  return redirect(target, 301);
}
