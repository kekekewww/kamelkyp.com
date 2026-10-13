/** `POST /studio/commissions/status`: intent `set-status` (wp1 §4.2). */
import { handleCommissionStatus } from "../../../lib/cms/repositories/commissions.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleCommissionStatus({ db, formData, intent, now }),
);
