/** STUB (I): verified cleanup resource route. Guarded; not built yet. */
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import { actionError } from "../../../lib/cms/studio/responses";

export const action = withOwnerMutation(() =>
  actionError("not_built", {
    status: 501,
    message: "Use the legacy admin: /admin/cases.",
  }),
);
