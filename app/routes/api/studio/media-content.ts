/**
 * `PUT /api/studio/media/:id/content` (`X-Studio-CSRF`) — stream the file body
 * into R2 → 200 `{ asset: MediaSummary }`. The body is never buffered; it is
 * checked by its first bytes and its length on the way through.
 */
import { handleUploadContent } from "../../../lib/cms/media/upload.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";

export const action = withOwnerMutation(handleUploadContent);
