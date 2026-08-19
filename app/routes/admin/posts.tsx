import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
  useOutletContext,
} from "react-router";
import {
  createDraft,
  ensureContentEntry,
  listAdminContent,
} from "../../lib/admin/content-service.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { isLocale } from "../../lib/i18n/locale";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  return {
    versions: (await listAdminContent(env.DB)).filter(
      (item) => item.kind === "post",
    ),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const slug = String(formData.get("slug") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (!/^[a-z0-9-]+$/.test(slug) || !isLocale(locale))
    return Response.json({ error: "invalid_post" }, { status: 422 });
  const entryId = `post-${slug}`;
  await ensureContentEntry({ db: env.DB, entryId, kind: "post", slug });
  const draft = await createDraft({ db: env.DB, entryId, locale });
  return redirect(`/admin/posts/${draft.id}/edit`);
}

export default function AdminPosts() {
  const { versions } = useLoaderData<typeof loader>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">BLOG / UPDATES</p>
      <h1>Blog 與發布事項</h1>
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <label>
          Slug
          <input name="slug" pattern="[a-z0-9-]+" required />
        </label>
        <label>
          語言
          <select name="locale">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <button type="submit">建立 Blog 草稿</button>
      </Form>
      <div className="admin-list">
        {versions.map((version) => (
          <article key={version.id}>
            <strong>{version.title || "未命名文章"}</strong>
            <span>
              {version.locale} · v{version.versionNumber} · {version.state}
            </span>
            <Link to={`/admin/posts/${version.id}/edit`}>編輯</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
