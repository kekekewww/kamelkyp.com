/**
 * The retired admin URLs (admin-architecture §2.3, wp5 §4.4). WIRED: every
 * former admin path in `app/routes.ts` resolves to this resource route.
 *
 * The owner check runs first (no owner: 403 from `withOwner`, the body
 * drained, nothing read from D1, never a redirect). GET/HEAD (and OPTIONS,
 * which React Router runs as a loader) answer 301 to the Studio equivalent;
 * POST/PUT/PATCH/DELETE answer 410 Gone, so a stale form is never replayed
 * into a Studio endpoint. Nothing changes, so there is no CSRF check: a
 * stale form with an expired token still gets its 410. Both answers are
 * `no-store` (a cached permanent redirect would outlive a rollback) and
 * noindex. The Worker's `requiresNoStore()` covers every casing of `/admin`;
 * this module sets the headers itself as well, so they never depend on it.
 */
import { discardRequestBody, withOwner } from "../lib/cms/studio/auth.server";
import {
  type LegacyEntryRow,
  legacyEntryTarget,
  legacyVersionId,
  staticLegacyAdminTarget,
} from "../lib/cms/studio/legacy-admin";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

// `legacy_source` is UNIQUE on both tables, so each sub-select is one row.
const LOOKUP_SQL = `SELECT e.kind, e.slug,
    (SELECT p.id FROM projects p WHERE p.legacy_source = 'content_entries:' || e.id) AS project_id,
    (SELECT w.id FROM writings w WHERE w.legacy_source = 'content_entries:' || e.id) AS writing_id
  FROM content_versions v JOIN content_entries e ON e.id = v.entry_id
  WHERE v.id = ?`;

/** Studio path for a retired admin URL; never throws. */
export async function legacyAdminTarget(
  db: D1Database,
  url: URL,
): Promise<string> {
  const versionId = legacyVersionId(url.pathname);
  if (versionId === undefined) return staticLegacyAdminTarget(url) ?? "/studio";
  if (versionId === null) return "/studio";
  try {
    return legacyEntryTarget(
      await db.prepare(LOOKUP_SQL).bind(versionId).first<LegacyEntryRow>(),
    );
  } catch {
    // For example once a later migration drops the legacy tables. The log
    // carries neither the id nor the URL.
    console.warn("legacy_admin_lookup_failed");
    return "/studio";
  }
}

export const loader = withOwner(
  async ({ db, request }) =>
    new Response(null, {
      status: 301,
      headers: {
        Location: await legacyAdminTarget(db, new URL(request.url)),
        ...HEADERS,
      },
    }),
);

export const action = withOwner(async ({ request }) => {
  await discardRequestBody(request);
  return new Response("Gone", { status: 410, headers: HEADERS });
});
