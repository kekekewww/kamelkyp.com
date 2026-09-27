/**
 * `GET /api/studio/session` — refreshes the CSRF token (admin §3.4).
 * Resource route outside the `/studio` root: `withOwner` verifies Access.
 */
import {
  createStudioSession,
  withOwner,
} from "../../../lib/cms/studio/auth.server";
import { jsonOk } from "../../../lib/cms/studio/responses";

export const loader = withOwner(async ({ env, identity, now }) =>
  jsonOk(await createStudioSession(env, identity, now)),
);
