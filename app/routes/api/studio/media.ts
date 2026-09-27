/**
 * `POST /api/studio/media` (JSON, `X-Studio-CSRF`) — declare an upload →
 * 201 `{ assetId, uploadUrl }`. 503 `uploads_not_configured` without the R2
 * binding and base URL; 413 / 415 / 422 for refused declarations.
 */
import { handleDeclareUpload } from "../../../lib/cms/media/upload.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";

export const action = withOwnerMutation(handleDeclareUpload);
