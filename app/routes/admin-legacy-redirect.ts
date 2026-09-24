/**
 * `/admin` and `/admin/*` after the Studio port (admin-architecture §2.3).
 * CREATED, NOT WIRED: the integration package points `app/routes.ts` here once
 * every legacy panel exists in `/studio`.
 *
 * The owner check runs first (an unauthenticated request gets 403, never a
 * redirect); GET/HEAD answer 301 to the Studio equivalent; any other method
 * answers 410 Gone so stale forms are never replayed into new endpoints.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { cloudflareContext } from "../lib/cloudflare/context";
import { requireOwner } from "../lib/cms/studio/auth.server";

const STATIC_TARGETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/admin\/?$/, "/studio"],
  [/^\/admin\/content\/?$/, "/studio"],
  [/^\/admin\/works\/?$/, "/studio/projects"],
  [/^\/admin\/posts\/?$/, "/studio/writing"],
  [/^\/admin\/services\/?$/, "/studio/services/pricing"],
  [/^\/admin\/terms\/?$/, "/studio/services/terms"],
  [/^\/admin\/links\/?$/, "/studio/settings/footer"],
  [
    /^\/admin\/cases(\/(status|student-discount|cleanup))?\/?$/,
    "/studio/commissions",
  ],
];

const VERSION_PATH =
  /^\/admin\/(?:content\/([^/]+)\/(?:edit|preview)|posts\/([^/]+)\/edit)\/?$/;

/** Studio path for a legacy admin URL (version ids resolve through D1). */
export async function legacyAdminTarget(
  db: D1Database,
  url: URL,
): Promise<string> {
  const pathname = url.pathname;
  const version = VERSION_PATH.exec(pathname);
  if (version) {
    const versionId = version[1] ?? version[2] ?? "";
    const row = await db
      .prepare(
        `SELECT e.id, e.kind, e.slug FROM content_versions v
         JOIN content_entries e ON e.id = v.entry_id WHERE v.id = ?`,
      )
      .bind(versionId)
      .first<{ id: string; kind: string; slug: string }>();
    if (row?.kind === "work")
      return `/studio/projects/${encodeURIComponent(row.id)}`;
    if (row?.kind === "post")
      return `/studio/writing/${encodeURIComponent(row.id)}`;
    if (row?.kind === "page" && row.slug === "home") return "/studio/homepage";
    return "/studio";
  }
  for (const [pattern, target] of STATIC_TARGETS) {
    if (pattern.test(pathname)) {
      return target === "/studio/commissions" && url.search
        ? `${target}${url.search}`
        : target;
    }
  }
  return "/studio";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireOwner(request, env);
  const target = await legacyAdminTarget(env.DB, new URL(request.url));
  return new Response(null, {
    status: 301,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireOwner(request, env);
  return new Response("Gone", {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
