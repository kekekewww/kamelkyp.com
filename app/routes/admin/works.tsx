import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { ExternalMediaFields } from "../../components/admin/ExternalMediaFields";
import {
  createDraft,
  ensureContentEntry,
  listAdminContent,
} from "../../lib/admin/content-service.server";
import { replaceDraftMedia } from "../../lib/admin/media-content-service.server";
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
      (item) => item.kind === "work",
    ),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const intent = formData.get("intent");
  if (intent === "create") {
    const slug = String(formData.get("slug") ?? "");
    const locale = String(formData.get("locale") ?? "");
    if (!/^[a-z0-9-]+$/.test(slug) || !isLocale(locale))
      return Response.json({ error: "invalid_work" }, { status: 422 });
    const entryId = `work-${slug}`;
    await ensureContentEntry({ db: env.DB, entryId, kind: "work", slug });
    const draft = await createDraft({ db: env.DB, entryId, locale });
    return redirect(`/admin/content/${draft.id}/edit`);
  }
  if (intent === "media") {
    const versionId = String(formData.get("versionId") ?? "");
    await replaceDraftMedia({
      db: env.DB,
      versionId,
      items: JSON.parse(String(formData.get("mediaJson") ?? "[]")),
      r2Hosts: new Set(["media.kamelkyp.com"]),
    });
    return redirect(`/admin/content/${versionId}/edit`);
  }
  return Response.json({ error: "invalid_intent" }, { status: 422 });
}

export default function AdminWorks() {
  const { versions } = useLoaderData<typeof loader>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  const drafts = versions.filter((item) => item.state === "draft");
  return (
    <section>
      <p className="eyebrow">WORKS / EXTERNAL MEDIA</p>
      <h1>作品與媒體</h1>
      <p>只管理外部 URL，不上傳、下載、代理或複製檔案。</p>
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <input name="intent" type="hidden" value="create" />
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
        <button type="submit">建立作品草稿</button>
      </Form>
      {drafts.length > 0 ? (
        <Form className="admin-form" method="post">
          <input name="csrfToken" type="hidden" value={csrfToken} />
          <input name="intent" type="hidden" value="media" />
          <label>
            草稿
            <select name="versionId">
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.slug} / {draft.locale} / v{draft.versionNumber}
                </option>
              ))}
            </select>
          </label>
          <ExternalMediaFields />
          <button type="submit">儲存媒體 URL</button>
        </Form>
      ) : null}
      <div className="admin-list">
        {versions.map((version) => (
          <article key={version.id}>
            <strong>{version.title || "未命名作品"}</strong>
            <span>
              {version.locale} · v{version.versionNumber} · {version.state}
            </span>
            <Link to={`/admin/content/${version.id}/edit`}>編輯</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
