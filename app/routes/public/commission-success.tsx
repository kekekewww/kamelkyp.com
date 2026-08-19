import { Link, useLocation } from "react-router";
import { getService } from "../../lib/services/catalog";
import { isServiceId, type ServiceId } from "../../lib/services/service-id";

interface ConfirmationState {
  caseId: string;
  serviceId: ServiceId;
  submittedAt: string;
}

function validState(value: unknown): value is ConfirmationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.caseId === "string" &&
    /^KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/.test(state.caseId) &&
    typeof state.serviceId === "string" &&
    isServiceId(state.serviceId) &&
    typeof state.submittedAt === "string" &&
    !Number.isNaN(new Date(state.submittedAt).getTime())
  );
}

export default function CommissionSuccessRoute() {
  const location = useLocation();
  const locale = location.pathname.startsWith("/en/") ? "en" : "zh";
  const isZh = locale === "zh";
  if (!validState(location.state)) {
    return (
      <main className="commission-step" id="main-content">
        <p className="eyebrow">COMMISSION / CONFIRMATION</p>
        <h1>{isZh ? "沒有可顯示的送出紀錄" : "No confirmation to display"}</h1>
        <p>
          {isZh
            ? "為了保護委託內容，確認頁不會從網址重新載入資料。"
            : "To protect your commission details, confirmation data is not reloaded from the URL."}
        </p>
        <Link to={`/${locale}/commission`}>
          {isZh ? "返回委託服務" : "Back to commissions"}
        </Link>
      </main>
    );
  }

  const service = getService(location.state.serviceId);
  const submittedDate = new Intl.DateTimeFormat(
    locale === "zh" ? "zh-TW" : "en-US",
    { dateStyle: "medium", timeZone: "Asia/Taipei" },
  ).format(new Date(location.state.submittedAt));
  return (
    <main className="commission-step commission-success" id="main-content">
      <p className="eyebrow">COMMISSION / RECEIVED</p>
      <h1>{isZh ? "委託已送出" : "Commission submitted"}</h1>
      <p>
        {isZh
          ? "請截圖或保存以下案件資訊；我會透過你提供的聯絡方式回覆。"
          : "Take a screenshot or save these case details. I will reply through the contact method you provided."}
      </p>
      <dl className="review-card">
        <div>
          <dt>{isZh ? "案件編號" : "Case ID"}</dt>
          <dd>{location.state.caseId}</dd>
        </div>
        <div>
          <dt>{isZh ? "服務" : "Service"}</dt>
          <dd>{service.name[locale]}</dd>
        </div>
        <div>
          <dt>{isZh ? "送出日期" : "Submitted"}</dt>
          <dd>{submittedDate}</dd>
        </div>
      </dl>
      <p>
        {isZh
          ? "完整委託內容不會顯示在此頁；可識別資料會依服務條款與七日清理流程處理。"
          : "The full commission is not shown here. Identifiable data follows the service terms and seven-day cleanup process."}
      </p>
      <Link to={`/${locale}`}>{isZh ? "返回主頁" : "Back home"}</Link>
    </main>
  );
}
