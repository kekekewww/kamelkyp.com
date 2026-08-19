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
import type { ContentKind } from "../../lib/db/content-repository.server";
import { isLocale } from "../../lib/i18n/locale";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  return { versions: await listAdminContent(env.DB) };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const entryId = String(formData.get("entryId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (
    !entryId ||
    !/^[a-z0-9-]+$/.test(slug) ||
    !["page", "work", "post"].includes(kind) ||
    !isLocale(locale)
  ) {
    return Response.json({ error: "invalid_content_entry" }, { status: 422 });
  }
  await ensureContentEntry({
    db: env.DB,
    entryId,
    kind: kind as ContentKind,
    slug,
  });
  const draft = await createDraft({ db: env.DB, entryId, locale });
  return redirect(`/admin/content/${draft.id}/edit`);
}

export default function AdminContentIndex() {
  const { versions } = useLoaderData<typeof loader>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">CONTENT / VERSIONS</p>
      <h1>內容版本</h1>
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <label>
          Entry ID
          <input name="entryId" required />
        </label>
        <label>
          Slug
          <input name="slug" pattern="[a-z0-9-]+" required />
        </label>
        <label>
          類型
          <select name="kind">
            <option value="page">頁面</option>
            <option value="work">作品</option>
            <option value="post">Blog</option>
          </select>
        </label>
        <label>
          語言
          <select name="locale">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <button type="submit">建立草稿</button>
      </Form>
      <div className="admin-list">
        {versions.map((version) => (
          <article key={version.id}>
            <p>
              {version.kind} / {version.slug} / {version.locale}
            </p>
            <strong>{version.title || "未命名"}</strong>
            <span>
              v{version.versionNumber} · {version.state}
            </span>
            <Link to={`/admin/content/${version.id}/edit`}>編輯</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
