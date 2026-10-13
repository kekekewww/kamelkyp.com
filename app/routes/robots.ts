import type { LoaderFunctionArgs } from "react-router";
import { cloudflareContext } from "../lib/cloudflare/context";
import { isIndexableRequest, siteOrigin } from "../lib/seo/origin.server";
import { buildRobotsTxt } from "../lib/seo/robots";

/**
 * GET /robots.txt (WP4 §4.9): the private surfaces and the sitemap on the
 * production origin, `Disallow: /` everywhere else. Never touches D1 and sets
 * no Cache-Control (R9).
 */
export function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const body = buildRobotsTxt({
    indexable: isIndexableRequest(env, request.url),
    origin: siteOrigin(env, request.url),
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
