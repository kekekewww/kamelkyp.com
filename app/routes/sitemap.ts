import type { LoaderFunctionArgs } from "react-router";
import { cloudflareContext } from "../lib/cloudflare/context";
import { listSitemapEntries } from "../lib/cms/public/sitemap.server";
import { siteOrigin } from "../lib/seo/origin.server";
import { buildSitemapXml, type SitemapEntry } from "../lib/seo/sitemap";

/**
 * GET /sitemap.xml (WP4 §4.9): published, listed public pages on the
 * configured origin. Previews serve it too (robots.txt and X-Robots-Tag keep
 * them out of search). A failed D1 read is a 503, never a partial sitemap;
 * success sets no Cache-Control (R9).
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  let entries: SitemapEntry[];
  try {
    entries = await listSitemapEntries(env.DB);
  } catch {
    console.warn("sitemap_unavailable");
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "3600",
      },
    });
  }
  return new Response(buildSitemapXml(entries, siteOrigin(env, request.url)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
