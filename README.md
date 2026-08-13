# kamelkyp.com

Kamel 的雙語音樂委託網站。專案規劃支援混音、Vocal 混音、歌曲銜接、歌曲編輯、作品預覽，以及 `/admin` 後台。

## 目前進度

- Plan 01 Cloud Foundation 已完成原始碼、D1 schema、內容 repository、Cloudflare Worker、CI 與 Preview workflow。
- Plan 02–06 的完整實作計畫與網站規格已保存在 [`docs/superpowers`](docs/superpowers)。
- Preview D1、Turnstile 與 GitHub `preview` Environment 已建立；正式 Preview 部署仍需補齊 Cloudflare CI Token 與 Access 設定。

## 開發環境

需要 Node.js 24 與 npm。所有相依版本都鎖定於 `package-lock.json`。

```powershell
git clone https://github.com/kekekewww/kamelkyp.com.git
cd kamelkyp.com
npm ci
npm run check
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

## 不應提交的檔案

`node_modules/`、`build/`、`.wrangler/`、`.react-router/`、`.env*`、`.dev.vars`、產生的 Worker 設定與任何 Token/Secret 都由 `.gitignore` 排除，應在新環境重新產生或從 GitHub/Cloudflare 的安全設定恢復。
