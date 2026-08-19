# Google Form、Apps Script 與 Gmail 設定手冊

網站只把完整表單送到這個 signed relay；完整表單不寫入 D1，使用者也不會收到確認信。

## 1. 建立專用 Google Form

1. 使用 Kamel 的 Google 帳號進入 <https://forms.google.com/> → **Blank form**。
2. 建立以下 16 個欄位，標題建議直接使用 key，避免日後誤認：
   - Short answer：`case_id`、`submitted_at`、`locale`、`service`、`locked_price`、`display_name`、`email`
   - Paragraph：`contacts`、`age_and_guardian`、`student_and_proof`、`project_links`、`purpose_and_date`、`credit_and_portfolio`、`options`、`service_details`、`terms`
3. Responses → **Link to Sheets**，建立專用試算表。
4. 從 Form URL 複製 `FORM_ID`。
5. 每個 item 的 numeric item ID 必須寫入 `FORM_ITEM_MAP`；可在 Apps Script 內短暫執行 `FormApp.openById(FORM_ID).getItems().map(i => [i.getTitle(), i.getId()])` 查看，完成後刪除臨時函式與執行 log。

## 2. 建立 Apps Script Web App

1. 進入 <https://script.google.com/> → **New project**。
2. 將 repository 的 `integrations/apps-script/Code.gs` 完整貼入 `Code.gs`。
3. Project Settings → **Script Properties** 新增：
   - `FORM_ID`
   - `FORM_ITEM_MAP`：16 個 key 到 numeric item ID 的 JSON object
   - `ADMIN_EMAIL`：`kevinyaungputra@gmail.com`
   - `HMAC_SECRET`：至少 32 字元的隨機值
4. Deploy → **New deployment** → type 選 **Web app**。
5. Execute as 選自己；Who has access 依 Google Web App 可接受 Worker POST 的選項設定。安全邊界不是匿名 UI，而是每個 request 都必須通過 timestamp、nonce、case ID 與 HMAC 驗證。
6. 完成授權，複製 `https://script.google.com/macros/s/.../exec` URL。

程式不把 body、email、工程連結或 secret 寫入 Apps Script log；回應只包含穩定狀態與 Google response ID。

## 3. 同步 GitHub Environment secrets

`HMAC_SECRET` 必須與 GitHub Environment 的 `APPS_SCRIPT_HMAC_SECRET` 完全相同；Web App URL 設為 `APPS_SCRIPT_URL`。

```powershell
gh secret set APPS_SCRIPT_URL --env preview
gh secret set APPS_SCRIPT_HMAC_SECRET --env preview
gh secret set APPS_SCRIPT_URL --env production
gh secret set APPS_SCRIPT_HMAC_SECRET --env production
```

命令會提示私密輸入；不要把值放進 `--body`、對話、issue 或文件。

## 4. 驗收與 idempotency

使用無真實個資的測試案件驗證：

1. Google Form 只新增一筆 response。
2. Sheet row 與表單內容一致。
3. `kevinyaungputra@gmail.com` 收到一封包含完整內容的管理通知。
4. 使用相同 Case ID 重送時不新增第二筆 Form response；若第一次只完成 Form、Gmail 失敗，重試只補寄通知。
5. 使用者端不寄確認信，成功頁只顯示案件編號、日期與服務類型等有限資訊。
6. 驗收完成後刪除測試 Form response、Sheet row、Gmail、Apps Script ledger 與任何副本。

## 5. 案件結束後清理

交付、取消或暫停滿 7 日後：

1. 在 Google Form 刪除 response。
2. 在 linked Sheet 刪除 row。
3. 刪除 Gmail 通知與轉寄／下載副本。
4. 刪除其他雲端或本機副本；Drive／Gmail 垃圾桶及平台備份可能仍有額外保留期。
5. 回 `/admin/cases`，逐項確認 Google、Gmail、其他副本已清理，再執行 cleanup confirmation。
6. Worker 會刪 Apps Script 的 `case:<id>` ledger 與 D1 暫存；D1 永久只保留案件編號、服務、實際鎖定價格／幣別、日期與狀態。

學生證明不會下載到網站；只傳遞使用者提供的連結，使用者可遮蔽敏感資訊。案件清理時連結與其他完整表單資料一併移除。
