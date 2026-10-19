/**
 * `POST /studio/commissions/cleanup`: intent `confirm-cleanup`, the
 * owner-confirmed 7-day cleanup (three-item checklist, then the Apps Script
 * ledger, then the temporary records). Never run automatically.
 */
import {
  appsScriptCleanupGateway,
  handleCommissionCleanup,
} from "../../../lib/cms/repositories/commissions.server";
import { withOwnerMutation } from "../../../lib/cms/studio/auth.server";

export const action = withOwnerMutation(({ db, env, formData, intent, now }) =>
  handleCommissionCleanup({
    db,
    formData,
    intent,
    now,
    gateway: appsScriptCleanupGateway(env),
  }),
);
