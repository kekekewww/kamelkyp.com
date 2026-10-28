/**
 * Origin and deployment rules for search and sharing (WP4 §4.2). The
 * production deployment is the Worker whose APP_ORIGIN is the production
 * origin; only its requests on that origin are indexable. Everything else
 * (PR previews, loopback, dev, the production Worker on *.workers.dev) is
 * noindex through `X-Robots-Tag` and robots.txt.
 */
import type { Env } from "../env.server";
import type { DeploymentMode } from "../security/headers.server";

export const PRODUCTION_ORIGIN = "https://kamelkyp.com";

/** HSTS and indexing follow the configured origin (single source). */
export function deploymentMode(env: Pick<Env, "APP_ORIGIN">): DeploymentMode {
  return env.APP_ORIGIN === PRODUCTION_ORIGIN ? "production" : "preview";
}

function httpOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Absolute origin for canonical, hreflang, og:url, og:image and the sitemap:
 * APP_ORIGIN when it parses as http(s), else the request's origin (local
 * `react-router dev` without vars). Never a trailing slash.
 */
export function siteOrigin(
  env: Pick<Env, "APP_ORIGIN">,
  requestUrl: string | URL,
): string {
  return httpOrigin(env.APP_ORIGIN) ?? new URL(requestUrl).origin;
}

/**
 * True only for the production deployment answering on its own origin. A
 * preview, the loopback, dev, or the production Worker reached on a
 * duplicate host (workers.dev) are all not indexable.
 */
export function isIndexableRequest(
  env: Pick<Env, "APP_ORIGIN">,
  requestUrl: string | URL,
): boolean {
  return (
    env.APP_ORIGIN === PRODUCTION_ORIGIN &&
    new URL(requestUrl).origin === PRODUCTION_ORIGIN
  );
}
