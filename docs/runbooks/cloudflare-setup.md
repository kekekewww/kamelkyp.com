# Cloudflare 設定手冊

本文件只記錄操作步驟與設定名稱，不保存 Token、UUID、Turnstile secret 或 CSRF/HMAC 值。正式部署由 GitHub Actions 與 Wrangler 完成，不依賴 Codex Cloudflare plugin。

## 1. 進入需要的網站

- Cloudflare Dashboard：<https://dash.cloudflare.com/>
- Cloudflare Zero Trust／Access：<https://one.dash.cloudflare.com/>
- GitHub Environments：<https://github.com/kekekewww/kamelkyp.com/settings/environments>
- GitHub Actions：<https://github.com/kekekewww/kamelkyp.com/actions>

## 2. 建立 Preview 與 Production D1

1. Cloudflare Dashboard → **Storage & databases** → **D1 SQL database**。
2. Preview 使用既有 `kamelkyp-preview`；建立 `kamelkyp-production`，區域選 APAC。
3. 分別進入資料庫，複製 Database ID。
4. GitHub → repository **Settings** → **Environments** → `preview`／`production` → **Environment secrets**，新增 `D1_DATABASE_ID`。
5. 不要把 ID 寫入 `wrangler.base.jsonc`；renderer 只在 runner 產生暫存設定。

`kamelkyp-preview` 由所有 PR 的 Preview 共用且不會重設。preview workflow 每次部署後套用 `scripts/e2e-fixtures.mjs` 的 E2E fixture（與 loopback 相同清單），測試後移除；fixture 只寫 `e2e-*` 列，借用的列（commission terms 的 publication、showreel 標記）會備份並在 cleanup 還原。各 PR 的 preview job 以 concurrency group `preview-d1` 依序執行，不會互相刪掉 fixture。部分 E2E 斷言要求精確內容（首頁精選作品正好三個 fixture、footer 六組、Mixing 一個作品），因此不要在 Preview Studio 發布、精選內容或清除 `brand.contactEmail`；要試用 Studio 請在 loopback 或本機 dev 進行。若 workflow 在 cleanup 前中斷，fixture 會留在 Preview 直到下一次 preview run 的 seed 先清除殘留。

## 3. 設定 Cloudflare API Token

1. Cloudflare Dashboard 右上角個人選單 → **My Profile** → **API Tokens** → **Create Token**。
2. 使用 Workers 編輯範本，再把帳戶與 zone 限縮為本專案需要的帳戶、`kamelkyp.com` zone、Workers Scripts 與 D1 編輯權限。
3. 到 GitHub `preview` 與 `production` Environment，各自設定：
   - Secret `CLOUDFLARE_API_TOKEN`
   - Secret `CLOUDFLARE_ACCOUNT_ID`
4. 可用 GitHub CLI 私密提示輸入，請勿把值放在命令參數或對話中：

   ```powershell
   gh secret set CLOUDFLARE_API_TOKEN --env preview
   gh secret set CLOUDFLARE_ACCOUNT_ID --env preview
   gh secret set CLOUDFLARE_API_TOKEN --env production
   gh secret set CLOUDFLARE_ACCOUNT_ID --env production
   ```

Cloudflare 建議 CI Token 限縮到實際部署帳戶；GitHub Environment secrets 只有在 Environment gate 通過後才會交給 job。

## 4. 建立 Turnstile

1. Cloudflare Dashboard → **Turnstile** → **Add widget**。
2. Production hostname 只加入 `kamelkyp.com`，模式選 Managed。
3. Site key 放 GitHub `production` variable `TURNSTILE_SITE_KEY`；secret 放 `production` secret `TURNSTILE_SECRET`。
4. Preview 可用正式 Preview widget；本專案的 loopback E2E 才使用 Cloudflare 官方 always-pass 測試 key。
5. Production verifier 會拒絕所有官方測試 site key／secret key。

官方文件：<https://developers.cloudflare.com/turnstile/get-started/>、<https://developers.cloudflare.com/turnstile/troubleshooting/testing/>。

## 5. 建立 Cloudflare Access email OTP

