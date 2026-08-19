# Release Checklist

## A. 程式與隔離測試

- [ ] Plan 01–06 的程式與 migration 已進入 `main`。
- [ ] 使用 Node.js 24 執行 `npm ci`，未修改 `package-lock.json`。
- [ ] 執行 `npm run check:all`；unit、Worker、Apps Script、typecheck、format、build、desktop/mobile E2E 全綠。
- [ ] E2E 只使用 loopback D1、官方 Turnstile test key、匿名 fixtures，不碰 Production D1、Gmail 或 Google Form。
- [ ] `.wrangler.secrets.json`、`.dev.vars`、generated Wrangler config 未被 Git 追蹤或上傳 artifact。

## B. Preview 人工驗收

- [ ] Preview workflow migration、deploy 與 E2E 全綠。
- [ ] Desktop Chromium／Safari、iOS Safari 尺寸、Android Chrome 尺寸人工檢查。
- [ ] 中文／英文、TWD／USD、首頁、四個服務頁、Footer、作品、Blog／其他內容。
- [ ] 四步委託表單、local draft、統一條款、review、Turnstile、成功頁有限資訊。
- [ ] YouTube／Drive click-to-load、外部下載連結、單一音訊播放與錯誤降級。
- [ ] Cloudflare Access：未登入阻擋、正確 email OTP 可登入、錯誤 email 不能登入、8 小時 session。
- [ ] `/admin` 無上傳、無 audit page，案件只顯示六項有限欄位，不顯示證明或完整表單。

## C. 外部設定 gate

- [ ] Preview／Production `RATE_LIMIT_NAMESPACE_ID` 都是正整數且彼此不同；生成設定各只有一個 `SUBMISSION_RATE_LIMITER`（10/60 秒）。
- [ ] 兩個 Environment 的 `secrets.required` 都恰為 TURNSTILE、Apps Script URL、Apps Script HMAC、CSRF 四個名稱。
- [ ] Production Turnstile 不是測試 key，hostname 僅限正式網域。
- [ ] Google Form、Sheet、Gmail 小額／匿名測試案件通過，之後已刪除全部測試資料。
- [ ] Cloudflare Access 無 Bypass policy，Audience／team domain／admin email 正確。
- [ ] 法務專業審查完成，`LEGAL_REVIEW_CONFIRMED=true`。
- [ ] GitHub `production` Environment 限制 `main` 且設 required reviewer。

## D. Production deployment

- [ ] 備份目前公開 content version IDs。
- [ ] 在 GitHub Actions 手動執行 `production` workflow 並人工核准。
- [ ] Actions summary 記錄 migration 前 D1 Time Travel bookmark。
- [ ] migration、Worker + secrets 原子部署、secret 名稱驗證、health check 全綠。
- [ ] 記錄 deployment ID、commit SHA、D1 bookmark 與發布時間。
- [ ] 驗收 `https://kamelkyp.com/health`、`/zh`、`/en`、四服務、表單、Footer、Blog、Access、CSP/HSTS。
- [ ] 不用真實委託資料執行 smoke test。

## E. 發生重大問題

1. 停止新的 production deployment 與資料 mutation。
2. Worker 回到上一個成功 deployment。
3. D1 不自動 rollback；先由 Kamel 確認影響範圍與 migration 前 bookmark。
4. 如需 Time Travel restore，依 `cloudflare-setup.md` 人工處理並記錄還原後 bookmark。
5. 修正需重新通過完整 CI、Preview 與 production approval。
