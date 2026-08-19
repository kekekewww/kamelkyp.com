import { type ActionFunctionArgs, redirect } from "react-router";
import { updateCaseStatus } from "../../lib/admin/case-service.server";
import { requireAdminMutation } from "../../lib/auth/admin.server";
import type { CaseStatus } from "../../lib/cases/case-repository.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  await updateCaseStatus({
    db: env.DB,
    caseId: String(formData.get("caseId") ?? ""),
    status: String(formData.get("status") ?? "") as CaseStatus,
    now: new Date(),
  });
  return redirect("/admin/cases");
}
