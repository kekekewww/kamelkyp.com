# Kamel 音樂委託網站 Cloud Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以全雲端方式，依序交付 Kamel 的雙語音樂委託網站、媒體預覽、報價表單、Google 同步、管理後台與正式部署。

**Architecture:** GitHub main 是唯一正式原始碼來源；每個子計畫在獨立 `codex/*` branch 及 Pull Request 中完成，GitHub Actions 負責安裝、測試、建置與 Cloudflare Preview。應用程式使用 React Router 8 SSR 執行於 Cloudflare Workers，D1 只保存公開內容、版本資料與去識別案件資料，完整表單只送往 Google Form／Sheet 與 Gmail。

**Tech Stack:** Node.js 24.x、React 19.2.8、React Router 8.3.0、TypeScript 7.0.2、Vite 8.1.5、Cloudflare Vite Plugin 1.48.0、Wrangler 4.114.0、D1、Access、Turnstile、Vitest 4.1.10、Workers Vitest Pool 0.16.19、Playwright 1.61.1、Zod 4.4.3、jose 6.2.3、WaveSurfer 7.12.11、Biome 2.5.6。

## Global Constraints

- 完整規格：`docs/superpowers/specs/2026-08-10-kamelkyp-introduction-site-design.md`。
- 所有程式碼、commit、CI、Preview、部署與正式資料都在 GitHub、Cloudflare 或 Google 雲端完成。
- 不以使用者裝置上的 checkout、本機資料庫或本機檔案作為執行步驟；GitHub-hosted runner 內的短生命週期 loopback 測試服務屬雲端 CI，可用於 E2E。
- 唯一瀏覽器端例外是未送出的委託草稿；草稿不跨裝置，送出成功後清除。
- 中文使用 `zh` URL 與 TWD；英文使用 `en` URL 與送出時鎖定的 USD。
- 不接受訪客或管理員直接上傳檔案；媒體與委託素材全部使用外部 HTTPS URL。
- D1 永久案件欄位只有案件編號、服務類型、鎖定價格（含幣別）、日期、狀態。
- 管理區只能位於 `/admin`，並同時通過 Cloudflare Access 與 Worker JWT 驗證。
- 不加入訪客分析、廣告追蹤、自動翻譯、客戶帳號、網站內付款或淺色主題。
- 自訂 CSS，不採用 Bootstrap CSS 或 Tailwind。
- WCAG 2.2 AA、完整鍵盤操作、44 × 44 px 觸控目標、Reduced Motion、不自動播放。
- 發布服務條款與隱私文字前，必須完成人工法律審閱。

---

## 1. 計畫拆分與順序

| 順序 | 計畫 | Branch | 可獨立驗收的成果 |
|---|---|---|---|
| 1 | `2026-08-10-01-cloud-foundation.md` | `codex/01-cloud-foundation` | 可由 GitHub Actions 建置、測試並部署 Preview 的 React Router 8／Workers／D1 骨架 |
| 2 | `2026-08-10-02-public-content-design-system.md` | `codex/02-public-content` | 中英文 Landing、分類服務、作品、Blog、條款與響應式 Footer |
| 3 | `2026-08-10-03-media-preview.md` | `codex/03-media-preview` | 安全的 YouTube、Drive、Direct Audio、GitHub Raw、R2 與外部連結預覽 |
| 4 | `2026-08-10-04-commission-pricing-flow.md` | `codex/04-commission-flow` | 四種服務的精確報價、瀏覽器草稿、條款、複核與 Turnstile 流程 |
| 5 | `2026-08-10-05-google-submission-data.md` | `codex/05-google-sync` | HMAC Apps Script、Google Form／Gmail 冪等同步與七日清理流程 |
| 6 | `2026-08-10-06-admin-security-release.md` | `codex/06-admin-security-release` | Access 保護的 CMS／案件後台、完整安全檢查與正式部署閘門 |

每個 PR 合併後才開始下一個計畫。若前一計畫尚未通過 CI 與人工 Preview 驗收，不建立後續 branch。

