import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { BlockEditor } from "../../components/admin/BlockEditor";
import { PublishPanel } from "../../components/admin/PublishPanel";
import { parseSaveContentForm } from "../../lib/admin/block-form";
import {
  getAdminContentVersion,
  publishDraft,
  saveDraft,
  unpublishContent,
} from "../../lib/admin/content-service.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  if (!params.versionId) throw new Response("Not Found", { status: 404 });
  try {
    return { version: await getAdminContentVersion(env.DB, params.versionId) };
  } catch {
    throw new Response("Not Found", { status: 404 });
  }
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  if (!params.versionId) throw new Response("Not Found", { status: 404 });
  const intent = formData.get("intent");
  try {
    if (intent === "save") {
      const input = parseSaveContentForm(formData);
      if (input.versionId !== params.versionId)
        throw new Error("version_mismatch");
      await saveDraft({ db: env.DB, ...input });
    } else if (intent === "publish") {
      await publishDraft({
        db: env.DB,
        versionId: params.versionId,
        now: new Date(),
      });
    } else if (intent === "unpublish") {
      const version = await getAdminContentVersion(env.DB, params.versionId);
      await unpublishContent({
        db: env.DB,
        entryId: version.entryId,
        locale: version.locale,
      });
    } else {
      return data({ error: "invalid_intent" }, { status: 422 });
    }
    return redirect(`/admin/content/${params.versionId}/edit`);
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "content_update_failed";
    return data(
      { error: code },
      { status: code === "stale_revision" ? 409 : 422 },
    );
  }
}

export function headers() {
  return { "Cache-Control": "no-store" };
}

export default function AdminContentEdit() {
  const { version } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">DRAFT / EDIT</p>
      <h1>{version.title || "未命名內容"}</h1>
      {actionData?.error ? (
        <p role="alert">
          {actionData.error === "stale_revision"
            ? "內容已在其他頁籤更新，請重新載入"
            : "無法儲存內容"}
        </p>
      ) : null}
      <div className="admin-editor-layout">
        <BlockEditor csrfToken={csrfToken} version={version} />
        <PublishPanel csrfToken={csrfToken} version={version} />
      </div>
    </section>
  );
}
