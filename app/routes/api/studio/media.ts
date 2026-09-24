/**
 * `POST /api/studio/media` — declare an upload → `{ assetId, uploadUrl }`.
 *
 * STUB owned by the foundation, handed to P2 (uploads). Guarded now; answers
 * 503 `uploads_not_configured` without the R2 binding and base URL, and 501
 * until the upload pipeline lands.
 */
import { readMediaConfig } from "../../../lib/cms/media/config.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import { jsonError } from "../../../lib/cms/studio/responses";

export const action = withOwnerMutation(async ({ env }) => {
  if (!readMediaConfig(env).uploadsEnabled) {
    return jsonError("uploads_not_configured", 503);
  }
  return jsonError("not_built", 501);
});
