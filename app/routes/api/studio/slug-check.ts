/**
 * `GET /api/studio/slug-check?type&slug&id` → `{ available, conflict? }`
 * (admin-architecture §4.11). Read-only.
 */
import { checkSlug } from "../../../lib/cms/db/lifecycle.server";
import { withOwner } from "../../../lib/cms/studio/auth.server";
import { jsonError, jsonOk } from "../../../lib/cms/studio/responses";
import type { SluggedEntityType } from "../../../lib/cms/types";

const TYPES = new Set<SluggedEntityType>(["project", "writing", "service"]);

export const loader = withOwner(async ({ request, db }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as SluggedEntityType | null;
  const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  const id = url.searchParams.get("id") || undefined;
  if (!type || !TYPES.has(type) || !slug || slug.length > 96) {
    return jsonError("invalid_request", 400);
  }
  return jsonOk(await checkSlug(db, type, slug, id));
});
