/**
 * `PUT /api/studio/media/:id/content` — stream the file body into R2.
 *
 * STUB owned by the foundation, handed to P2 (uploads). Guarded now (Access +
 * `X-Studio-CSRF` + mutation method); answers 501 until the pipeline lands.
 */
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import { jsonError } from "../../../lib/cms/studio/responses";

export const action = withOwnerMutation(async () =>
  jsonError("not_built", 501),
);
