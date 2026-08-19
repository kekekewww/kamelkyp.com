# 電腦環境轉移交接

原始日期：2026-08-13；最後更新：2026-08-19

Repository：`https://github.com/kekekewww/kamelkyp.com`

正式分支：`main`

完整平台合併：PR [#6](https://github.com/kekekewww/kamelkyp.com/pull/6)，merge commit `5cc3f795c14256020a39258cff30ef323fceac05`。

## GitHub 已保存的內容

- 完整網站規格與 Plan 00–06。
- Plan 01–06 的原始碼、migration、單元／Worker／Apps Script／E2E 測試、workflow 與鎖定版本。
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
   npm run check:all
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

## 尚未完成、不能由程式假造的外部設定

- Preview／Production Cloudflare Access application、Audience tag 與完整 HTTPS team domain。
- 正式 Google Form、Apps Script Web App URL 與共享 HMAC secret。
- Preview／Production 各自至少 32 字元的 `CSRF_SECRET`。
- Production D1、Turnstile 正式 key、GitHub `production` Environment 與 required reviewer。
- 專業法務審查及 `LEGAL_REVIEW_CONFIRMED=true`。

逐步操作請依 `docs/runbooks/cloudflare-setup.md`、`google-setup.md`、`release-checklist.md` 與 `docs/legal/review-checklist.md`。這些是帳戶層級外部狀態，不是遺失的本機原始碼。

設定完成後可檢查名稱：

```powershell
gh secret list --env preview
gh variable list --env preview
```

不要在終端歷史、issue、PR 或對話中貼出 Secret 值。GitHub Environment 的 Secret 不需要搬移到新電腦；需要輪替時再以互動方式重新設定。

## 驗證與部署

2026-08-19 合併前已在 production build 與本機隔離 D1 完成以下驗證：

- 格式與 TypeScript typecheck 通過。
- 24 個 unit test files、108 項 unit tests 通過。
- 21 個真實 Cloudflare Worker／D1 test files、59 項 tests 通過。
- 4 項 Apps Script tests 通過。
- Production build 通過。
- Chromium desktop／mobile 共 76 項 E2E 通過，包含 responsive、a11y、雙語、價格、委託、媒體、CSP 與安全錯誤。

GitHub `e2e` workflow 會在 PR／手動執行時重現相同 loopback 驗收。Preview workflow 會 fail closed；在 Access variables、Apps Script secrets 與 CSRF secret 補齊以前，不會執行 remote migration 或部署。合併後請從 GitHub Actions 查看 `main` 最新 run，而不要沿用舊 run 編號判斷狀態。

GitHub 證據：

- 合併後 [`main` CI run 32251080859](https://github.com/kekekewww/kamelkyp.com/actions/runs/32251080859) 通過。
- PR head [`e2e` run 32250835660](https://github.com/kekekewww/kamelkyp.com/actions/runs/32250835660) 通過完整 loopback 驗收。
- [`Preview` run 32250835280](https://github.com/kekekewww/kamelkyp.com/actions/runs/32250835280) 只在設定 gate 停止；當時缺少 `APPS_SCRIPT_URL`、`APPS_SCRIPT_HMAC_SECRET`、`CSRF_SECRET`、`ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`，未執行 migration、deploy 或 cleanup。

本機完整驗證：

```powershell
npm ci
npm run check
```

Preview Environment 補齊後，重新執行 GitHub `preview` workflow；Production 只能在 `main` 手動執行受保護的 `production` workflow，且 production verifier 會拒絕測試 key、placeholder、未完成法務確認或錯誤網域。

## 換機後第一個安全檢查

```powershell
git status
git log -1 --oneline
gh auth status
npx wrangler whoami
npm ci
npm run check:all
```

不要搬移舊電腦的 `.dev.vars`、`.wrangler.secrets.json`、OAuth cache 或任何明文 Secret；所有必要程式與交付文件都應從 GitHub `main` 還原。
