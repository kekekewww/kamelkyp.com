# KamelKyp 後台、安全性與正式上線實作計畫

> **For Codex:** 本計畫必須搭配 superpowers:executing-plans 或 superpowers:subagent-driven-development 逐項執行。每個任務遵守紅燈、綠燈、重構循環；不得跳過測試與雲端驗證。

**Goal:** 完成僅供 Kamel 使用的 /admin 後台、Cloudflare Access 驗證、內容與價格版本發布、案件狀態及資料清理、安全標頭、端到端測試與 kamelkyp.com 正式上線流程。

**Architecture:** Cloudflare Access 在邊緣以電子郵件驗證碼保護 /admin、/admin/*、/api/admin/*，Worker 再驗證 Access JWT、管理員信箱與 CSRF。後台只編輯結構化內容與外部連結，不接受檔案上傳；草稿、預覽、發布、下架皆保留不可變版本。永久案件表只保存案件編號、服務類型、鎖定價格、日期與狀態；暫存清理狀態位於 case_runtime，完成 Google Form、Sheet、Gmail 與 Apps Script ledger 清理後刪除。GitHub Actions 在 Preview 驗證，Production GitHub Environment 經人工核准後才遷移 D1 並部署自訂網域。

**Tech Stack:** React Router 8、React 19、Cloudflare Workers、Cloudflare Access、D1、Zod 4、jose 6、Vitest Workers pool、Playwright、GitHub Actions、Wrangler 4。

**前置計畫：**

- 2026-08-10-01-cloud-foundation.md
- 2026-08-10-02-public-content-design-system.md
- 2026-08-10-03-media-preview.md
- 2026-08-10-04-pricing-commission-flow.md
- 2026-08-10-05-google-sync-data-lifecycle.md

**分支：** codex/06-admin-security-release

---

## Task 1：建立雙層後台驗證與 CSRF 防護

**Files:**

- Create: app/lib/auth/access-jwt.server.ts
- Create: app/lib/auth/csrf.server.ts
- Create: app/lib/auth/admin.server.ts
- Create: app/routes/admin/layout.tsx
- Create: app/routes/admin/index.tsx
- Create: tests/worker/access-jwt.test.ts
- Create: tests/worker/csrf.test.ts
- Create: tests/worker/admin-guard.test.ts
- Create: app/lib/cloudflare/context.ts
- Create: tests/helpers/test-env.ts
- Modify: app/lib/env.server.ts
- Modify: app/routes.ts
- Modify: scripts/render-wrangler-config.mjs
- Modify: scripts/render-worker-secrets.mjs
- Modify: .github/workflows/deploy-preview.yml
- Modify: tests/unit/config-contract.test.ts

### Step 1：先寫 Access JWT 失敗測試

tests/worker/access-jwt.test.ts 使用測試內生成的簽章金鑰及注入式 JwtVerifier，不連外抓取 JWKS。涵蓋：

- 缺少 Cf-Access-Jwt-Assertion 時回傳 403。
- audience 不等於 ACCESS_AUD 時回傳 403。
- issuer 不等於 ACCESS_TEAM_DOMAIN 時回傳 403。
- email 不等於 ADMIN_EMAIL，大小寫正規化後仍不相符時回傳 403。
- type 不是 app、缺少 sub、token 過期時回傳 403。
- 合法 token 回傳只含 subject 與正規化 email 的 AdminIdentity。
- 所有拒絕回應只顯示一般訊息，不回顯 token 或 claim。

核心測試介面：

~~~ts
export type AdminIdentity = {
  subject: string;
  email: string;
};

export type JwtVerifier = (
  token: string,
  config: {
    issuer: string;
    audience: string;
  },
) => Promise<Record<string, unknown>>;

export async function verifyAccessRequest(
  request: Request,
  env: Env,
  verifier?: JwtVerifier,
): Promise<AdminIdentity>;
~~~

### Step 2：確認測試為紅燈

Run: npm run test:worker -- tests/worker/access-jwt.test.ts

Expected: FAIL，因 access-jwt.server.ts 尚不存在。

### Step 3：實作 Access JWT 驗證

app/lib/auth/access-jwt.server.ts：

- 從 Cf-Access-Jwt-Assertion 讀 token。
- 以 jose 的 createRemoteJWKSet 與 jwtVerify 驗證。
- JWKS URL 固定為 ACCESS_TEAM_DOMAIN + /cdn-cgi/access/certs。
- issuer 固定為 ACCESS_TEAM_DOMAIN；audience 固定為 ACCESS_AUD。
- claim 以 Zod 驗證 sub、email、type；type 必須為 app。
- email 經 trim 與 toLowerCase 後必須等於 ADMIN_EMAIL。
- 以 module-level Map 依 team domain 快取 RemoteJWKSet。
- 不記錄 token、claims 或管理員信箱。
- 驗證錯誤統一丟出 Response("Forbidden", { status: 403 })。

新增 Env 欄位：

~~~ts
ACCESS_TEAM_DOMAIN: string;
ACCESS_AUD: string;
ADMIN_EMAIL: string;
CSRF_SECRET: string;
~~~

scripts/render-wrangler-config.mjs 只把 ACCESS_TEAM_DOMAIN、ACCESS_AUD、ADMIN_EMAIL 當 vars，並把 secrets.required 擴充為 TURNSTILE_SECRET、APPS_SCRIPT_URL、APPS_SCRIPT_HMAC_SECRET、CSRF_SECRET 四個固定名稱；scripts/render-worker-secrets.mjs 使用相同 allowlist。CSRF_SECRET 只由 Preview GitHub Environment secret 進入 mode-0600 的暫存 secrets file，再透過 `wrangler deploy --secrets-file` 原子部署；值不寫入產生的 Wrangler 設定、Log 或 artifact。tests/unit/config-contract.test.ts 驗證兩份 allowlist 完全一致及缺值時 fail closed。

app/lib/cloudflare/context.ts 接手 Plan 01 原本放在 env.server.ts 的 React Router module augmentation；env.server.ts 只保留 Env。固定 shape 為 cloudflare.env、cloudflare.ctx，Task 5 再加 cloudflare.security.nonce，避免兩個檔案重複宣告不一致的 AppLoadContext。

### Step 4：先寫 CSRF 紅燈測試

tests/worker/csrf.test.ts 涵蓋：

- 合法 token、相同管理員 subject、相同 APP_ORIGIN、30 分鐘內有效。
- 過期 token、不同 subject、簽章被竄改、錯誤 Origin、缺少 Origin 全部拒絕。
- token 可重送一次，因管理操作皆由資料庫版本與 idempotency 保護；不建立 server session。
- token 內容只包含隨機 nonce 與到期時間，不含 email。

公開介面：

~~~ts
export function createCsrfToken(input: {
  subject: string;
  secret: string;
  now: Date;
  nonce?: Uint8Array;
}): Promise<string>;

export function verifyCsrfToken(input: {
  token: string;
  subject: string;
  secret: string;
  origin: string | null;
  expectedOrigin: string;
  now: Date;
}): Promise<void>;
~~~

### Step 5：實作無狀態 CSRF

app/lib/auth/csrf.server.ts：

- token 格式為 base64url(payload) + "." + base64url(HMAC-SHA-256)。
- payload 是 { nonce, expiresAt }；預設效期 30 分鐘。
- HMAC canonical input 同時包含管理員 subject，避免跨身分使用。
- 使用 crypto.subtle 與 timing-safe byte comparison。
- 所有 POST、PUT、PATCH、DELETE 的後台 action 必須檢查 Origin 與隱藏欄位 csrfToken。
- GET 不修改狀態。

app/lib/auth/admin.server.ts 提供：

~~~ts
export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<AdminIdentity>;

export async function requireAdminMutation(
  request: Request,
  env: Env,
  formData: FormData,
): Promise<AdminIdentity>;
~~~

requireAdminMutation 先驗 Access，再驗 Origin 與 CSRF。

### Step 6：建立後台 layout 與路由防線

app/routes/admin/layout.tsx loader 呼叫 requireAdmin，建立 CSRF token，並只把 token 與管理員顯示名稱傳到頁面。index.tsx 顯示：

- 內容
- 服務與價格
- 條款
- 作品與媒體
- 連結與 Footer
- 案件
- 待清理資料

app/routes.ts 加入 /admin layout 與 index。任何子路由都必須位於受保護 layout 下，但每一個 action 仍獨立呼叫 requireAdminMutation。

Cloudflare Access runbook 的最終設定必須保護：

- kamelkyp.com/admin
- kamelkyp.com/admin/*
- kamelkyp.com/api/admin/*

### Step 7：執行驗證並提交

Run:

- npm run typecheck
- npm run test:worker -- tests/worker/access-jwt.test.ts tests/worker/csrf.test.ts tests/worker/admin-guard.test.ts
- npm run format:check

Expected: 全部 PASS。

Commit:

~~~bash
git add app/lib/auth app/routes/admin app/routes.ts app/lib/cloudflare/context.ts scripts/render-wrangler-config.mjs tests
git commit -m "feat: protect admin routes with Access JWT and CSRF"
~~~

---

## Task 2：實作草稿、預覽、發布、編輯與下架

**Files:**

- Create: app/lib/admin/content-service.server.ts
- Create: app/lib/admin/service-catalog-service.server.ts
- Create: app/lib/admin/term-service.server.ts
- Create: app/lib/admin/block-form.ts
- Create: app/components/admin/AdminShell.tsx
- Create: app/components/admin/BlockEditor.tsx
- Create: app/components/admin/PublishPanel.tsx
- Create: app/routes/admin/content-index.tsx
- Create: app/routes/admin/content-edit.tsx
- Create: app/routes/admin/content-preview.tsx
- Create: app/routes/admin/services.tsx
- Create: app/routes/admin/terms.tsx
- Create: app/styles/admin.css
- Create: migrations/0004_admin_revision.sql
- Create: tests/worker/admin-publication.test.ts
- Create: tests/e2e/admin-content.spec.ts
- Modify: app/routes.ts
- Modify: app/root.tsx

### Step 1：寫版本不可變測試

tests/worker/admin-publication.test.ts 建立以下情境：

1. zh locale 首頁目前發布 v1。
2. 建立 v2 草稿並編輯時，公開頁仍讀到 v1。
3. 預覽頁讀到 v2。
4. 發布 v2 後，公開頁原子切換至 v2。
5. 再次編輯時建立 v3 草稿，不修改 v2。
6. 下架後公開 repository 回傳未發布，但 v1、v2、v3 仍可在後台讀取。
7. en 價格或內容發布不影響 zh 指標。
8. 相同 versionId 重送發布不建立重複版本。
9. 已發布版本不可 UPDATE 或 DELETE。
10. 非管理員不能讀草稿與預覽。

Plan 01 已建立 content_publications 指標；本 migration 只加入草稿 optimistic locking 與查詢索引，不重建既有資料表：

~~~sql
-- migrations/0004_admin_revision.sql
ALTER TABLE content_versions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS content_versions_lookup
  ON content_versions(entry_id, locale, state, created_at DESC);
~~~

content_versions 既有 state 僅為 draft、published。公開狀態由 content_publications 的 entry_id + locale 指標決定；舊 published 版本保持不可變但不再被指標指向。

### Step 2：確認版本測試為紅燈

Run: npm run test:worker -- tests/worker/admin-publication.test.ts

Expected: FAIL，因 admin service 尚未實作。

### Step 3：實作內容服務

app/lib/admin/content-service.server.ts 提供：

~~~ts
export async function createDraft(input: {
  db: D1Database;
  entryId: string;
  locale: Locale;
  baseVersionId?: string;
}): Promise<ContentVersion>;

export async function saveDraft(input: {
  db: D1Database;
  versionId: string;
  expectedRevision: number;
  blocks: ContentBlock[];
  seo: SeoFields;
}): Promise<ContentVersion>;

export async function publishDraft(input: {
  db: D1Database;
  versionId: string;
  now: Date;
}): Promise<void>;

export async function unpublishContent(input: {
  db: D1Database;
  entryId: string;
  locale: Locale;
}): Promise<void>;
~~~

規則：

- createDraft 複製 base version 成新版本。
- saveDraft 只允許 state=draft，並以 revision 做 optimistic locking。
- publishDraft 在 D1 batch 中標記新版本 published 並更新既有 publication pointer；舊 published 版本保持不可變。
- 失敗時舊公開版本不變。
- unpublish 只移除 pointer，保留版本。
- block 只允許既定 union：heading、paragraph、list、cta、media、linkGroup、quote、serviceSummary。
- 禁止 rawHtml、script、style、事件屬性。
- 所有公開頁仍經原有 content-repository 讀 publication pointer。

### Step 4：實作結構化編輯 UI

BlockEditor.tsx 使用具名欄位，不使用 contenteditable 或 HTML textarea：

- 新增、刪除、上移、下移區塊。
- 文字、標題階層、清單、CTA、媒體 URL、連結群組。
- 每次 mutation 帶 versionId、revision、csrfToken。
- 儲存成功後使用新 revision。
- stale revision 顯示「內容已在其他頁籤更新，請重新載入」，不自動覆寫。
- mobile 後台使用單欄；desktop 使用導覽側欄與主編輯欄。
- 不提供任何 input[type=file] 或拖曳上傳。

content-edit.tsx 處理草稿；content-preview.tsx 是 admin-only、noindex 的實際公開組件預覽。PublishPanel 顯示：

- 草稿版本
- 目前公開版本
- 最後發布時間
- 預覽
- 發布
- 下架

### Step 5：實作服務價格與條款版本發布

service-catalog-service.server.ts：

- 新價格只能 INSERT price_versions。
- 服務內容可由後台修改，price formula kind 只能從程式定義的 enum 選擇。
- 發布後只影響後續新表單；已產生的表單草稿在重新開啟時重新計價，送出成功時鎖定。
- 服務 ID 不可在 UI 自訂，以免破壞表單 schema。
- TWD 顯示整數，USD 使用當次 FX snapshot 計算。

term-service.server.ts：

- 條款以 locale 與 version 管理。
- 發布按鈕必須勾選 legalReviewConfirmed。
- 後端再次驗證該欄位；未勾選回傳 422。
- 發布建立新 term version，不覆寫舊版。
- 表單送出保留 acceptedTermVersionId。
- UI 明示「此勾選不取代專業法律意見」。

測試新增：

- 舊案件繼續引用舊價格及條款版本。
- 價格發布不回溯改價。
- 未完成法律確認不可發布條款。
- 編輯服務說明不改 service ID。

### Step 6：加入 E2E 測試

tests/e2e/admin-content.spec.ts 在 Preview 測試專用 Access 驗證器下執行：

- 未驗證 /admin 回 403。
- 建立 zh locale 首頁草稿、預覽、發布，再由公開頁讀到。
- 下架後公開頁使用明確 404 或未發布狀態。
- en 與 zh 可獨立發布。
- 後台沒有檔案上傳控制項。
- 第二頁籤以 stale revision 儲存時不覆寫第一頁籤。
- 條款發布少勾 legalReviewConfirmed 時顯示欄位錯誤。

測試專用驗證器只能在 MODE=test 且 hostname 為 localhost 時啟用；production build 檢查發現開關時直接失敗。

### Step 7：執行驗證並提交

Run:

- npm run typecheck
- npm run test:worker -- tests/worker/admin-publication.test.ts
- npm run test:e2e -- tests/e2e/admin-content.spec.ts
- npm run format:check

Expected: 全部 PASS。

Commit:

~~~bash
git add app/lib/admin app/components/admin app/routes/admin app/styles/admin.css app/routes.ts app/root.tsx migrations/0004_admin_revision.sql tests
git commit -m "feat: add versioned admin publishing workflow"
~~~

---

## Task 3：實作作品、媒體、Footer、Blog 與連結管理

**Files:**

- Create: app/lib/admin/media-content-service.server.ts
- Create: app/components/admin/ExternalMediaFields.tsx
- Create: app/components/admin/LinkGroupEditor.tsx
- Create: app/routes/admin/works.tsx
- Create: app/routes/admin/links.tsx
- Create: app/routes/admin/posts.tsx
- Create: app/routes/admin/post-edit.tsx
- Create: tests/unit/admin-block-form.test.ts
- Create: tests/worker/admin-media-content.test.ts
- Create: tests/e2e/admin-media-content.spec.ts
- Modify: app/routes.ts
- Modify: app/lib/content/content-block.ts
- Modify: app/lib/media/parse-media-url.ts

### Step 1：寫 URL-only 內容驗證測試

tests/unit/admin-block-form.test.ts 涵蓋：

- YouTube、youtube-nocookie、Google Drive 預覽、GitHub 附加檔案、Cloudflare R2 公開串流 URL、Dropbox、MediaFire 與一般 https 連結。
- 可選 title、description、thumbnailUrl、credit、publishedAt、tags。
- javascript:、data:、非 HTTPS、生 HTML、iframe HTML 字串全部拒絕。
- 作品可使用 audio、video、embed、externalLink。
- Dropbox、MediaFire 等不可安全內嵌者固定降級為外部連結。
- link group 可有任意數量項目，不限制三個。
- social、workRepository、otherWebsite、footer、postReference 均為合法 link group 類型。
- 所有媒體欄位皆選填；只有在新增某個媒體項目時 URL 必填。
- 作品層級的標題、日期、服務類型、說明、Credit、封面、Tags、精選、媒體與 SEO 也全部選填；沒有媒體仍可發布文字作品，完全沒有標題時公開元件使用中英文 Untitled／未命名作品作為 accessible fallback，不強迫寫回資料。
- parser 不接受任何 File、Blob 或 base64 欄位。

### Step 2：確認測試為紅燈

Run: npm run test:unit -- tests/unit/admin-block-form.test.ts

Expected: FAIL，因後台表單 schema 尚未加入。

### Step 3：實作結構化媒體與連結服務

media-content-service.server.ts 重用 parseMediaUrl 與 content versioning：

~~~ts
export type AdminMediaInput = {
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  credit?: string;
  publishedAt?: string;
  tags?: string[];
};

export type LinkGroupInput = {
  key: "social" | "workRepository" | "otherWebsite" | "footer" | "postReference";
  label: LocalizedText;
  links: ExternalLink[];
};
~~~

規則：

- 只儲存 URL 及描述 metadata。
- 不下載、代理、複製或上傳外部檔案。
- R2 只接受 Kamel 在後台指定的公開串流 URL。
- 直接音訊是否可 WaveSurfer 預覽由公開播放器 runtime CORS 檢查決定；後台儲存不宣稱一定可內嵌。
- 任何不可辨識或不可安全內嵌 URL 都可保存為 externalLink，但 UI 清楚顯示「只會提供外部連結」。
- 所有外部連結以 rel="noopener noreferrer" 開啟。
- thumbnailUrl 也必須是 HTTPS。
- Footer link group 可持續增加，公開版在桌面多欄、手機 accordion 呈現。

### Step 4：建立作品、連結與 Blog 後台

admin/works.tsx：

- 編輯作品標題、描述、credit、媒體 URL、可選 thumbnail、服務標籤。
- 草稿、預覽、發布、下架。
- 不提供上傳。

admin/links.tsx：

- 社群、作品存放處、其他網站、Footer 分組。
- 可新增任意數量。
- 可排序、停用、重新啟用。
- Footer 預留聯絡方式、服務、法律、作品、社群、其他網站欄，但空分組不渲染。

admin/posts.tsx 與 post-edit.tsx：

- Blog 式文章、個人發布事項、社群貼文摘要、外部內容連結。
- zh 與 en 獨立草稿及發布。
- 每篇有 slug、標題、摘要、日期、區塊與可選外部參考。
- slug 只允許小寫 ASCII、數字與連字號；locale 不是 slug 的一部分。
- 不提供留言系統。
- publishedAt 可排未來時間，但計畫不建自動排程；到期前仍是草稿，必須由 Kamel 手動發布。

### Step 5：加入測試

tests/worker/admin-media-content.test.ts：

- 保存外部 URL 後不產生 R2 put 或任何下載請求。
- invalid scheme 回 422。
- link group 超過三個仍全部保留。
- 空 Footer 分組不公開。
- 已發布作品修改建立新草稿。
- 所有作品欄位留空仍可建立版本並發布；公開頁使用未命名 fallback，沒有破版或空 accessible name。
- Blog slug 在同 locale 唯一。

tests/e2e/admin-media-content.spec.ts：

- 新增 YouTube 作品後在預覽顯示 click-to-load。
- 新增 Dropbox 後只顯示外部連結。
- 新增 8 個 Footer 連結，desktop 與 mobile 都可到達。
- 後台所有 media 畫面沒有 file input。
- Blog 草稿不公開；發布後 /zh/posts/:slug 與 /en/posts/:slug 按各自版本顯示。

### Step 6：執行驗證並提交

Run:

- npm run typecheck
- npm run test:unit -- tests/unit/admin-block-form.test.ts
- npm run test:worker -- tests/worker/admin-media-content.test.ts
- npm run test:e2e -- tests/e2e/admin-media-content.spec.ts
- npm run format:check

Expected: 全部 PASS。

Commit:

~~~bash
git add app/lib/admin app/components/admin app/routes/admin app/routes.ts app/lib/content app/lib/media tests
git commit -m "feat: manage external media links works and posts"
~~~

---

## Task 4：建立最小案件後台與可證明的資料清理

**Files:**

- Create: app/lib/admin/case-service.server.ts
- Create: app/lib/admin/cleanup-service.server.ts
- Create: app/routes/admin/cases.tsx
- Create: app/routes/admin/case-status.ts
- Create: app/routes/admin/student-discount.ts
- Create: app/routes/admin/cleanup-confirm.ts
- Create: app/components/admin/CaseTable.tsx
- Create: app/components/admin/CleanupChecklist.tsx
- Create: tests/worker/admin-cases.test.ts
- Create: tests/worker/admin-student-discount.test.ts
- Create: tests/worker/admin-cleanup.test.ts
- Create: tests/e2e/admin-cases.spec.ts
- Modify: app/routes.ts
- Modify: app/lib/integrations/google-submission-gateway.server.ts
- Modify: integrations/apps-script/Code.gs
- Modify: tests/apps-script/Code.test.ts

### Step 1：寫最小揭露測試

tests/worker/admin-cases.test.ts：

- listCases 只回傳 caseId、serviceId、lockedPriceMinor、currency、submittedAt、status。
- 不回傳稱呼、email、聯絡帳號、身分名稱、年齡確認、學生證明連結、工程連結、用途或條款勾選細節。
- 排序預設 submittedAt 新到舊。
- 可依 status 與 serviceId 篩選。
- 可更新案件狀態；永久表不增加 updatedAt、備註或其他欄位。
- status 只能是 pending_review、pending_deposit、in_production、preview_approval、pending_balance、paused、delivered、cancelled。
- 不存在案件回 404。
- action 必須通過 Access、CSRF 與 Origin 驗證。
- listCases 的永久列仍只回六欄；listPendingStudentPriceReviews 另從 case_runtime 回 caseId、currency、standardPriceMinor、studentPriceMinor，不回學生姓名、證明 URL 或其他表單內容。
- resolveStudentDiscount(accepted=true) 保留 studentPriceMinor；accepted=false 把 cases.locked_price_minor 改為 standardPriceMinor。兩種結果都把 student_review_state 改為 none 並把兩個候選價設為 null。
- 一般價與學生價必須使用送出時同一個 currency 與 FX snapshot；後台不重新抓匯率。
- 已 resolved 或不存在的案件重送回 409，不可任意改價。

### Step 2：寫清理紅燈測試

tests/worker/admin-cleanup.test.ts 與 Apps Script test 涵蓋：

1. 只有 delivered、cancelled 或 paused 且 cleanupDueAt 已到期的案件可確認清理。
2. Kamel 必須勾選 Google Form/Sheet 已刪、Gmail 已刪、其他含敏感資料副本已刪三項。
3. 未全勾回 422，不刪任何 runtime data。
4. Worker 先向 Apps Script 傳送簽章 operation=cleanup_ledger。
5. Apps Script 只刪除 case:{caseId} 的 Script Property，不碰其他案件。
6. Apps Script 清理成功後，Worker 才刪 submission_attempts、case_runtime 及其他該案件暫存技術 metadata。
7. cases 永久紀錄仍存在且只含六個欄位。
8. Apps Script 失敗時保留 runtime data、顯示可重試狀態，絕不假裝完成。
9. 重送 cleanup_ledger 是 idempotent。
10. cleanup action 不會自行刪除 Google Form 回應、Sheet row 或 Gmail；這些是 Kamel 手動確認項目。

### Step 3：確認測試為紅燈

Run:

- npm run test:worker -- tests/worker/admin-cases.test.ts tests/worker/admin-student-discount.test.ts tests/worker/admin-cleanup.test.ts
- npm run test:apps-script

Expected: FAIL，因案件與清理 service 尚未存在。

### Step 4：實作案件服務

case-service.server.ts：

~~~ts
export type AdminCaseRow = {
  caseId: string;
  serviceId: ServiceId;
  lockedPriceMinor: number;
  currency: Currency;
  submittedAt: string;
  status: CaseStatus;
};

export async function listCases(input: {
  db: D1Database;
  status?: CaseStatus;
  serviceId?: ServiceId;
  limit: number;
  cursor?: string;
}): Promise<{ rows: AdminCaseRow[]; nextCursor?: string }>;

export async function updateCaseStatus(input: {
  db: D1Database;
  caseId: string;
  status: CaseStatus;
  now: Date;
}): Promise<void>;

export async function listPendingStudentPriceReviews(
  db: D1Database,
): Promise<Array<{
  caseId: string;
  currency: Currency;
  standardPriceMinor: number;
  studentPriceMinor: number;
}>>;

export async function resolveStudentDiscount(input: {
  db: D1Database;
  caseId: string;
  accepted: boolean;
}): Promise<void>;
~~~

- select 明列六欄，禁止 SELECT *。
- pagination cursor 由 submittedAt + caseId 組成並簽章，避免任意 SQL。
- limit 限 1 到 100。
- 進入 delivered、cancelled、paused 時，在 case_runtime 設 cleanupDueAt = now + 7 days。
- 離開 paused 時重新計算或清除 cleanupDueAt。
- cases 只更新 status；updatedAt 放在 case_runtime。
- 列表 UI 顯示有限資訊，使 Kamel 可用編號與日期辨識。
- 不建立案件詳細內容頁，不讀 Google Form 內容。
- Kamel 先在 Google Form 人工確認已遮蔽的學生證明，再由 student-discount action 選擇接受或拒絕；網站不自行判定。
- action 完成後 UI 提醒 Kamel 依原約定用 Email 告知結果；網站不自動寄客戶確認信。

### Step 5：擴充簽章 gateway 的 ledger 清理操作

Apps Script envelope payload 加入 discriminated union：

~~~ts
type AppsScriptOperation =
  | {
      operation: "submit";
      caseId: string;
      submission: GoogleFormSubmission;
    }
  | {
      operation: "cleanup_ledger";
      caseId: string;
    };
~~~

Code.gs：

- submit 延續原有 Google Form 與 Gmail 邏輯。
- cleanup_ledger 驗證同一 HMAC、timestamp、nonce 與 caseId 格式。
- 執行 PropertiesService.getScriptProperties().deleteProperty("case:" + caseId)。
- 回傳 { ok: true, operation: "cleanup_ledger", caseId }。
- 不接受 client 直接呼叫；只有 Worker 持有 HMAC secret。
- 不列印 payload 或 caseId 到 log。

cleanup-service.server.ts：

~~~ts
export async function confirmCleanup(input: {
  db: D1Database;
  caseId: string;
  checklist: {
    googleRecordsDeleted: true;
    gmailDeleted: true;
    otherSensitiveCopiesDeleted: true;
  };
  gateway: {
    cleanupLedger(input: { caseId: string; now: string }): Promise<void>;
  };
  now: Date;
}): Promise<void>;
~~~

D1 transaction 次序：

1. 驗證 due、checklist，並確認 student_review_state 已不是 pending。
2. 呼叫 gateway.cleanupLedger。
3. gateway 成功後 transaction DELETE submission_attempts 與 case_runtime。
4. 確認 cases 還在。
5. 任一步失敗，回 503 可重試且不標記完成。

外部 Google 資料刪除屬 Kamel 手動動作，runbook 必須提醒 Gmail 垃圾桶與 Google Drive 垃圾桶仍有平台保留期；網站只能記錄 Kamel 已執行確認，不宣稱即時物理抹除。

### Step 6：建立案件與清理 UI

admin/cases.tsx：

- 表格只顯示案件編號、服務、價格、日期、狀態。
- 狀態 dropdown 透過 case-status action 更新。
- 若另行查詢到 student review pending，只在相同案件列顯示一般價、學生價與「接受／拒絕學生優惠」；不顯示證明或身份資料，選擇後欄位立即消失。
- mobile 改為卡片，但欄位相同。
- 逾期可清理項目顯示「確認清理」。
- CleanupChecklist 三項全部勾選後才可送出。
- UI 顯示「網站不保存完整表單內容；請至 Google Form 查看，完成/取消/暫停後一週依流程刪除」。
- 不顯示 submission attempt、nonce、Google response ID 等技術欄位。
- 不提供 audit log 頁。

tests/e2e/admin-cases.spec.ts 另驗證 pending 學生案件只出現兩個候選價格與接受／拒絕按鈕；完成選擇後候選資料消失、永久價格正確，頁面從未顯示學生證明 URL。

### Step 7：執行驗證並提交

Run:

- npm run typecheck
- npm run test:worker -- tests/worker/admin-cases.test.ts tests/worker/admin-student-discount.test.ts tests/worker/admin-cleanup.test.ts
- npm run test:apps-script
- npm run test:e2e -- tests/e2e/admin-cases.spec.ts
- npm run format:check

Expected: 全部 PASS。

Commit:

~~~bash
git add app/lib/admin app/lib/integrations app/routes/admin app/components/admin app/routes.ts integrations/apps-script tests
git commit -m "feat: add minimal case tracking and verified cleanup"
~~~

---

## Task 5：加入 CSP nonce、安全標頭與錯誤邊界

**Files:**

- Create: app/lib/security/csp-nonce.server.ts
- Create: app/lib/security/headers.server.ts
- Create: app/lib/security/safe-error.ts
- Create: tests/unit/security-headers.test.ts
- Create: tests/worker/security-errors.test.ts
- Create: tests/e2e/security-headers.spec.ts
- Modify: workers/app.ts
- Create: app/entry.server.tsx
- Modify: app/root.tsx
- Modify: app/lib/cloudflare/context.ts

### Step 1：先寫安全標頭測試

tests/unit/security-headers.test.ts 驗證 production response：

- Content-Security-Policy:
  - default-src 'self'
  - base-uri 'self'
  - object-src 'none'
  - frame-ancestors 'none'
  - form-action 'self'
  - script-src 'self' 指定 nonce 與 https://challenges.cloudflare.com
  - frame-src 僅 www.youtube-nocookie.com、drive.google.com、challenges.cloudflare.com
  - connect-src 'self' 與 challenges.cloudflare.com
  - media-src 'self' https:
  - img-src 'self' https: data:
  - font-src 'self'
  - style-src 'self'
- 應用程式不使用 inline style attribute；所有動畫與狀態樣式使用 class 與已打包 CSS。
- Strict-Transport-Security: max-age=31536000; includeSubDomains。
- Referrer-Policy: strict-origin-when-cross-origin。
- X-Content-Type-Options: nosniff。
- Permissions-Policy 關閉 camera、microphone、geolocation、payment。
- 每個 HTML request nonce 都不同。
- nonce 同時出現在 CSP 與 React Router Scripts nonce prop。
- Preview 不設定 HSTS，production 才設定。
- CSP 不含 unsafe-eval 或 unsafe-inline。

tests/worker/security-errors.test.ts：

- Access、CSRF、D1、Apps Script、Turnstile 失敗皆不在 response 或 console log 洩漏 token、email、工程連結、表單 body。
- 公開 error boundary 顯示一般錯誤與案件編號以外的支援資訊。
- admin error boundary 不顯示 stack trace。

### Step 2：確認測試為紅燈

Run:

- npm run test:unit -- tests/unit/security-headers.test.ts
- npm run test:worker -- tests/worker/security-errors.test.ts

Expected: FAIL，因 CSP 與 safe error 尚未實作。

### Step 3：把 nonce 串過 Worker 與 React Router

csp-nonce.server.ts：

~~~ts
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toBase64Url(bytes);
}
~~~

app/lib/cloudflare/context.ts 在本 Task 把 security 加入固定 context：

~~~ts
declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
      security: { nonce: string };
    };
  }
}
~~~

workers/app.ts 每次 request：

1. 產生 nonce。
2. 把 nonce 放入 AppLoadContext 的 cloudflare.security.nonce。
3. 取得 React Router response。
4. 以新的 Headers 加上 buildSecurityHeaders({ nonce, mode })，再用原 body 建立 Response；不讀取或重建 streaming body。

建立自訂 app/entry.server.tsx，因嚴格 CSP 必須把同一 nonce 同時交給 React renderer 與 ServerRouter：

~~~tsx
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import {
  ServerRouter,
  type AppLoadContext,
  type EntryContext,
} from "react-router";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const nonce = loadContext.cloudflare.security.nonce;
  if (!nonce) throw new Error("csp_nonce_missing");

  const body = await renderToReadableStream(
    <ServerRouter
      context={routerContext}
      url={request.url}
      nonce={nonce}
    />,
    { nonce },
  );

  if (isbot(request.headers.get("user-agent") ?? "")) {
    await body.allReady;
  }
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
~~~

React Router 8 會由 ServerRouter nonce 傳遞給 Scripts 與 ScrollRestoration；root 不把 nonce 放進 loader data，也不自行產生第二個 nonce。若 context 缺少 nonce，所有環境皆失敗，不使用固定 fallback。

### Step 4：建立 CSP 與安全錯誤工具

headers.server.ts 的 allowlist 必須與 media parser 保持一致。第三方 iframe 只允許：

- https://www.youtube-nocookie.com
- https://drive.google.com
- https://challenges.cloudflare.com

一般外部 URL 不加入 frame-src，只能新頁開啟。Cloudflare R2 與 GitHub 音訊以 media-src https: 串流；若瀏覽器或遠端 CORS 阻擋，播放器降級為連結。

safe-error.ts：

- 對外只映射 status、公開錯誤碼與 locale 訊息。
- console 只記 error code、requestId、route，不記 request body、headers、query string 或 PII。
- requestId 使用 Cloudflare cf-ray，沒有時產生 UUID。
- ErrorBoundary 不渲染 stack。
- API 對 400、403、409、422、429、503 提供一致 JSON envelope。
- Cache-Control: no-store 用於 admin、commission wizard、submission API 與 error response。
- 公開已發布內容可使用短期 cache；草稿預覽一律 no-store、noindex。

### Step 5：E2E 驗證 CSP 仍可使用網站功能

tests/e2e/security-headers.spec.ts：

- 首頁無 CSP violation。
- Turnstile widget script 可載入；測試 key 流程可送出。
- YouTube click-to-load iframe 可建立。
- Google Drive click-to-load iframe 可建立。
- 外部 Dropbox 不建立 iframe。
- 音訊可串流或明確降級，不因 CSP 靜默失敗。
- /admin、表單步驟與預覽 response 為 no-store。
- production-like 設定沒有 unsafe-inline、unsafe-eval。
- 任意外站不能 frame kamelkyp.com。

### Step 6：執行驗證並提交

Run:

- npm run typecheck
- npm run test:unit -- tests/unit/security-headers.test.ts
- npm run test:worker -- tests/worker/security-errors.test.ts
- npm run test:e2e -- tests/e2e/security-headers.spec.ts
- npm run format:check

Expected: 全部 PASS。

Commit:

~~~bash
git add app/lib/security workers/app.ts app/entry.server.tsx app/root.tsx app/lib/cloudflare/context.ts tests
git commit -m "feat: enforce CSP and safe response headers"
~~~

---

## Task 6：建立雲端 E2E、正式部署與操作手冊

**Files:**

- Create: scripts/verify-production-config.mjs
- Create: .github/workflows/e2e.yml
- Create: .github/workflows/deploy-production.yml
- Create: tests/e2e/final-acceptance.spec.ts
- Create: docs/runbooks/cloudflare-setup.md
- Create: docs/runbooks/google-setup.md
- Create: docs/runbooks/release-checklist.md
- Create: docs/legal/review-checklist.md
- Modify: package.json
- Modify: scripts/render-wrangler-config.mjs
- Modify: scripts/render-worker-secrets.mjs
- Modify: wrangler.base.jsonc
- Modify: .github/workflows/deploy-preview.yml
- Modify: .gitignore
- Modify: playwright.config.ts
- Modify: README.md

### Step 1：先寫 production config contract 測試

scripts/verify-production-config.mjs 失敗條件：

- 缺少 CLOUDFLARE_ACCOUNT_ID、D1_DATABASE_ID、APP_ORIGIN、ACCESS_TEAM_DOMAIN、ACCESS_AUD、ADMIN_EMAIL、RATE_LIMIT_NAMESPACE_ID，或 RATE_LIMIT_NAMESPACE_ID 不是十進位整數。
- APP_ORIGIN 不是 https://kamelkyp.com。
- TURNSTILE_SITE_KEY 是官方測試 key。
- MODE 不是 production。
- Wrangler 設定沒有 kamelkyp.com custom domain。
- production build 含 TEST_ADMIN_BYPASS 或測試 JWT key。
- ADMIN_EMAIL 不是合法 email。
- ACCESS_TEAM_DOMAIN 不是 HTTPS team domain。
- GitHub Environment 未提供 LEGAL_REVIEW_CONFIRMED=true 時拒絕部署。

敏感值不由 config script 讀取或輸出；生成設定只宣告以下 `secrets.required` 名稱。scripts/render-worker-secrets.mjs 只從受保護的 GitHub Environment 讀值並寫入 runner 暫存檔，部署後 wrangler secret list 只比對名稱：

- TURNSTILE_SECRET
- APPS_SCRIPT_URL
- APPS_SCRIPT_HMAC_SECRET
- CSRF_SECRET

app/lib/integrations/google-submission-gateway.server.ts 在任何 fetch 前以 URL parser 強制 APPS_SCRIPT_URL 為 HTTPS；tests/worker/google-gateway.test.ts 驗證非 HTTPS secret 會被拒絕。

必備 GitHub Environment secrets（Preview 與 Production 分開設定；Production 使用正式值）：

- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- D1_DATABASE_ID
- TURNSTILE_SECRET
- APPS_SCRIPT_URL
- APPS_SCRIPT_HMAC_SECRET
- CSRF_SECRET

必備 GitHub Environment production vars：

- APP_ORIGIN
- ACCESS_TEAM_DOMAIN
- ACCESS_AUD
- ADMIN_EMAIL
- TURNSTILE_SITE_KEY
- RATE_LIMIT_NAMESPACE_ID
- LEGAL_REVIEW_CONFIRMED

### Step 2：確認 config contract 為紅燈

Run: npm run verify:production

Expected: 在沒有 production 環境變數的測試情境中以可預期錯誤碼失敗；tests/unit/config-contract.test.ts 的合法 fixture 必須 PASS。

### Step 3：建立 Preview E2E workflow

.github/workflows/e2e.yml：

- pull_request 與 workflow_dispatch 觸發。
- permissions 最小化：contents: read。
- actions/checkout@v6。
- actions/setup-node 使用 Node 24 並 npm cache。
- npm ci。
- npm run check。
- npm run test:unit。
- npm run test:worker。
- npm run test:apps-script。
- npm run build。
- 在 GitHub-hosted runner 啟動短生命週期 loopback workerd，執行 Playwright desktop chromium 與 mobile chromium；不使用 Kamel 的本機環境。
- 上傳 Playwright report 僅在失敗時；測試 fixtures 不含真實個資。
- 不使用 production D1、Gmail 或 Google Form。
- Turnstile 使用官方 always-pass 測試 key。
- Apps Script 使用測試 stub。
- playwright.config.ts 的 webServer 只啟動 127.0.0.1:8787，等待 /health；程序由 Playwright 在 job 結束時關閉。
- workflow 不部署。

package.json 新增：

~~~json
{
  "scripts": {
    "preview:ci": "wrangler dev --config .wrangler.generated.jsonc --ip 127.0.0.1 --port 8787",
    "test:e2e:ci": "playwright test --project=chromium-desktop --project=chromium-mobile",
    "verify:production": "node scripts/verify-production-config.mjs",
    "check:all": "npm run format:check && npm run typecheck && npm run test:unit && npm run test:worker && npm run test:apps-script && npm run build && npm run test:e2e:ci"
  }
}
~~~

playwright.config.ts 在 E2E_LOOPBACK=1 時使用：

~~~ts
webServer: {
  command: "npm run preview:ci",
  url: "http://127.0.0.1:8787/health",
  reuseExistingServer: false,
},
use: { baseURL: "http://127.0.0.1:8787" },
~~~

E2E workflow 先以 preview renderer 產生 .wrangler.generated.jsonc；loopback 專用 RATE_LIMIT_NAMESPACE_ID=1001 只用於本次 GitHub-hosted workerd。runner 的 .dev.vars 寫入官方 Turnstile 測試 secret、stub Apps Script URL、測試 HMAC 與 CSRF 值；這些全是非正式測試值且 job 結束即銷毀。MODE=test 與 TEST_ADMIN_BYPASS 只在這個 loopback job 啟用，production verifier 發現任一值即拒絕。

### Step 4：建立正式部署 workflow

.github/workflows/deploy-production.yml：

- 只由 main 的 workflow_dispatch 啟動。
- environment: production，GitHub Environment 設 required reviewer，由 Kamel 人工確認。
- concurrency group: production，cancel-in-progress: false。
- checkout、npm ci、全測試與 build。
- 從 production GitHub Environment vars 注入 RATE_LIMIT_NAMESPACE_ID，先執行 node scripts/render-wrangler-config.mjs production 與 node scripts/render-worker-secrets.mjs，再執行 verify:production；renderer 必須產生一個 SUBMISSION_RATE_LIMITER binding 與四個 secrets.required 名稱。
- verify:production 只檢查 required secret 名稱與環境變數是否存在，不輸出值；.wrangler.secrets.json 已在 .gitignore，且 workflow 禁止把它加入 artifact。
- 執行 wrangler d1 time-travel info DB --config .wrangler.generated.jsonc 取得 migration 前 bookmark，將 bookmark 寫入 GitHub Actions step summary。
- 再執行 wrangler d1 migrations apply DB --remote --config .wrangler.generated.jsonc；Cloudflare 另會為 migration 建立平台備份。
- migration 成功後使用 cloudflare/wrangler-action@v3 執行 `deploy --config .wrangler.generated.jsonc --secrets-file .wrangler.secrets.json`，在同一次部署更新程式與四個 Worker secrets；部署後 `wrangler secret list` 只驗證四個名稱。
- 部署目標自訂網域 kamelkyp.com。
- 部署後 health check /health 與 public smoke test。
- 任何 migration、deploy、health check 失敗，job fail；不自動回滾 D1。
- 回滾 Worker 使用上一個成功 deployment；資料需要時依 runbook 使用部署前 bookmark。
- workflow 會從受保護的 GitHub Environment secrets 原子更新 Worker secrets，但不列印值、不保存 secrets file，也不從 repository 讀取真實值。

scripts/render-wrangler-config.mjs production 輸出加入：

~~~json
{
  "routes": [
    {
      "pattern": "kamelkyp.com",
      "custom_domain": true
    }
  ]
}
~~~

Preview 與 Production 各使用不同的十進位 Rate Limiting namespace ID，由對應 GitHub Environment var RATE_LIMIT_NAMESPACE_ID 注入；生成設定必須符合 `ratelimits: [{ name: "SUBMISSION_RATE_LIMITER", namespace_id, simple: { limit: 10, period: 60 } }]`。公開 submission endpoint 使用此 binding，admin 不共用公開 bucket；production verifier 拒絕缺少、非數字或重複 binding；Preview／Production ID 不同則由 release checklist 的雙環境比對 gate 驗證。

### Step 5：撰寫 Cloudflare 設定手冊

docs/runbooks/cloudflare-setup.md 必須逐項可操作：

1. 建立 Preview 與 Production D1，填 GitHub Environment ID。
2. 在 Preview／Production GitHub Environment 分別設定 TURNSTILE_SECRET、APPS_SCRIPT_URL、APPS_SCRIPT_HMAC_SECRET、CSRF_SECRET；workflow 以 `--secrets-file` 原子部署至對應 Worker，Cloudflare Dashboard 只用來核對名稱。
3. Turnstile 建立 kamelkyp.com widget；確認不是測試 key。
4. Cloudflare Access application paths：
   - /admin
   - /admin/*
   - /api/admin/*
5. Access policy 只 Allow ADMIN_EMAIL，登入方式為 email one-time PIN。
6. Access session duration 8 小時。
7. 取得 application audience tag 與 team domain。
8. 確認未建立 bypass policy。
9. 為 Preview 與 Production 指定不同的數字 Rate Limiting namespace ID，分別寫入 GitHub Environment var RATE_LIMIT_NAMESPACE_ID；以生成設定確認 SUBMISSION_RATE_LIMITER 為每 60 秒 10 次。
10. 將 kamelkyp.com custom domain 指向 Worker。
11. 驗證 TLS、HSTS、Access 403 與 OTP。
12. 說明 Cloudflare plugin 未安裝也不影響：實際部署由 Wrangler 與 Dashboard；若未來要在 Codex 直接操作 Cloudflare 再另行安裝。

### Step 6：撰寫 Google 與法務手冊

docs/runbooks/google-setup.md：

- 建立正式 Google Form，欄位標題固定並記錄 item ID。
- 建立 Apps Script Web App，只接受 signed Worker request。
- 設 Script Property HMAC secret。
- 設 Kamel Gmail 收件地址。
- 測試 Google Form row、Gmail 通知、重送 idempotency。
- 通知信包含完整內容；使用者不收確認信。
- 案件完成、取消或暫停七日後，Kamel 手動刪 Google Form response、Sheet row、Gmail 與其他副本，再回 admin 勾選清理。
- 說明 Drive/Gmail 垃圾桶及平台備份可能有額外保留期。
- 不保存學生證明副本到網站；只保存使用者提供的連結於 Google Form，清理時一併移除。
- 不在 Apps Script log 寫 body。

docs/legal/review-checklist.md：

- 交由臺灣適用法律的專業人士確認契約成立、未成年人授權、學生身分證明、付款與取消、智慧財產權、保密、保存與刪除、跨境 USD 與 PayPal 條款。
- 確認甲方擁有人聲、原創歌曲或伴奏與分軌；Kamel 擁有工程檔。
- 確認成品交付後工程檔加購 50%、免費修改及追加費用文字。
- 分別確認「Kamel 因自身原因延遲但仍完成時，總價調整為原應付總額 60%」與「確定無法完成時退還訂金」，避免把兩種情況合併。
- 專業審查通過後才把 LEGAL_REVIEW_CONFIRMED 設為 true。
- 本 checklist 不宣稱計畫本身是法律意見。

### Step 7：加入最終驗收測試

tests/e2e/final-acceptance.spec.ts 必須驗證：

- 瀏覽器語言首次進站自動選 zh-TW 或 en，使用者切換後以 cookie 記住。
- Landing page 只顯示一次 Kamel 與楊子賢。
- desktop 自我介紹區較原 mockup 寬；mobile 為單欄響應式。
- 導覽 hover 可選服務子類型，直接點 Mixing 只看兩種混音，直接點 Song Transition 只看兩種銜接。
- 完整混音 NT$8,000、Vocal 混音 NT$4,000。
- 單純銜接 1–5 首 NT$1,000，第六首起每首 NT$200。
- 編輯銜接 1–5 首 NT$4,000，第六首起每首為該服務基價 20%。
- en 使用送出時鎖定的當日匯率顯示 USD。
- 學生所有計價最後折 30%。
- rush、consultation、source preparation 依服務基價各自非複利計算。
- 表單 local draft 只留在當前瀏覽器，不同步跨裝置。
- 工程只接受下載連結，不出現 upload。
- email 必填；至少一個常用聯絡平台與至少一個聯絡帳號/方式。
- 生日不填；使用年齡/監護人授權欄位。
- 學生證明提示可遮蔽敏感資訊。
- 學生優惠在送出時顯示一般／學生候選價，Kamel 可於後台人工接受或拒絕；處理後只保留實際鎖定價格，後台從不顯示證明內容。
- 四步流程：服務、表單、統一條款勾選、審查送出。
- Turnstile 完成後才可送。
- 成功只顯示案件編號、日期、服務等有限資訊，不回顯表單。
- 送出不寄使用者確認信。
- 作品 preview 需要 click-to-load；同時只有一個媒體播放。
- Footer 可容納超過三個連結。
- reduced-motion 停用非必要動畫；micro interactions 不誇張。
- WCAG 鍵盤、焦點、label、對比與 axe 檢查無嚴重問題。
- /admin 不通過 Access 時不可見。
- admin 無上傳、無 audit page、案件無完整表單內容。
- 404、500、外部媒體失敗與 Apps Script 暫時失敗都有可理解的中英文狀態。

### Step 8：撰寫 release checklist 並執行全驗證

docs/runbooks/release-checklist.md：

- 確認所有六份子計畫 commit 已合併。
- npm ci 使用已提交 package-lock.json。
- npm run check:all。
- D1 migration bookmark。
- Preview 人工驗收 desktop、iOS Safari 尺寸、Android Chrome 尺寸。
- Cloudflare Access OTP 人工驗收。
- 對照 Preview／Production GitHub Environments，確認 RATE_LIMIT_NAMESPACE_ID 都是數字且彼此不同；生成設定各只有一個 SUBMISSION_RATE_LIMITER。
- 確認 Preview／Production 生成設定的 secrets.required 恰為四個核准名稱，.wrangler.secrets.json 未被追蹤或上傳為 artifact。
- Google 正式 integration 小額/測試案件驗收後刪除測試資料。
- 法務審查 gate。
- 備份目前公開內容版本。
- Production deploy。
- /health、首頁、四個服務頁、表單、Footer、Blog、Access、CSP 驗收。
- 不以真實委託資料做 E2E。
- 記錄 deployment ID 與 D1 bookmark。
- 發現重大問題時回滾 Worker，資料依 bookmark runbook 人工處理。

Run:

- npm ci
- npm run check:all
- npm run verify:production
- npm run build

Expected: 全部 PASS，且 production config 不含測試 key 或 bypass。

Commit:

~~~bash
git add scripts .github/workflows tests/e2e docs package.json wrangler.base.jsonc playwright.config.ts README.md
git commit -m "chore: add secure cloud release workflow and runbooks"
~~~

---

## 最終 Definition of Done

只有同時滿足下列條件才算完成：

- /admin 經 Cloudflare Access email OTP 與 Worker JWT 二次驗證。
- 每個後台 mutation 都有 Origin 與 HMAC CSRF 驗證。
- 內容、價格、條款、作品、連結與 Blog 完成草稿、預覽、發布、編輯、下架。
- 後台沒有檔案上傳，只管理外部 URL。
- 公開內容永遠讀已發布 immutable version。
- 案件後台只顯示六項有限欄位，不讀完整表單。
- 清理需 Kamel 手動確認 Google/Gmail/其他副本，再由 Worker 刪 Apps Script ledger 與 D1 暫存資料。
- 永久案件紀錄只保留案件編號、服務類型、價格、日期、狀態；currency 作為價格必要屬性。
- CSP nonce、安全標頭、no-store 與安全錯誤處理通過測試。
- Preview E2E 不碰 production 資料。
- Production 需 GitHub Environment 人工核准、法務 gate、D1 bookmark、migration、deploy、health check。
- kamelkyp.com 可用，Cloudflare Access 與 Turnstile production key 正常。
- 中英文、TWD/USD、服務計價、修改、取消、工程檔、保密、資料保存條款皆與設計規格一致。
- 全部 unit、worker、Apps Script、E2E、typecheck、lint、build 測試通過。