## 2. 雲端執行協定

每個 Task 採同一 TDD 節奏：

1. 在該計畫 branch 直接建立失敗測試並 commit。
2. 由 GitHub Actions 執行指定指令，確認失敗原因符合計畫。
3. 直接在 GitHub branch 建立最小實作並 commit。
4. GitHub Actions 再次執行，確認格式、測試、型別與 Build 通過。
5. 部署 Cloudflare Preview，執行該 Task 的瀏覽器或人工驗收。
6. 保留小而可審查的 commit；不把整個子計畫壓成單一 commit。
7. 子計畫全部完成後建立 PR，通過審查才合併 main。

Lockfile 由 GitHub Actions 的 `lockfile.yml` 工作流在雲端產生或更新，使用 `github-actions[bot]` commit；不從本機產生 `package-lock.json`。

## 3. 固定檔案邊界

### 3.1 執行與設定

- `package.json`：精確依賴版本與 npm scripts。
- `package-lock.json`：雲端 lockfile 工作流產生。
- `react-router.config.ts`：SSR 與 React Router build 設定。
- `vite.config.ts`：React Router 與 Cloudflare Vite Plugin。
- `wrangler.base.jsonc` 與 CI 產生的 `.wrangler.generated.jsonc`：Worker、D1、Rate Limit、Cron 與環境設定；資源 ID 不進版控。
- `workers/app.ts`：React Router request handler 與 scheduled handler。
- `worker-configuration.d.ts`：Wrangler 產生的 Cloudflare binding types。
- `.github/workflows/ci.yml`：Biome、TypeScript、Vitest、Build。
- `.github/workflows/e2e.yml`：GitHub-hosted loopback workerd 的 Playwright 與 axe；另對 Cloudflare Preview 執行 smoke test。
- `.github/workflows/lockfile.yml`：雲端更新 package-lock。
- `.github/workflows/deploy-preview.yml`：PR Preview。
- `.github/workflows/deploy-production.yml`：main 正式部署。

### 3.2 共用核心

- `app/lib/env.server.ts`：Cloudflare Env 型別。
- `app/lib/i18n/locale.ts`：Locale 與語言判斷。
- `app/lib/db/`：D1 repositories 與 transaction helpers。
- `app/lib/content/`：公開內容與版本工作流。
- `app/lib/services/`：服務目錄與穩定 ServiceId。
- `app/lib/pricing/`：純函式報價與匯率。
- `app/lib/commission/`：表單 schema、草稿、送出 contract。
- `app/lib/media/`：媒體 URL 解析、Adapter 與 playback coordinator。
- `app/lib/auth/`：Access JWT、CSRF 與管理者授權。
- `app/lib/integrations/`：Turnstile 與 Apps Script gateway。
- `app/lib/cases/`：案件、狀態與清理提醒。

### 3.3 UI 與 Routes

- `app/components/layout/`：Header、Footer、Language Switcher。
- `app/components/media/`：各媒體播放器。
- `app/components/commission/`：Wizard、欄位、條款與 Review。
- `app/components/admin/`：後台編輯與案件表格。
- `app/routes/public/`：公開頁面。
- `app/routes/admin/`：Access 保護頁面。
- `app/styles/`：Tokens、Global、Layout、Components、Motion。
- `tests/unit/`：純函式與 schema。
- `tests/worker/`：D1、Worker、Access、Turnstile、Apps Script 整合。
- `tests/e2e/`：語言、響應式、表單、媒體、後台與無障礙。
- `integrations/apps-script/`：Apps Script 程式、manifest 與雲端部署說明。

## 4. 跨計畫固定介面

以下名稱一旦由第一個定義它的計畫建立，後續計畫不得改名。

~~~ts
export type Locale = "zh" | "en";

export type ServiceId =
  | "full_mix"
  | "vocal_mix"
  | "simple_transition"
  | "edit_transition";