Preview 與 Production 使用不同的 Self-hosted application、Audience tag；設定方法相同，唯一差別是 Production 多一個 `/studio.data` path（步驟 4）。新增 path 一律加在既有 application：另建一個 `/studio` application 會有自己的 Audience tag（≠ `ACCESS_AUD`），Worker 會對每個 Studio 請求回 403。

1. Zero Trust → **Settings** → **Authentication** → **Login methods** → **Add new** → **One-time PIN**。
2. Zero Trust → **Access controls** → **Applications** → **Add an application** → **Self-hosted**。
3. Production hostname 使用 `kamelkyp.com`；Preview 每個 PR 是獨立 Worker，subdomain 填 `kamelkyp-com-pr-*`、domain 選 `<WORKERS_DEV_SUBDOMAIN>.workers.dev`（Access 支援 subdomain 尾端萬用字元，一個 application 涵蓋所有 PR）。
4. 加入六個受保護 path（Worker 對這些路徑都要求 Access JWT，缺一個該路徑就只會回 403）：
   - `/studio`
   - `/studio/*`
   - `/api/studio/*`
   - `/admin`
   - `/admin/*`
   - `/api/admin/*`

   `/admin` 三個 path 保留：舊 `/admin` 網址已退場，但仍先經 owner 檢查才 301 到 Studio（`/api/admin/*` 已無路由）。
   Production 另加第七個 path `/studio.data`：從其他 Studio 頁按側欄 Home 時，React Router 會抓 `/studio.data`，
   它不在 `/studio`、`/studio/*` 內（部署的 Preview 已證實會直接到 Worker），沒有 Access header 就只會得到 403。
   Preview 保持六個 path，讓部署後的 E2E 能驗證 Worker 自己對 `/studio.data` 的 403（見下方）。
   代價只在 Preview：從其他 Studio 頁按側欄 Home 會得到這個 403（Studio 顯示「Sign in to open the Studio」），
   重新整理或直接開 `/studio` 則正常；側欄 Home 的檢查因此在 Production 部署後做（`release-checklist.md` D）。
5. Application session duration 設為 8 hours（Dashboard 沒有 8 hours 選項時選 **Custom duration** 填 `8h`）。
6. 建立 **Allow** policy：
   - Include selector：**Emails**
   - Value：`kevinyaungputra@gmail.com`
   - Require selector：**Login Methods** → One-time PIN
7. 不要用「Include → Login Methods → One-time PIN」代替 email 規則，否則任何有效 email 都可能通過。
8. 確認沒有 Bypass policy、Everyone rule 或全網域 email rule。
9. Application 頁面複製 Audience tag，設為對應 GitHub Environment variable `ACCESS_AUD`。
10. Zero Trust 顯示的 team domain 必須以完整 HTTPS issuer 保存，例如 `https://<team>.cloudflareaccess.com`，設為 `ACCESS_TEAM_DOMAIN`。

設定後，部署的 Preview 對未登入的 Studio／admin 請求由 Access 回 302 到 `ACCESS_TEAM_DOMAIN` 的 `/cdn-cgi/access/login/<preview hostname>`，Worker 收不到請求；preview workflow 以 `E2E_ACCESS_GATE=1` 與 `ACCESS_TEAM_DOMAIN` 驗證這個 302（`tests/e2e/helpers/owner-gate.ts`：其他 team 或其他 host 的 302 都不算通過）。loopback E2E 前面沒有 Access，仍由 Worker 回 403。

React Router 的 single-fetch data URL `/studio.data`、`/admin.data` 不在上述六個 path 內，部署後仍直接到 Worker，由 Worker 的 owner 檢查回 403；`tests/e2e/studio-access.spec.ts` 在 loopback 與部署的 Preview 都驗證這個 403。若日後也把 `/studio.data` 加進 Preview application，要同時把它從該測試的「Worker itself」清單移到 `STUDIO_PATHS`。

官方文件：<https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/>、<https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>、<https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/>。

## 6. GitHub Environment 完整清單

在 repository → **Settings** → **Environments** 建立 `preview` 與 `production`。

