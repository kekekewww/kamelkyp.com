import {
  type ActionFunctionArgs,
  data,
  Form,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "react-router";
import {
  listTermVersions,
  publishTermVersion,
} from "../../lib/admin/term-service.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { parseTermClauses } from "../../lib/commission/terms-repository.server";
import { isLocale } from "../../lib/i18n/locale";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  return { versions: await listTermVersions(env.DB) };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale))
    return data({ error: "invalid_locale" }, { status: 422 });
  if (formData.get("legalReviewConfirmed") !== "on") {
    return data({ error: "legal_review_required" }, { status: 422 });
  }
  try {
    await publishTermVersion({
      db: env.DB,
      documentId: String(formData.get("documentId") ?? ""),
      locale,
      clauses: parseTermClauses(
        JSON.parse(String(formData.get("clausesJson") ?? "")),
      ),
      effectiveFrom: new Date(
        String(formData.get("effectiveFrom")),
      ).toISOString(),
      legalReviewConfirmed: true,
    });
    return data({ ok: true });
  } catch {
    return data({ error: "invalid_term_version" }, { status: 422 });
  }
}

export default function AdminTerms() {
  const { versions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">LEGAL / VERSIONS</p>
      <h1>條款版本</h1>
      <p>法律審閱勾選不取代專業法律意見。</p>
      {actionData && "error" in actionData ? (
        <p role="alert">
          {actionData.error === "legal_review_required"
            ? "發布前必須確認法律審閱"
            : "條款資料格式不正確"}
        </p>
      ) : null}
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <label>
          文件
          <select name="documentId">
            <option value="common">通用條款</option>
            <option value="privacy">隱私說明</option>
            <option value="full-mix">完整歌曲混音</option>
            <option value="vocal-mix">Vocal 混音</option>
            <option value="simple-transition">單純歌曲銜接</option>
            <option value="edit-transition">編輯歌曲銜接</option>
          </select>
        </label>
        <label>
          語言
          <select name="locale">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          結構化 clauses JSON
          <textarea
            defaultValue={
              '[{"key":"clause-key","title":"條款標題","text":"條款內容"}]'
            }
            name="clausesJson"
            rows={8}
          />
        </label>
        <label>
          生效時間
          <input name="effectiveFrom" required type="datetime-local" />
        </label>
        <label className="admin-checkbox">
          <input name="legalReviewConfirmed" type="checkbox" />
          我已完成專業法律審閱
        </label>
        <button type="submit">發布不可變條款版本</button>
      </Form>
      <div className="admin-list">
        {versions.map((version) => (
          <article key={version.id}>
            <strong>
              {version.documentId} / {version.locale}
            </strong>
            <span>
              v{version.versionNumber} · {version.effectiveFrom}
            </span>
            <code>{version.id}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
