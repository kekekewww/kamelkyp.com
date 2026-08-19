import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { BlockRenderer } from "../../components/content/block-renderer";
import { getAdminContentVersion } from "../../lib/admin/content-service.server";
import { requireAdmin } from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  if (!params.versionId) throw new Response("Not Found", { status: 404 });
  return { version: await getAdminContentVersion(env.DB, params.versionId) };
}

export function headers() {
  return { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
}

export default function AdminContentPreview() {
  const { version } = useLoaderData<typeof loader>();
  return (
    <article className="content-detail-page">
      <p className="eyebrow">ADMIN PREVIEW / NOINDEX</p>
      <h1>{version.title || "未命名內容"}</h1>
      {version.summary ? <p>{version.summary}</p> : null}
      <BlockRenderer blocks={version.body} />
    </article>
  );
}
