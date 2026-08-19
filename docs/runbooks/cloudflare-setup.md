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

Preview 與 Production 使用不同的 Self-hosted application、Audience tag；設定方法相同。

1. Zero Trust → **Settings** → **Authentication** → **Login methods** → **Add new** → **One-time PIN**。
2. Zero Trust → **Access controls** → **Applications** → **Add an application** → **Self-hosted**。
3. Production hostname 使用 `kamelkyp.com`；Preview 使用實際 Preview workers.dev hostname。
4. 加入三個受保護 path：
   - `/admin`
   - `/admin/*`
   - `/api/admin/*`
5. Application session duration 設為 8 hours。
6. 建立 **Allow** policy：
   - Include selector：**Emails**
   - Value：`kevinyaungputra@gmail.com`
   - Require selector：**Login Methods** → One-time PIN
7. 不要用「Include → Login Methods → One-time PIN」代替 email 規則，否則任何有效 email 都可能通過。
8. 確認沒有 Bypass policy、Everyone rule 或全網域 email rule。
9. Application 頁面複製 Audience tag，設為對應 GitHub Environment variable `ACCESS_AUD`。
10. Zero Trust 顯示的 team domain 必須以完整 HTTPS issuer 保存，例如 `https://<team>.cloudflareaccess.com`，設為 `ACCESS_TEAM_DOMAIN`。

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
- `LEGAL_REVIEW_CONFIRMED`：只需 Production；法務確認前保持 `false`

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

Custom Domain 由 Cloudflare 自動建立 DNS 與憑證。正式部署後確認：

1. `https://kamelkyp.com/health` 回傳 healthy JSON。
2. `https://kamelkyp.com/zh` 與 `/en` 可開啟。
3. `/admin` 未登入會由 Access 阻擋；正確 email OTP 後 Worker JWT 驗證仍會檢查 email 與 audience。
4. Production response 有 HSTS、nonce CSP、`frame-ancestors 'none'`。
5. Cloudflare Worker secrets 名稱恰為四個核准名稱；Dashboard 只核對名稱，不複製或顯示值。

Custom Domain 官方文件：<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>。

## 8. D1 migration 與回復

Production workflow 先執行 Time Travel info，把 migration 前 bookmark 寫入 Actions summary，再套用 migration。Time Travel bookmark 有平台保存期限；不要把它視為永久備份。

若 migration 後資料需要人工回復，先停止新寫入、確認 bookmark，才依 Cloudflare 手冊執行 restore。Restore 會覆寫資料，必須由 Kamel 明確確認，不能由 workflow 自動執行。

官方文件：<https://developers.cloudflare.com/d1/reference/time-travel/>、<https://developers.cloudflare.com/d1/reference/migrations/>。
