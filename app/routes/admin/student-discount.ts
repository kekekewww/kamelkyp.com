import { type ActionFunctionArgs, redirect } from "react-router";
import { resolveStudentDiscount } from "../../lib/admin/case-service.server";
import { requireAdminMutation } from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  await resolveStudentDiscount({
    db: env.DB,
    caseId: String(formData.get("caseId") ?? ""),
    accepted: formData.get("accepted") === "true",
  });
  return redirect("/admin/cases");
}
