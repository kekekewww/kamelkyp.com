# kamelkyp.com

Kamel 的雙語音樂委託網站。專案規劃支援混音、Vocal 混音、歌曲銜接、歌曲編輯、作品預覽，以及 `/admin` 後台。

## 已實作範圍

- 中英文 responsive landing、服務導覽、TWD／USD、作品與外部媒體預覽、Footer 與 Blog 型內容。
- 四種服務的四步委託流程、local-only draft、Turnstile、送出時報價鎖定與有限成功資訊。
- D1 immutable content／price／term versions、案件有限永久紀錄與 7 日後人工確認清理。
- Signed Apps Script relay、Google Form／Gmail idempotency 與重試。
- `/admin` Cloudflare Access JWT + Origin/HMAC CSRF、內容／作品／連結／條款／價格／案件管理。
- CSP nonce、安全標頭、安全錯誤、GitHub-hosted loopback E2E、Preview 與人工核准 Production workflow。

外部 Cloudflare Access、Google Apps Script、Production D1／Turnstile 與法務 gate 必須依 runbook 由帳戶擁有人完成，程式會 fail closed，不會接受 placeholder。

## 開發環境

需要 Node.js 24 與 npm。所有相依版本都鎖定於 `package-lock.json`。

```powershell
git clone https://github.com/kekekewww/kamelkyp.com.git
cd kamelkyp.com
npm ci
npm run check:all
```

Cloudflare 與 GitHub 的登入資訊不會存入 repository。換電腦後請另行執行：

```powershell
npx wrangler login
gh auth login
```

完整換機及雲端交接狀態請見 [`docs/handoff/2026-08-13-environment-transfer.md`](docs/handoff/2026-08-13-environment-transfer.md)。

## 重要文件

- [完整產品與技術規格](docs/superpowers/specs/2026-08-10-kamelkyp-introduction-site-design.md)
- [Cloud Roadmap](docs/superpowers/plans/2026-08-10-00-kamelkyp-cloud-roadmap.md)
- [Cloud Foundation 計畫](docs/superpowers/plans/2026-08-10-01-cloud-foundation.md)
- [SDD 實作與審查紀錄](.superpowers/sdd/2026-08-10-01-cloud-foundation/progress.md)
- [Cloudflare 設定手冊](docs/runbooks/cloudflare-setup.md)
- [Google Form／Apps Script 設定手冊](docs/runbooks/google-setup.md)
- [發布 Checklist](docs/runbooks/release-checklist.md)
- [法務審查 Checklist](docs/legal/review-checklist.md)
- [換機交接](docs/handoff/2026-08-13-environment-transfer.md)

## 部署

- Pull request：`ci`、`e2e` 不接觸正式資料；`preview` Environment 核准後部署隔離 Preview。
- Production：只能從 GitHub Actions 在 `main` 手動執行 `production` workflow，必須通過 Environment reviewer、法務 gate、D1 bookmark、migration、deploy 與 health check。
- Repository 不提供可繞過上述 gate 的 `deploy:production` npm script。

## 不應提交的檔案

`node_modules/`、`build/`、`.wrangler/`、`.react-router/`、`.env*`、`.dev.vars`、產生的 Worker 設定與任何 Token/Secret 都由 `.gitignore` 排除，應在新環境重新產生或從 GitHub/Cloudflare 的安全設定恢復。
