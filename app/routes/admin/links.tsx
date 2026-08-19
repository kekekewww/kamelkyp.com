import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { LinkGroupEditor } from "../../components/admin/LinkGroupEditor";
import {
  listAdminLinkGroups,
  parseAdminLinkGroup,
  replaceLinkGroup,
} from "../../lib/admin/media-content-service.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  return { groups: await listAdminLinkGroups(env.DB) };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  try {
    const group = parseAdminLinkGroup({
      key: formData.get("key"),
      label: { zh: formData.get("labelZh"), en: formData.get("labelEn") },
      links: JSON.parse(String(formData.get("linksJson") ?? "[]")),
    });
    await replaceLinkGroup({ db: env.DB, group });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "invalid_link_group" }, { status: 422 });
  }
}

export default function AdminLinks() {
  const { groups } = useLoaderData<typeof loader>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">LINKS / FOOTER</p>
      <h1>連結與 Footer</h1>
      <p>連結數量不限；空分組不會顯示在公開 Footer。</p>
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <LinkGroupEditor />
        <button type="submit">儲存分組</button>
      </Form>
      <div className="admin-list">
        {groups.map((group) => (
          <article key={group.key}>
            <strong>
              {group.label.zh} / {group.label.en}
            </strong>
            <span>{group.links.length} 個連結</span>
          </article>
        ))}
      </div>
    </section>
  );
}
