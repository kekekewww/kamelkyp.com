export function CleanupChecklist({
  caseId,
  csrfToken,
}: {
  caseId: string;
  csrfToken: string;
}) {
  return (
    <form
      action="/admin/cases/cleanup"
      className="cleanup-checklist"
      method="post"
    >
      <input name="csrfToken" type="hidden" value={csrfToken} />
      <input name="caseId" type="hidden" value={caseId} />
      <label>
        <input name="googleRecordsDeleted" required type="checkbox" />
        Google Form response／Sheet row 已刪除
      </label>
      <label>
        <input name="gmailDeleted" required type="checkbox" />
        Gmail 通知與垃圾桶已處理
      </label>
      <label>
        <input name="otherSensitiveCopiesDeleted" required type="checkbox" />
        其他敏感副本已刪除
      </label>
      <button type="submit">確認清理暫存資料</button>
    </form>
  );
}
