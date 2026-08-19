import { type ActionFunctionArgs, redirect } from "react-router";
import { confirmVerifiedCleanup } from "../../lib/admin/cleanup-service.server";
import { requireAdminMutation } from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { cleanupGoogleLedger } from "../../lib/integrations/google-submission-gateway.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const checked = (name: string) => formData.get(name) === "on";
  await confirmVerifiedCleanup({
    db: env.DB,
    caseId: String(formData.get("caseId") ?? ""),
    checklist: {
      googleRecordsDeleted: checked("googleRecordsDeleted") as true,
      gmailDeleted: checked("gmailDeleted") as true,
      otherSensitiveCopiesDeleted: checked(
        "otherSensitiveCopiesDeleted",
      ) as true,
    },
    gateway: {
      cleanupLedger: ({ caseId, now }) =>
        cleanupGoogleLedger({
          url: env.APPS_SCRIPT_URL,
          secret: env.APPS_SCRIPT_HMAC_SECRET,
          caseId,
          now,
          fetcher: fetch,
        }),
    },
    now: new Date(),
  });
  return redirect("/admin/cases");
}
