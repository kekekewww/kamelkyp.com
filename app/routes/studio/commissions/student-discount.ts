/**
 * `POST /studio/commissions/student-discount`: intents
 * `accept-student-price` / `reject-student-price` (wp1 §4.2).
 */
import { handleStudentDiscount } from "../../../lib/cms/repositories/commissions.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";

export const action = withOwnerMutation(({ db, formData, intent }) =>
  handleStudentDiscount({ db, formData, intent }),
);