export type CaseStatus =
  | "pending_review"
  | "pending_deposit"
  | "in_production"
  | "preview_approval"
  | "pending_balance"
  | "delivered"
  | "paused"
  | "cancelled";

export interface Env {
  DB: D1Database;
  SUBMISSION_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  CSRF_SECRET: string;
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ADMIN_EMAIL: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_HMAC_SECRET: string;
  FX_API_URL: string;
  APP_ORIGIN: string;
}

export interface QuoteInput {
  serviceId: ServiceId;
  songCount?: number;
  rush: boolean;
  consultation: boolean;
  sourcePrep: boolean;
  studentRequested: boolean;
}

export interface QuoteBreakdown {
  serviceBaseTwd: number;
  rushTwd: number;
  consultationTwd: number;
  sourcePrepTwd: number;
  beforeStudentDiscountTwd: number;
  studentDiscountTwd: number;
  lockedInitialTwd: number;
  studentStatus: "not_requested" | "pending_proof";
}

export type MediaKind =
  | "youtube"
  | "google_drive"
  | "direct_audio"
  | "github_raw_audio"
  | "cloudflare_r2_audio"
  | "external_link";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  url: string;
  title: string;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface PermanentCaseRecord {
  caseId: string;
  serviceId: ServiceId;
  lockedPriceMinor: number;
  currency: "TWD" | "USD";
  submittedAt: string;
  status: CaseStatus;
}
~~~

## 5. 不可變的資料與 API 規則

- 所有 API 成功回應使用 `{ ok: true, data }`。
- 所有 API 錯誤回應使用 `{ ok: false, error: { code, message, fieldErrors? } }`。
- 公開內容以 `entry_id + locale + version` 識別不可變版本。
- 已發布版本不做 UPDATE；編輯建立新 draft。
- 送出 API 為 `POST /api/commission/submit`。
- Turnstile 只在 Worker 驗證。
- Apps Script payload 以 `caseId` 作為冪等鍵。
- 管理 mutation 只使用 `POST`，並同時驗證 Origin、CSRF 與 Access JWT。
- 媒體 URL 只允許 HTTPS；不保存原始 iframe HTML。
- 價格以整數 TWD 計算；USD 以整數 cents 保存與顯示。
- 匯率以 8 位固定小數整數保存，不使用 binary floating point 計算 USD cents。

## 6. 規格覆蓋矩陣

| 規格區段 | 主要計畫 |
|---|---|
| 3 雲端架構、19 資料模型、22 發布 | 01、06 |
| 4 語言與 URL、5 公開資訊架構 | 02 |
| 6 視覺與互動、7 Footer | 02 |
| 8 服務選擇、9 表單欄位 | 04 |
| 10 價格與服務、11 付款修改取消 | 04 |
| 12 時程交付、13 所有權、14 條款版本 | 02、04、06 |
| 15 表單同步錯誤 | 05 |
| 16 資料保存隱私 | 05、06 |
| 17 管理後台 | 06 |
| 18 作品與多媒體 | 03 |
| 20 安全性 | 01、03、04、05、06 |
| 21 測試策略、23 驗收 | 全部，最終由 06 匯總 |

## 7. Program 完成定義

- 六個 PR 依順序合併 main。
- 所有 CI、Worker Vitest、Playwright 與 axe 檢查通過。
- 390、768、1024、1440 px 的 Preview 驗收通過。
- 四種報價規則的邊界測試通過。
- D1 Schema 無完整表單或永久識別資料欄位。
- Apps Script duplicate／Form 成功 Gmail 失敗重試測試通過。
- /admin 在沒有 Access Token、錯誤 Audience、錯誤 Email 時全部拒絕。
- 正式 D1、Turnstile、Access、Google Form、Apps Script 與 Gmail 設定完成。
- kamelkyp.com 指向正式 Worker。
- 法律文字已由合格專業人士審閱並由 Kamel 在後台發布。
- Kamel 以中文與英文各完成一次完整委託流程的正式驗收。
