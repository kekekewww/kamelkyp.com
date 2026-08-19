import {
  type LoaderFunctionArgs,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { CaseTable } from "../../components/admin/CaseTable";
import {
  listCases,
  listPendingStudentPriceReviews,
} from "../../lib/admin/case-service.server";
import { requireAdmin } from "../../lib/auth/admin.server";
import type { CaseStatus } from "../../lib/cases/case-repository.server";
import { listCleanupDue } from "../../lib/cases/retention.server";
import { cloudflareContext } from "../../lib/cloudflare/context";
import { isServiceId } from "../../lib/services/service-id";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  const status = url.searchParams.get("status") as CaseStatus | null;
  const [cases, studentReviews, cleanupDue] = await Promise.all([
    listCases({
      db: env.DB,
      serviceId: service && isServiceId(service) ? service : undefined,
      status: status ?? undefined,
      limit: 100,
      cursor: url.searchParams.get("cursor") ?? undefined,
      cursorSecret: env.CSRF_SECRET,
    }),
    listPendingStudentPriceReviews(env.DB),
    listCleanupDue(env.DB, new Date().toISOString()),
  ]);
  return {
    cases,
    studentReviews,
    cleanupDueCaseIds: cleanupDue.map((item) => item.caseId),
  };
}

export function headers() {
  return { "Cache-Control": "no-store" };
}

export default function AdminCases() {
  const data = useLoaderData<typeof loader>();
  const { csrfToken } = useOutletContext<{ csrfToken: string }>();
  return (
    <section>
      <p className="eyebrow">CASES / MINIMUM DATA</p>
      <h1>案件</h1>
      <p>
        網站不保存完整表單內容；請至 Google Form
        查看。完成、取消或暫停一週後依流程刪除敏感資料。
      </p>
      <CaseTable
        rows={data.cases.rows}
        studentReviews={data.studentReviews}
        cleanupDueCaseIds={data.cleanupDueCaseIds}
        csrfToken={csrfToken}
      />
    </section>
  );
}
