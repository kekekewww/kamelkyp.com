# 電腦環境轉移交接

日期：2026-08-13

Repository：`https://github.com/kekekewww/kamelkyp.com`

正式分支：`main`

## GitHub 已保存的內容

- 完整網站規格與 Plan 00–06。
- Plan 01 Cloud Foundation 的所有原始碼、migration、測試、workflow 與鎖定版本。
- SDD Task 1–4 brief、Task 1–3 實作報告、review packages 與進度紀錄。
- Task 4 實作／雲端設定狀態報告。

編譯輸出、套件目錄及本機登入憑證刻意不保存；它們可重新產生，或必須由安全登入流程恢復。

## 新電腦初始化

1. 安裝 Git、GitHub CLI、Node.js 24 與 npm。
2. Clone 並安裝鎖定相依：

   ```powershell
   git clone https://github.com/kekekewww/kamelkyp.com.git
   cd kamelkyp.com
   npm ci
   npm run check
   ```

3. 登入 GitHub 與 Cloudflare：

   ```powershell
   gh auth login
   npx wrangler login
   gh auth status
   npx wrangler whoami
   ```

4. 不要複製舊電腦的 Wrangler OAuth 檔、`.env`、`.dev.vars` 或明文 Token。

## 已建立的雲端資源

- Cloudflare D1：`kamelkyp-preview`，APAC。
- Cloudflare Turnstile widget：`kamelkyp-preview`，Managed mode。
- Workers account subdomain 已設定。
- GitHub Environment：`preview`。
- `preview` Environment branch policy：只允許 `refs/pull/*/merge`。

GitHub `preview` Environment 已包含以下設定名稱：

- Secrets：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`D1_DATABASE_ID`、`TURNSTILE_SECRET`。
- Variables：`ADMIN_EMAIL`、`TURNSTILE_SITE_KEY`、`WORKERS_DEV_SUBDOMAIN`。

Secret 值、D1 UUID、OAuth Token 與 Turnstile Secret 不記錄在這份公開文件。

## 尚未完成的外部設定

最新 Preview workflow 已成功讀取並遮罩 `CLOUDFLARE_API_TOKEN`；目前仍缺少：

- Variable：`ACCESS_AUD`
- Variable：`ACCESS_TEAM_DOMAIN`

因此 Preview migration、遠端部署與 E2E smoke test 尚未取得完整綠燈。這是外部雲端設定狀態，不是未提交的本機原始碼。

設定完成後可檢查名稱：

```powershell
gh secret list --env preview
gh variable list --env preview
```

不要在終端歷史、issue、PR 或對話中貼出 Secret 值。GitHub Environment 的 Secret 不需要搬移到新電腦；需要輪替時再以互動方式重新設定。

## 驗證與部署

合併後的 [`main` CI run 31712851358](https://github.com/kekekewww/kamelkyp.com/actions/runs/31712851358) 已通過。最新 [`Deploy Preview` run 31712705490](https://github.com/kekekewww/kamelkyp.com/actions/runs/31712705490) 只因缺少上述兩項 Access Variables 而在明確的設定閘門停止。

本機完整驗證：

```powershell
npm ci
npm run check
```

Preview Environment 補齊後，重新執行 GitHub 的 `Deploy Preview` workflow；成功條件為 migration、Worker deploy 與 Playwright smoke test 全部通過。

## 下一階段

依序執行 Roadmap 的 Plan 02–06。Plan 01 的 SDD 證據位於 `.superpowers/sdd/2026-08-10-01-cloud-foundation/`，不要重新執行已標記完成的 Task 1–3。
