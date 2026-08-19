import type { AdminCaseRow } from "../../lib/admin/case-service.server";
import type { CaseStatus } from "../../lib/cases/case-repository.server";
import { CleanupChecklist } from "./CleanupChecklist";

const statuses: CaseStatus[] = [
  "pending_review",
  "pending_deposit",
  "in_production",
  "preview_approval",
  "pending_balance",
  "paused",
  "delivered",
  "cancelled",
];

export function CaseTable({
  rows,
  studentReviews,
  cleanupDueCaseIds,
  csrfToken,
}: {
  rows: AdminCaseRow[];
  studentReviews: Array<{
    caseId: string;
    currency: "TWD" | "USD";
    standardPriceMinor: number;
    studentPriceMinor: number;
  }>;
  cleanupDueCaseIds: string[];
  csrfToken: string;
}) {
  const studentByCase = new Map(
    studentReviews.map((review) => [review.caseId, review]),
  );
  const cleanupDue = new Set(cleanupDueCaseIds);
  return (
    <ul className="case-table">
      {rows.map((row) => {
        const student = studentByCase.get(row.caseId);
        return (
          <li key={row.caseId}>
            <div>
              <strong>{row.caseId}</strong>
              <span>{row.submittedAt.slice(0, 10)}</span>
            </div>
            <div>
              <span>{row.serviceId}</span>
              <span>
                {row.currency} {row.lockedPriceMinor.toLocaleString()}
              </span>
            </div>
            <form action="/admin/cases/status" method="post">
              <input name="csrfToken" type="hidden" value={csrfToken} />
              <input name="caseId" type="hidden" value={row.caseId} />
              <label>
                狀態
                <select defaultValue={row.status} name="status">
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <button type="submit">更新</button>
            </form>
            {student ? (
              <section>
                <p>
                  一般價：{student.currency}{" "}
                  {student.standardPriceMinor.toLocaleString()}
                </p>
                <p>
                  學生價：{student.currency}{" "}
                  {student.studentPriceMinor.toLocaleString()}
                </p>
                <div className="admin-actions">
                  {[true, false].map((accepted) => (
                    <form
                      action="/admin/cases/student-discount"
                      key={String(accepted)}
                      method="post"
                    >
                      <input name="csrfToken" type="hidden" value={csrfToken} />
                      <input name="caseId" type="hidden" value={row.caseId} />
                      <input
                        name="accepted"
                        type="hidden"
                        value={String(accepted)}
                      />
                      <button type="submit">
                        {accepted ? "接受學生優惠" : "拒絕學生優惠"}
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ) : null}
            {cleanupDue.has(row.caseId) ? (
              <CleanupChecklist caseId={row.caseId} csrfToken={csrfToken} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
