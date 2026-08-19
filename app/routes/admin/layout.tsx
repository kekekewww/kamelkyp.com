import {
  Form,
  type LoaderFunctionArgs,
  NavLink,
  Outlet,
  useLoaderData,
} from "react-router";
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

const navigation = [
  ["/admin/content", "內容"],
  ["/admin/services", "服務與價格"],
  ["/admin/terms", "條款"],
  ["/admin/works", "作品與媒體"],
  ["/admin/links", "連結與 Footer"],
  ["/admin/posts", "Blog"],
  ["/admin/cases", "案件"],
] as const;

export default function AdminLayout() {
  const data = useLoaderData<typeof loader>();
  return (
    <main className="admin-shell" id="main-content">
      <aside className="admin-shell__sidebar">
        <p className="eyebrow">KAMEL / ADMIN</p>
        <p>登入：{data.displayName}</p>
        <nav aria-label="後台導覽">
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin-shell__main">
        <Outlet context={{ csrfToken: data.csrfToken }} />
      </section>
      <Form hidden method="post">
        <input name="csrfToken" type="hidden" value={data.csrfToken} />
      </Form>
    </main>
  );
}
