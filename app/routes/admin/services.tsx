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
  listPriceVersions,
  publishPriceVersion,
} from "../../lib/admin/service-catalog-service.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../lib/auth/admin.server";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { getService } from "../../lib/services/catalog";
import { isServiceId } from "../../lib/services/service-id";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  return { prices: await listPriceVersions(env.DB) };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const formData = await request.formData();
  await requireAdminMutation(request, env, formData);
  const serviceId = String(formData.get("serviceId") ?? "");
  if (!isServiceId(serviceId))
    return data({ error: "invalid_service_id" }, { status: 422 });
  try {
    await publishPriceVersion({
      db: env.DB,
      serviceId,
      baseTwd: Number(formData.get("baseTwd")),
      perSongAfterFiveTwd: Number(formData.get("perSongAfterFiveTwd")),
      studentDiscountBps: Number(formData.get("studentDiscountBps")),
      rushBps: Number(formData.get("rushBps")),
      consultationBps: Number(formData.get("consultationBps")),
      sourcePrepBps: Number(formData.get("sourcePrepBps")),
      effectiveFrom: new Date(
        String(formData.get("effectiveFrom")),
      ).toISOString(),
    });
    return data({ ok: true });
  } catch {
    return data({ error: "invalid_price_version" }, { status: 422 });
  }
}

export default function AdminServices() {
  const { prices } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">SERVICES / IMMUTABLE PRICES</p>
      <h1>服務與價格</h1>
      <p>服務 ID 固定；發布新價格不會修改既有案件的鎖定價格。</p>
      {actionData && "error" in actionData ? (
        <p role="alert">價格資料格式不正確</p>
      ) : null}
      <Form className="admin-form" method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <label>
          服務
          <select name="serviceId">
            {[
              "full_mix",
              "vocal_mix",
              "simple_transition",
              "edit_transition",
            ].map((id) => (
              <option key={id} value={id}>
                {getService(id as Parameters<typeof getService>[0]).name.zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          基價 TWD
          <input min="1" name="baseTwd" required type="number" />
        </label>
        <label>
          第六首起每首
          <input min="0" name="perSongAfterFiveTwd" required type="number" />
        </label>
        <label>
          學生折扣 bps
          <input defaultValue="3000" name="studentDiscountBps" type="number" />
        </label>
        <label>
          急件 bps
          <input defaultValue="5000" name="rushBps" type="number" />
        </label>
        <label>
          諮詢 bps
          <input defaultValue="5000" name="consultationBps" type="number" />
        </label>
        <label>
          素材整理 bps
          <input defaultValue="500" name="sourcePrepBps" type="number" />
        </label>
        <label>
          生效時間
          <input name="effectiveFrom" required type="datetime-local" />
        </label>
        <button type="submit">發布新價格版本</button>
      </Form>
      <div className="admin-list">
        {prices.map((price) => (
          <article key={price.id}>
            <strong>{getService(price.serviceId).name.zh}</strong>
            <span>
              NT${price.baseTwd.toLocaleString()} · {price.effectiveFrom}
            </span>
            <code>{price.id}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
