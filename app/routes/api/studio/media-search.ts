/**
 * `GET /api/studio/media-search?q&kind&cursor` → `{ items, next }`: ready,
 * non-archived assets for the media picker, as `MediaSummary` (admin §2.2).
 */
import { searchAssets } from "../../../lib/cms/media/assets.server";
import { readMediaConfig } from "../../../lib/cms/media/config.server";
import { toMediaSummary } from "../../../lib/cms/media/summary";
import {
  MEDIA_KINDS,
  type MediaKind,
} from "../../../lib/cms/schemas/media-asset";
import { withOwner } from "../../../lib/cms/studio/auth.server";
import { jsonError, jsonOk } from "../../../lib/cms/studio/responses";

export const loader = withOwner(async ({ request, db, env }) => {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  if (kindParam && !(MEDIA_KINDS as readonly string[]).includes(kindParam)) {
    return jsonError("invalid_request", 400);
  }
  const limit = Number(url.searchParams.get("limit") ?? 24);
  const result = await searchAssets(db, {
    text: url.searchParams.get("q")?.slice(0, 200) ?? undefined,
    kind: (kindParam as MediaKind | null) ?? undefined,
    limit: Number.isFinite(limit) ? limit : 24,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  const config = readMediaConfig(env);
  return jsonOk({
    items: result.items.map((asset) => toMediaSummary(asset, config)),
    next: result.next,
  });
});
