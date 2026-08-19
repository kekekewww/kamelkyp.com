import type { CommissionDraft } from "../../lib/commission/schema";
import type { Locale } from "../../lib/i18n/locale";

export interface CommissionFieldProps {
  draft: CommissionDraft;
  locale: Locale;
  updateField(name: string, value: unknown): void;
}

export function CommonFields({
  draft,
  locale,
  updateField,
}: CommissionFieldProps) {
  const isZh = locale === "zh";

  function updateContact(
    index: number,
    field: "platform" | "account",
    value: string,
  ) {
    const contacts = draft.contacts.map((contact, contactIndex) =>
      contactIndex === index ? { ...contact, [field]: value } : contact,
    );
    updateField("contacts", contacts);
  }

  function updateProjectLink(index: number, value: string) {
    updateField(
      "projectLinks",
      draft.projectLinks.map((link, linkIndex) =>
        linkIndex === index ? value : link,
      ),
    );
  }

  return (
    <fieldset className="commission-fields">
      <legend>{isZh ? "聯絡與案件資料" : "Contact and project"}</legend>
      <label htmlFor="displayName">
        {isZh ? "稱呼／藝名" : "Preferred name"}
      </label>
      <input
        id="displayName"
        value={draft.displayName}
        onChange={(event) => updateField("displayName", event.target.value)}
        autoComplete="name"
      />

      <label htmlFor="email">{isZh ? "電子郵件" : "Email"}</label>
      <input
        id="email"
        type="email"
        value={draft.email}
        onChange={(event) => updateField("email", event.target.value)}
        autoComplete="email"
      />

      <div className="commission-repeatable">
        <div className="commission-repeatable__heading">
          <h3>{isZh ? "常用聯絡方式" : "Contact methods"}</h3>
          <button
            type="button"
            onClick={() =>
              updateField("contacts", [
                ...draft.contacts,
                { platform: "", account: "" },
              ])
            }
          >
            {isZh ? "新增聯絡方式" : "Add contact"}
          </button>
        </div>
        {draft.contacts.map((contact, index) => (
          <div
            className="commission-repeatable__row"
            key={`contact-${contact.platform}-${contact.account}`}
          >
            <label htmlFor={`contact-platform-${index}`}>
              {isZh ? "聯絡平台" : "Contact platform"}
            </label>
            <input
              id={`contact-platform-${index}`}
              value={contact.platform}
              onChange={(event) =>
                updateContact(index, "platform", event.target.value)
              }
            />
            <label htmlFor={`contact-account-${index}`}>
              {isZh ? "聯絡帳號" : "Contact account"}
            </label>
            <input
              id={`contact-account-${index}`}
              value={contact.account}
              onChange={(event) =>
                updateContact(index, "account", event.target.value)
              }
            />
          </div>
        ))}
      </div>

      <div className="commission-repeatable">
        <div className="commission-repeatable__heading">
          <h3>{isZh ? "工程連結" : "Project links"}</h3>
          <button
            type="button"
            onClick={() =>
              updateField("projectLinks", [...draft.projectLinks, ""])
            }
          >
            {isZh ? "新增工程連結" : "Add project link"}
          </button>
        </div>
        {draft.projectLinks.map((link, index) => (
          <div key={`project-link-${link}`}>
            <label htmlFor={`project-link-${index}`}>
              {isZh ? "工程連結" : "Project link"}
            </label>
            <input
              id={`project-link-${index}`}
              type="url"
              inputMode="url"
              value={link}
              onChange={(event) => updateProjectLink(index, event.target.value)}
              placeholder="https://"
            />
          </div>
        ))}
      </div>

      <label htmlFor="usagePurpose">{isZh ? "用途說明" : "Purpose"}</label>
      <textarea
        id="usagePurpose"
        value={draft.usagePurpose}
        onChange={(event) => updateField("usagePurpose", event.target.value)}
        rows={4}
      />
      <p className="field-help">
        {isZh
          ? "用途協助理解需求，但不影響報價。"
          : "Purpose helps clarify the request and does not affect pricing."}
      </p>

      <label htmlFor="desiredDate">
        {isZh ? "希望完成日期（選填）" : "Desired date (optional)"}
      </label>
      <input
        id="desiredDate"
        type="date"
        value={draft.desiredDate}
        onChange={(event) => updateField("desiredDate", event.target.value)}
      />

      <label htmlFor="adultStatus">{isZh ? "年齡狀態" : "Age status"}</label>
      <select
        id="adultStatus"
        value={draft.adultStatus}
        onChange={(event) => updateField("adultStatus", event.target.value)}
      >
        <option value="adult">{isZh ? "已成年" : "Adult"}</option>
        <option value="minor">{isZh ? "未成年" : "Minor"}</option>
      </select>
      {draft.adultStatus === "minor" ? (
        <label className="checkbox-field" htmlFor="guardianAuthorized">
          <input
            id="guardianAuthorized"
            type="checkbox"
            checked={draft.guardianAuthorized}
            onChange={(event) =>
              updateField("guardianAuthorized", event.target.checked)
            }
          />
          {isZh
            ? "監護人已授權此委託"
            : "My guardian authorized this commission"}
        </label>
      ) : null}

      <label htmlFor="creditAccountId">
        {isZh ? "Credit 名稱或帳號" : "Credit name or account"}
      </label>
      <input
        id="creditAccountId"
        value={draft.creditAccountId}
        onChange={(event) => updateField("creditAccountId", event.target.value)}
      />

      <label className="checkbox-field" htmlFor="portfolioConsent">
        <input
          id="portfolioConsent"
          type="checkbox"
          checked={draft.portfolioConsent}
          onChange={(event) =>
            updateField("portfolioConsent", event.target.checked)
          }
        />
        {isZh
          ? "同意 Kamel 在作品發布後放入作品集"
          : "Kamel may show the work after it is released"}
      </label>

      <label className="checkbox-field" htmlFor="studentRequested">
        <input
          id="studentRequested"
          type="checkbox"
          checked={draft.studentRequested}
          onChange={(event) =>
            updateField("studentRequested", event.target.checked)
          }
        />
        {isZh
          ? "申請學生優惠（所有計價 -30%）"
          : "Request student discount (30% off)"}
      </label>
      {draft.studentRequested ? (
        <>
          <label htmlFor="studentProofUrl">
            {isZh ? "學生身分證明連結" : "Student proof link"}
          </label>
          <input
            id="studentProofUrl"
            type="url"
            value={draft.studentProofUrl}
            onChange={(event) =>
              updateField("studentProofUrl", event.target.value)
            }
            placeholder="https://"
          />
          <p className="field-help">
            {isZh
              ? "可遮蔽敏感資訊，但必須足以驗證學生身分。"
              : "Sensitive details may be hidden, but student status must remain verifiable."}
          </p>
        </>
      ) : null}

      <label className="checkbox-field" htmlFor="rush">
        <input
          id="rush"
          type="checkbox"
          checked={draft.rush}
          onChange={(event) => updateField("rush", event.target.checked)}
        />
        {isZh
          ? "詢問急件（服務基價 +50%）"
          : "Request rush scheduling (+50% of service base)"}
      </label>
      <label className="checkbox-field" htmlFor="sourcePrep">
        <input
          id="sourcePrep"
          type="checkbox"
          checked={draft.sourcePrep}
          onChange={(event) => updateField("sourcePrep", event.target.checked)}
        />
        {isZh
          ? "需要素材整理（服務基價 +5%）"
          : "Source preparation needed (+5% of service base)"}
      </label>
    </fieldset>
  );
}
