import { type LoaderFunctionArgs, Outlet, useLoaderData } from "react-router";
import { AdminShell } from "../../components/admin/AdminShell";
import { requireAdmin } from "../../lib/auth/admin.server";
import { createCsrfToken } from "../../lib/auth/csrf.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const identity = await requireAdmin(request, env);
  return {
    displayName: identity.email.split("@")[0] ?? "Kamel",
    csrfToken: await createCsrfToken({
      subject: identity.subject,
      secret: env.CSRF_SECRET,
      now: new Date(),
    }),
  };
}

export default function AdminLayout() {
  const data = useLoaderData<typeof loader>();
  return (
    <AdminShell displayName={data.displayName}>
      <Outlet context={{ csrfToken: data.csrfToken }} />
    </AdminShell>
  );
}