Secrets（兩個 Environment 各自設定）：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`
- `TURNSTILE_SECRET`
- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_HMAC_SECRET`
- `CSRF_SECRET`

Variables：

- `APP_ORIGIN`：Production 固定 `https://kamelkyp.com`
- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `ADMIN_EMAIL`：`kevinyaungputra@gmail.com`
- `TURNSTILE_SITE_KEY`
- `RATE_LIMIT_NAMESPACE_ID`：Preview 建議 `41004`，Production 建議 `41005`
- `WORKERS_DEV_SUBDOMAIN`：只需 Preview
- `LEGAL_REVIEW_CONFIRMED`：只需 Production；法務確認前保持 `false`（production verifier 會拒絕 `false`，因此法務確認前不會部署）
- `R2_MEDIA_BUCKET`：Production 必填（`scripts/verify-production-config.mjs`）；Content Studio 媒體 bucket，例如 `kamelkyp-media`。Preview 不設定時上傳功能關閉。
- `MEDIA_PUBLIC_BASE_URL`：Production 必填；媒體公開 HTTPS 網址，建議以 R2 custom domain 提供，例如 `https://media.kamelkyp.com`。
- `MEDIA_CORS_HOSTS`、`IMAGE_TRANSFORMATIONS`：選填；未設定時不加 CORS host，image transformations 為 `off`。

`RATE_LIMIT_NAMESPACE_ID` 必須是正整數、兩環境不同；生成設定只允許一個 `SUBMISSION_RATE_LIMITER`，每 60 秒 10 次。

Environment protection：

- `preview`：只允許 `refs/pull/*/merge`，建議加入 required reviewer 後才提供部署 secrets。
- `production`：只允許 `main`，設定 Kamel 為 required reviewer；若有第二位可信任 reviewer，啟用 prevent self-review。

GitHub 官方說明：<https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>。

## 7. Custom Domain、TLS 與部署後驗證

Production renderer 會產生：

```json
{"routes":[{"pattern":"kamelkyp.com","custom_domain":true}]}
```

Custom Domain 由 Cloudflare 自動建立 DNS 與憑證，但 HTTP 與 HTTPS 都會送進 Worker，Worker 本身不把 `http://` 轉到 `https://`。首次上線前在 Cloudflare Dashboard → kamelkyp.com → SSL/TLS → Edge Certificates 開啟 **Always Use HTTPS**（一次性 zone 設定）；沒開時 `http://kamelkyp.com` 會以明文回應頁面，Worker 送出的 HSTS 在 HTTP 回應中也不會被瀏覽器採用。

正式部署後確認：

1. `https://kamelkyp.com/health` 回傳 healthy JSON。
2. `https://kamelkyp.com/zh` 與 `/en` 可開啟。
3. `/studio` 與 `/admin` 未登入會由 Access 阻擋；正確 email OTP 後 Worker JWT 驗證仍會檢查 email 與 audience：`/studio` 可開啟，從其他 Studio 頁按側欄 Home 會回到 Studio 首頁，`/admin` 301 到 `/studio`。
4. Production response 有 HSTS、nonce CSP、`frame-ancestors 'none'`。
5. Cloudflare Worker secrets 名稱恰為四個核准名稱；Dashboard 只核對名稱，不複製或顯示值。
6. `http://kamelkyp.com/zh` 回 301 到 `https://kamelkyp.com/zh`（production workflow 的 smoke test 也會檢查）。

Custom Domain 官方文件：<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>。

## 8. D1 migration 與回復

Production workflow 先執行 Time Travel info，把 migration 前 bookmark 寫入 Actions summary，再套用 migration。Time Travel bookmark 有平台保存期限；不要把它視為永久備份。

若 migration 後資料需要人工回復，先停止新寫入、確認 bookmark，才依 Cloudflare 手冊執行 restore。Restore 會覆寫資料，必須由 Kamel 明確確認，不能由 workflow 自動執行。

官方文件：<https://developers.cloudflare.com/d1/reference/time-travel/>、<https://developers.cloudflare.com/d1/reference/migrations/>。
