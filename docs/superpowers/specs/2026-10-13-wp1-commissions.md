# WP1: Studio Commissions inbox (port of `/admin/cases`)

Status: implementation spec, 2026-10-13. Work package `wp1-commissions` of "finish all code work".
Branch `claude/wp1-commissions` (cut from `origin/main` 6bd682a; integration plan
`docs/superpowers/plans/2026-10-13-finish-code-work.md` §1, whose §2 and §9 win over this spec). Spec phase only: no
application code changes here.

Companions (they win where they are more specific): `docs/admin-architecture.md` (Studio routes, auth, UX,
visual spec), `docs/content-architecture.md` (packages, ownership), `docs/content-schema.md`,
`docs/superpowers/specs/2026-09-24-content-studio-brief.md` (the brief, "§n"), and the original commission data
rules in `docs/superpowers/specs/2026-08-10-kamelkyp-introduction-site-design.md` (site spec §16–17) and
`docs/superpowers/plans/2026-08-10-05-google-submission-data.md` (the canonical plan 05; its older duplicate draft has the same cleanup lines and is removed by wp6) and `2026-08-10-06-admin-security-release.md` (plan 05, plan 06).

---

## 1. Goal

Replace the four Studio stubs under `/studio/commissions` with a working **Commissions inbox** that does
everything the legacy `/admin/cases` panel does: list the de-identified cases (filters: service, status;
signed cursor), change a case status, resolve a pending student price, and run the owner-confirmed 7-day
cleanup. It is built from the Studio's existing patterns (thin `withOwner` / `withOwnerMutation` route modules,
handler functions in a repository module, `actionOk` / `actionError`, fetchers, toasts, native `<dialog>`
only for permanent deletion).

The port must:

- show **only** the permanent case fields plus the two runtime facts needed to act (student price candidates,
  cleanup schedule), never form content, identity data or technical submission state;
- keep the 7-day cleanup **owner-confirmed** (checklist + Apps Script ledger), never automatic;
- never compute, suggest or edit a price: every number on the page is a stored D1 value;
- keep `/admin/cases` fully working (the `/admin` flip and the deletion of the legacy panel belong to the
  integration flip, §5.3), and accept the legacy query string so the later 301 lands on the same view.

Non-goals (decided by the docs, see §2): a case detail page, any view of the Google Form content, sending
email to clients, an audit log, bulk actions, automatic cleanup in the cron, editing prices, search.

---

## 2. Source requirements

### 2.1 Studio brief and Studio architecture

| Requirement | Source |
| --- | --- |
| Admin is titled `KAMEL STUDIO`; the only public identity is Kamel. | brief `2026-09-24-content-studio-brief.md:9-16` |
| Studio home shows "content needing attention"; no meaningless analytics. | brief `:167-171` |
| Mobile supports "status changes"; clear feedback for success and errors; destructive actions need explicit confirmation. | brief `:176-184` |
| Reuse the existing database, auth, storage and API. | brief `:188-191` |
| "Studio chrome is English; content fields are zh + en." | `docs/admin-architecture.md:9-10`; `docs/content-architecture.md:655-656` |
| Every `/studio` response is `no-store` + `X-Robots-Tag: noindex, nofollow`; actions dispatch on `intent`; unknown intents → 422. | `docs/admin-architecture.md:94-96` |
| `/studio/commissions`: cases (port of `CaseTable`, filters service/status, cursor); loader data "cases, student reviews, cleanup due"; **no actions on the list route**. `/status`, `/student-discount`, `/cleanup` are resource routes (A+C) calling `updateCaseStatus`, `resolveStudentDiscount`, `confirmVerifiedCleanup` + Apps Script ledger. | `docs/admin-architecture.md:120-123` |
| Route modules are thin; `handleX({ db, env, identity, formData, intent, params, now })` lives in a repository module and is tested without HTTP. | `docs/admin-architecture.md:134-136` |
| After the flip `/admin/cases` → 301 `/studio/commissions` **(query string kept)**; `/admin/cases/{status,student-discount,cleanup}` POST → 410. Until the flip `/admin/*` stays fully functional. | `docs/admin-architecture.md:155-160`; implemented (not wired) in `app/routes/admin-legacy-redirect.ts:22-25,54-58` |
| Sidebar counts: attention on HOME, **pending review on Commissions**. | `docs/admin-architecture.md:343-344` |
| Home "Needs attention" includes "commissions pending review, student reviews, cleanup due"; each row links to the fix. Home "Commissions" block: pending review, awaiting deposit, in production counts + link. | `docs/admin-architecture.md:357,361` |
| Feedback: toasts (`role="status"` / `role="alert"`), no confirmation modals for reversible actions, Undo where meaningful; native `<dialog>` only for permanent deletion. | `docs/admin-architecture.md:22-26,480-489` |
| Mobile: stacked rows, filters in a disclosure, ≥ 44 px targets; "commission status changes" supported on mobile. | `docs/admin-architecture.md:554-565` |
| Rows/badges/focus/motion rules (40 px rows, inset focus, status never by colour alone, no ambient motion, no inline `style`). | `docs/admin-architecture.md:304-305,633-685` |
| Integration package owns `app/routes/studio/commissions/**`, `app/components/studio/commissions/**` (ports of `CaseTable`, `CleanupChecklist`), **reusing `app/lib/admin/{case,cleanup}-service.server.ts` unchanged**; acceptance includes "cases, case status, student discount, cleanup" reachable in `/studio` and a manual "commission case status change". | `docs/content-architecture.md:792-807` |
| `cases`, `case_runtime`, `submission_attempts`, `fx_rates`: unchanged; managed in Studio → Commissions. | `docs/content-schema.md:1662`; `docs/content-architecture.md:52,479` |

### 2.2 Commission data rules (privacy, retention)

| Rule | Source |
| --- | --- |
| D1 keeps permanently only case ID, service, locked price (with currency), date, status. No name, email, contact, material links, student proof or form content. | site spec `2026-08-10-kamelkyp-introduction-site-design.md:540-550`; roadmap `2026-08-10-00-kamelkyp-cloud-roadmap.md:19` |
| The admin never shows the full form; the owner reads it in Google Form / Sheet / Gmail. No full-form view, no audit log page. | site spec `:552-557,592-599` |
| "案件標記為交付、取消或暫停後 7 天，後台產生清理提醒" (7 days after delivered/cancelled/paused the admin raises a cleanup reminder); the owner deletes Google/Gmail records by hand, then confirms in the admin; D1 removes the temporary state and keeps only the permanent fields. | site spec `:559-565` |
| `listCases` returns exactly caseId, serviceId, lockedPriceMinor, currency, submittedAt, status; never name, email, contact, identity, age confirmation, student proof link, project link, purpose or terms details. | plan 06 `2026-08-10-06-admin-security-release.md:538-539` |
| Student review exposes only the two candidate prices; standard and student price use the submission-time currency and FX snapshot, "後台不重新抓匯率" (the admin never refetches FX); a resolved or missing case answers 409, "不可任意改價". | plan 06 `:546-549` |
| Cleanup only for delivered/cancelled/paused cases whose `cleanupDueAt` passed; all three checklist items required (else 422, nothing deleted); Apps Script `cleanup_ledger` first, then delete `submission_attempts` + `case_runtime`; `cases` keeps its six columns; Apps Script failure keeps runtime data and shows a retryable state, "絕不假裝完成"; the action never deletes Google data itself. | plan 06 `:553-564,675-683` |
| Cleanup copy may only record the owner's confirmation; it must not claim instant physical erasure (Gmail/Drive Trash keep data for their own period). | plan 06 `:683`; runbook `docs/runbooks/google-setup.md:54-63` |
| Status set; entering delivered/cancelled/paused sets `cleanupDueAt = now + 7 days`; leaving paused recomputes or clears it; `cases` only updates `status`. | plan 06 `:542-543,623-625` |
| A status change for a missing case answers 404; every action passes Access, CSRF **and Origin** checks. | plan 06 `:544-545` (Origin: `verifyMutationToken`, `app/lib/auth/admin.server.ts:25-50`, used by `withOwnerMutation`) |
| Cleanup: "任一步失敗，回 503 可重試且不標記完成" (any failed step answers 503, retryable, nothing marked done); resending `cleanup_ledger` is idempotent. | plan 06 `:681,563` |
| Legacy layout put the student prices "in the same case row" (`:691`). WP1 keeps the content rule (only the two prices and the two choices, gone after the choice) but shows them in a filter-independent queue, because admin-architecture `:120` loads "cases, student reviews, cleanup due" as separate collections and the legacy row placement hid off-page cases (§3.2). | plan 06 `:691`; admin-architecture `:120` |
| UI: limited fields so the owner identifies a case by ID and date; **no case detail page, no Google Form content**; after a student decision remind the owner to email the result — the site sends no client email; mobile shows the same fields; checklist all-three before submit; privacy note; never show submission attempt, nonce, Google response ID; no audit log page. | plan 06 `:626-629,690-697` |
| SQL lists columns explicitly ("禁止 SELECT *"); cursor = signed (submittedAt, caseId); limit 1–100. | plan 06 `:620-622` |

### 2.3 Cleanup automation: decided, stays owner-confirmed

The docs are explicit that the nightly cron **must not** perform the 7-day cleanup:

- plan 05 (`2026-08-10-05-google-submission-data.md:891`; the older duplicate draft says the same):
  "scheduled handler runs both refreshFxRate and deleteOrphanAttempts … **It does not auto-confirm seven-day
  cleanup.**"
- plan 05 `google-submission-data.md:886`: confirmCleanup "does not delete
  Google data; the API caller must show an explicit confirmation that Kamel already deleted Form／Sheet／Gmail
  records."
- plan 05 `google-submission-data.md:24` / `:28`: seven days after
  delivered/cancelled/paused the owner deletes the Form/Sheet/Gmail data **by hand, then confirms in the admin**;
  "不自動刪除…尚未人工確認的 Google 資料" (nothing is deleted automatically before the owner's manual confirmation).
- site spec `:561-564`: the admin raises a **reminder**; the owner deletes manually and confirms.
- plan 06 `:556,564`: three manual confirmations; the action never deletes Google data itself.

Therefore `workers/app.ts` `scheduled()` (`:80-91`) stays as it is (FX refresh, `deleteOrphanAttempts` for
incomplete submissions older than 24 h, upload cleanup, usage rebuild). The "reminder" is the Studio attention
item and the inbox's *Cleanup due* queue. WP1 adds a static regression test that the cron never imports a cleanup
confirmation (§7.1). This is how the owner-list item "nightly retention cleanup" is closed; the integration plan
records it as decision D7 (default: no automatic cleanup) for Kevin to confirm (plan §2.11, §7.1).

---

## 3. Current state

### 3.1 Studio side (stubs)

| File | State |
| --- | --- |
| `app/routes.ts:44-50` | `/studio/commissions`, `/commissions/status`, `/commissions/student-discount`, `/commissions/cleanup` already registered inside the shell layout (owner middleware on the root). No change needed. |
| `app/routes/studio/commissions/list.tsx:1-9` | `withOwner(() => null)` + `StubPanel title="Commissions" legacyHref="/admin/cases"`. |
| `app/routes/studio/commissions/status.ts:1-10`, `student-discount.ts:1-10`, `cleanup.ts:1-10` | `withOwnerMutation(() => actionError("not_built", { status: 501 }))`. |
| `app/components/studio/shell/nav.ts:63-70` | OPERATIONS → Commissions with `count: "commissions"`; `studio-shell.tsx:146-153` renders it with the SR text ", N pending review". |
| `app/routes/studio/root.tsx:31-42` | Root loader adds `pendingCommissions` from `getStudioCounts` (the root has no `shouldRevalidate`). |
| `app/lib/cms/studio/attention.server.ts:12-21` | `getStudioCounts` = attention list length + `commissions.pendingReview`. |
| `app/lib/cms/repositories/studio-home.server.ts:62-68,225-237,416-461` | Commission queue counts (pending review / deposit / production from `cases`; student reviews and cleanup due from `case_runtime`) and three attention rows (`commissions-review` high, `student-review` high, `cleanup-due` medium). **All three link to the bare `/studio/commissions` (`:439`)** and carry no `detail`. |
| `app/components/studio/home/studio-home.tsx:320-344` | Home "Commissions" block (three counts + "Open commissions"). Matches §4.2; unchanged by WP1. |
| `tests/e2e/studio-access.spec.ts:46-49` | Loopback asserts `POST /studio/commissions/status` → 403. |

### 3.2 Legacy implementation to port

| File | What it does | Defects the port fixes |
| --- | --- | --- |
| `app/routes/admin/cases.tsx:17-40` | `requireAdmin`; `listCases({ limit: 100, cursor, cursorSecret: env.CSRF_SECRET, service, status })`, `listPendingStudentPriceReviews`, `listCleanupDue(now)` in parallel. `:51-56` zh privacy note. | `:22` casts `?status` unvalidated → `CaseStatusSchema.parse` throws → 500 on a bad link; an invalid/expired cursor (`invalid_case_cursor`) also 500s. |
| `app/routes/admin/case-status.ts:7-18` | POST → `updateCaseStatus` → redirect. | raw `status` cast; zod / `case_not_found` errors become 500 pages. |
| `app/routes/admin/student-discount.ts:6-16` | POST `accepted=true|false` → `resolveStudentDiscount`. | `student_review_conflict` → 500. |
| `app/routes/admin/cleanup-confirm.ts:7-35` | Checklist fields `googleRecordsDeleted`, `gmailDeleted`, `otherSensitiveCopiesDeleted` (`=== "on"`) → `confirmVerifiedCleanup` with `cleanupGoogleLedger({ url: APPS_SCRIPT_URL, secret: APPS_SCRIPT_HMAC_SECRET })`. | every failure (incl. the retryable gateway failure) → 500, no retry state. |
| `app/components/admin/CaseTable.tsx:37-104` | One `<li>` per case: ID, date (`submittedAt.slice(0,10)`), service id, price, status `<select>` + "更新", student block, cleanup checklist. | `:49` prints `currency + lockedPriceMinor.toLocaleString()`, i.e. a USD case of 26000 cents shows "USD 26,000" instead of US$260.00; raw service ids; student and cleanup controls only render for cases on the current page/filter (`:38-99`), so an older due case is unreachable from page 1. |
| `app/components/admin/CleanupChecklist.tsx:1-31` | Three `required` checkboxes + submit. | — |

Domain services (reused **unchanged**, `docs/content-architecture.md:795`):

| File | Contract |
| --- | --- |
| `app/lib/admin/case-service.server.ts:6-13` | `AdminCaseRow` = the six permanent fields. |
| `:15-24,26-30` | `CaseStatusSchema` (8 statuses), terminal set {paused, delivered, cancelled} (not exported). |
| `:117-170` | `listCases({ db, status?, serviceId?, limit 1–100, cursor?, cursorSecret })` → `{ rows, nextCursor? }`; explicit six columns; `ORDER BY submitted_at DESC, case_id DESC`; HMAC-signed cursor (`:61-104`), throws `invalid_case_cursor`, `invalid_case_limit`, `invalid_service_id`, ZodError. |
| `:172-199` | `updateCaseStatus({ db, caseId, status, now })`: terminal → `markCaseTerminal` (cleanup due = now + 7 d); otherwise status update + upsert runtime with `cleanup_due_at = NULL`; throws `case_not_found`. |
| `:201-220` | `listPendingStudentPriceReviews(db)` → `{ caseId, currency, standardPriceMinor, studentPriceMinor }[]`. |
| `:222-244` | `resolveStudentDiscount({ db, caseId, accepted })`: accept keeps `locked_price_minor`; reject sets it to the stored `standard_price_minor`; clears the candidates; throws `student_review_conflict`. |
| `app/lib/admin/cleanup-service.server.ts:9-68` | `confirmVerifiedCleanup({ db, caseId, checklist, gateway, now })`: `cleanup_checklist_incomplete` (`:22-28`), `cleanup_not_due` (`:41-47`), `student_review_pending` (`:48-49`), gateway first → `cleanup_gateway_failed` (`:50-54`), then batch-delete attempts + runtime (`:55-62`), `case_record_missing` (`:63-67`). |
| `app/lib/cases/retention.server.ts:15-44,54-72` | `markCaseTerminal`, `listCleanupDue(db, now)` → `{ caseId, serviceId, status, submittedAt, cleanupDueAt }[]`. `confirmCleanup` (`:74-96`) has no ledger/checklist step and is used by tests only; the Studio must never call it. `deleteOrphanAttempts` (`:98-117`) runs in the cron. |
| `app/lib/cases/case-repository.server.ts:3-11,59-71` | `CaseStatus`; every new case gets a `case_runtime` row at creation. The runtime row is deleted only by a cleanup, but it is **re-created** by any later status change (`case-service.server.ts:192-196`, `retention.server.ts:33-41`), and `0003_case_runtime.sql` did not backfill rows for cases created before it. So "no runtime row" alone does not prove a cleanup; see the derivation of `temporaryRecords` in §4.4. |
| `app/lib/cases/case-id.ts:3-17` | IDs are `KAM-<UTC yyyymmdd>-<10 Crockford base32>`. |
| `app/lib/integrations/google-submission-gateway.server.ts:83-128` | `cleanupGoogleLedger({ url, secret, caseId, now, fetcher })`: signed `cleanup_ledger`, throws `google_transport_failed` / `google_cleanup_failed`. |

Schema (no change): `migrations/0001_core.sql` `cases` (CHECK on 8 statuses, `currency IN ('TWD','USD')`),
`submission_attempts`; `migrations/0003_case_runtime.sql` `case_runtime` (+ partial index
`case_runtime_cleanup_due`). Money units: `locked_price_minor` is whole NT$ for TWD and **cents** for USD
(`app/lib/commission/prepare-submission.server.ts:96-110`, `submit.server.ts:97-121`). Service names live in
`services.name_i18n` joined by `services.commission_service_id` (`migrations/0006_cms_base_seed.sql:290-303`);
`SERVICE_CATALOG[].name` is deprecated and "removed together with `app/routes/admin/**`"
(`app/lib/services/catalog.ts:18-22`), so the Studio must not use it.

---

## 4. Design

### 4.1 Data flow

```
GET /studio/commissions?status&service&cursor
  root middleware (Access owner) → root loader (session, counts.pendingCommissions)
  list.tsx loader = withOwner → loadCommissions({ db, url, cursorSecret: env.CSRF_SECRET, now })
     ├─ parseCommissionQuery(url.searchParams)           invalid status/service → ignored
     ├─ Promise.all: listCases(limit 100) · listPendingStudentPriceReviews · listCleanupDue(now) · serviceNames
     │     invalid_case_cursor → listCases again without cursor, cursorRejected = true
     └─ caseFacts(db, union of case ids)                  one json_each query (runtime facts)
  → CommissionsModel (whitelisted fields only) → <CommissionsInbox>

fetcher POST /studio/commissions/status            intent set-status
fetcher POST /studio/commissions/student-discount  intent accept-student-price | reject-student-price
fetcher POST /studio/commissions/cleanup           intent confirm-cleanup
  withOwnerMutation (method, owner, CSRF + Origin) → handleX(...) → actionOk | actionError(status)
  2xx: React Router revalidates root + list loaders → table, queues and sidebar badge update; toast shows the result
  4xx/5xx: React Router does NOT revalidate by default (react-router@8.3.0 router.js:1937-1962,
           actionStatus >= 400 → defaultShouldRevalidate = false) → for the "stale page" codes
           (404 case_not_found, 409 student_review_conflict / cleanup_not_due / student_review_pending)
           useCommissionAction calls useRevalidator().revalidate() itself (pattern: project-editor.tsx:133,422)
```

Fetcher ownership (pattern `projects-list-view.tsx:149-158`, "Row actions and their Undo share one fetcher"): a
successful action can remove the row or queue item that started it (a status change under `?status=` filter, a
decided student price, a confirmed cleanup). A fetcher owned by that row would unmount in the same revalidation
commit, so its result toast and its Undo would be lost. Therefore all commission fetchers live in components that
stay mounted: `CommissionsInbox` owns the `set-status` fetcher (rows get `submit`/`busy` props, busy only for the
row whose `caseId` is in flight), and `NeedsAction` owns the student-decision fetcher and the single cleanup
dialog instance with its fetcher.

### 4.2 Routes (all four files already registered; no `app/routes.ts` change)

```ts
// app/routes/studio/commissions/list.tsx
export const links = () => [{ rel: "stylesheet", href: commissionsStyles }];
export const loader = withOwner(({ db, env, request, now }) =>
  loadCommissions({ db, url: new URL(request.url), cursorSecret: env.CSRF_SECRET, now }));
export default function CommissionsRoute() {
  const data = useLoaderData<typeof loader>();
  return <CommissionsInbox data={data} />;
}
// No action export (admin-architecture §2.2: list route has no actions).

// app/routes/studio/commissions/status.ts
export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleCommissionStatus({ db, formData, intent, now }));

// app/routes/studio/commissions/student-discount.ts
export const action = withOwnerMutation(({ db, formData, intent }) =>
  handleStudentDiscount({ db, formData, intent }));

// app/routes/studio/commissions/cleanup.ts
export const action = withOwnerMutation(({ db, env, formData, intent, now }) =>
  handleCommissionCleanup({ db, formData, intent, now, gateway: appsScriptCleanupGateway(env) }));
```

The three resource routes export no loader (a GET is not a supported use; after the flip the legacy redirect sends
legacy GETs to `/studio/commissions`). `tests/unit/studio-route-guards.test.ts:41-75` keeps passing unchanged.

Query parameters keep the **legacy names** so `admin-legacy-redirect.ts:54-58` ("query string kept") lands on the
same view: `status` (one of the 8 statuses), `service` (`full_mix`, `vocal_mix`, `simple_transition`,
`edit_transition`), `cursor` (the same HMAC cursor `listCases` issues with `env.CSRF_SECRET`).

### 4.3 Schema module (client-safe): `app/lib/cms/schemas/commission.ts`

zod 4 (`zod@4.4.3`), importable from components (no `.server` runtime import; type-only imports from
`case-repository.server.ts` are fine, as `CaseTable.tsx:1-2` already does).

```ts
export const CASE_STATUSES = [
  "pending_review", "pending_deposit", "in_production", "preview_approval",
  "pending_balance", "paused", "delivered", "cancelled",
] as const satisfies readonly CaseStatus[];          // order = case-service.server.ts:15-24
export const TERMINAL_CASE_STATUSES: ReadonlySet<CaseStatus>; // paused, delivered, cancelled
export const CaseStatusSchema = z.enum(CASE_STATUSES);
export const CaseIdSchema = z.string().regex(/^KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/); // case-id.ts:3-17
export const SetStatusInputSchema = z.object({ caseId: CaseIdSchema, status: CaseStatusSchema });
export const StudentDecisionInputSchema = z.object({ caseId: CaseIdSchema });
export const CleanupInputSchema = z.object({
  caseId: CaseIdSchema,
  googleRecordsDeleted: z.literal("on"),        // field names = legacy CleanupChecklist / cleanup-confirm.ts:11-21
  gmailDeleted: z.literal("on"),
  otherSensitiveCopiesDeleted: z.literal("on"),
});
export type CommissionQuery = { status: CaseStatus | null; service: ServiceId | null; cursor: string | null };
export function parseCommissionQuery(params: URLSearchParams): CommissionQuery; // invalid → null, cursor ≤ 512 chars
export function commissionQueryHref(query: Partial<CommissionQuery>): string;   // "/studio/commissions?…"
export const CASE_STATUS_LABELS: Record<CaseStatus, string>;                     // §4.9
```

### 4.4 Repository: `app/lib/cms/repositories/commissions.server.ts`

Wraps the legacy services (unchanged) the way `social-links.server.ts:347-404` wraps its own:

```ts
export const COMMISSION_PAGE_SIZE = 100;            // listCases maximum, same as legacy cases.tsx:28

export type CommissionCaseRow = AdminCaseRow & {   // the six permanent fields +
  cleanupDueAt: string | null;                      // case_runtime.cleanup_due_at
  studentReviewPending: boolean;                    // case_runtime.student_review_state = 'pending'
  temporaryRecords: "kept" | "removed";            // "removed" ⇔ no runtime row AND status is terminal
};
export type StudentReviewItem = {
  caseId: string; serviceId: ServiceId; submittedAt: string;
  currency: "TWD" | "USD"; standardPriceMinor: number; studentPriceMinor: number;
};
export type CleanupDueItem = {
  caseId: string; serviceId: ServiceId; status: CaseStatus; submittedAt: string;
  cleanupDueAt: string; studentReviewPending: boolean;
};
export type CommissionsModel = {
  now: string;
  query: CommissionQuery;
  cursorRejected: boolean;
  services: Array<{ id: ServiceId; name: LocalizedText }>;  // 4 rows, service_definitions order; LocalizedText from app/lib/cms/types.ts (plan §2.9)
  cases: CommissionCaseRow[];
  nextCursor: string | null;
  studentReviews: StudentReviewItem[];   // ALL pending reviews, independent of filters/page
  cleanupDue: CleanupDueItem[];          // ALL due cleanups, independent of filters/page
};

export async function loadCommissions(input: {
  db: D1Database; url: URL; cursorSecret: string; now: Date; limit?: number; // limit for tests only
}): Promise<CommissionsModel>;

export type CleanupGateway = { cleanupLedger(input: { caseId: string; now: string }): Promise<void> };
export function appsScriptCleanupGateway(
  env: Pick<Env, "APPS_SCRIPT_URL" | "APPS_SCRIPT_HMAC_SECRET">, fetcher: typeof fetch = fetch,
): CleanupGateway;                       // = the closure in admin/cleanup-confirm.ts:22-31

export function handleCommissionStatus(args: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now">);
export function handleStudentDiscount(args: Pick<StudioActionArgs, "db" | "formData" | "intent">);
export function handleCommissionCleanup(
  args: Pick<StudioActionArgs, "db" | "formData" | "intent" | "now"> & { gateway: CleanupGateway },
);
```

Queries added by WP1 (explicit columns, plan 06 `:620`):

- `serviceNames`: `SELECT d.id, s.name_i18n FROM service_definitions d LEFT JOIN services s ON
  s.commission_service_id = d.id ORDER BY d.sort_order, d.id` (empty name → the UI falls back to the id).
- `caseFacts(ids)`: `SELECT c.case_id, c.service_id, c.submitted_at, c.status, r.case_id IS NOT NULL AS
  has_runtime, r.cleanup_due_at, r.student_review_state FROM cases c LEFT JOIN case_runtime r ON r.case_id =
  c.case_id WHERE c.case_id IN (SELECT value FROM json_each(?1))` — the ids of the page rows, pending reviews and
  due cleanups (≤ a few hundred), bound as one JSON array (one bound parameter, so D1's per-query parameter limit
  is never reached). It never touches `submission_attempts`, and `standard_price_minor` / `student_price_minor` are
  read only through `listPendingStudentPriceReviews`.
- `temporaryRecords` derivation: `"removed"` only when `has_runtime = 0` **and** the status is terminal
  (paused/delivered/cancelled), the only state a confirmed cleanup can leave behind. A later status change re-creates
  the runtime row (§3.2), after which the row shows the new runtime state (cleared, or a new cleanup date) instead
  of `CLEANED`; a non-terminal case without a runtime row (only possible for a case created before `0003`) shows no
  marker. The marker never claims a cleanup that did not happen.
- `listCleanupDue` types `serviceId` as `string` (`retention.server.ts:46-52`); the repository narrows it with
  `isServiceId` (the FK to `service_definitions` guarantees it) before building `CleanupDueItem`.

Handlers (each: `if (!formData) return unknownIntent(intent)`, then switch on `intent`, default `unknownIntent`):

| Handler | Intent(s) | Steps | Success payload |
| --- | --- | --- | --- |
| `handleCommissionStatus` | `set-status` | parse `SetStatusInputSchema` (422 `invalid_request` + `issues`) → `SELECT status FROM cases WHERE case_id = ?` (none → 404) → **same status → `actionOk({ unchanged: true })` with no write** (a repeated terminal status is not "entering" it, plan 06 `:623`, so it must not push the cleanup date) → `updateCaseStatus` → read `cleanup_due_at` | `{ intent, caseId, status, previousStatus, cleanupDueAt, unchanged }` |
| `handleStudentDiscount` | `accept-student-price` (accepted = true), `reject-student-price` (accepted = false) | parse → `resolveStudentDiscount` → read `locked_price_minor, currency` | `{ intent, caseId, lockedPriceMinor, currency }` |
| `handleCommissionCleanup` | `confirm-cleanup` | parse `CleanupInputSchema`; any missing box → 422 `cleanup_checklist_incomplete` with one issue per missing field (`code: "required"`), **before** any DB or gateway call → `confirmVerifiedCleanup({ checklist: all true, gateway, now })`; any error that is not one of the service's coded errors (e.g. a D1 failure in the delete batch after the ledger call) → 503 `cleanup_failed` (plan 06 `:681`; a retry is safe because `cleanup_ledger` is idempotent, `:563`). **Deviation (§14.1):** after the ledger confirmed, the answer depends on what D1 still holds | `{ intent, caseId }` |

Issues: `ValidationIssue` (`app/lib/cms/types.ts:52-61`) needs `field`, `code`, `severity`, `message`; zod issues map to
`{ field: path.join("."), code: missing ? "required" : "invalid_value", severity: "error", message }` (both codes
already exist in `ValidationIssueCode`, `types.ts:33-50`; no new code is added).

Error mapping (`commissionErrorResult(error)`; anything else is rethrown to the Studio root `ErrorBoundary`, except
in the cleanup handler as stated above). Logging follows plan 06 `:862` (error code, requestId, route only; never the
request body, query string or PII), and never the case ID (the rule plan 06 `:655` sets for Apps Script logs); the
handlers add no logging of their own:

| Thrown by the service | HTTP | `code` | Message (English Studio copy) |
| --- | --- | --- | --- |
| `case_not_found` | 404 | `case_not_found` | "This case no longer exists. The list has been refreshed." |
| `student_review_conflict` | 409 | `student_review_conflict` | "This student price was already decided. The list is up to date now." |
| `cleanup_checklist_incomplete` | 422 | same, + `issues` | "Confirm all three deletions first." |
| `cleanup_not_due` | 409 | same | "Cleanup is not due for this case." |
| `student_review_pending` | 409 | same | "Decide the student price before the cleanup." |
| `cleanup_gateway_failed` | 503 | same | "Nothing was deleted: the Apps Script ledger did not confirm. Try again in a moment." |
| any other error inside the cleanup (D1), before the ledger confirmed, or after it while the `case_runtime` row is still there | 503 | `cleanup_failed` | "The cleanup did not finish and nothing was marked as done. Try again in a moment." |
| (§14.1) any other error after the ledger confirmed, when the read-back finds no `case_runtime` row and the case row present (the delete batch committed; only a later step failed) | 200 | — (success) | the normal success toast |
| (§14.1) any other error after the ledger confirmed, when even the read-back fails | 503 | `cleanup_unverified` | "The Studio could not check whether the cleanup finished. Reload the page: if the case is still in Cleanup due, confirm it again." |
| `case_record_missing` | 500 | same | "Temporary records were removed, but the case record is missing. Check the database before anything else." (the one non-503 cleanup failure: the deletion already happened, so a retry cannot help; it can only occur if the case row vanished concurrently) |
| zod parse failure | 422 | `invalid_request` + `issues` | "This request could not be read. Reload the page and try again." |
| unknown / missing intent | 422 | `unknown_intent` | existing `unknownIntent` copy (`responses.ts:96-101`) |

The 404 and 409 messages promise a refreshed list; that is only true because `useCommissionAction` revalidates
explicitly on those codes (§4.1). React Router skips revalidation after a 4xx/5xx action by default.

These codes are passed to `actionError(code, { status, message })` directly; `CmsErrorCode`
(`app/lib/cms/db/errors.ts:6-21`) is not extended.

### 4.5 Components: `app/components/studio/commissions/`

| File | Responsibility |
| --- | --- |
| `commissions-inbox.tsx` | `CommissionsInbox({ data })`: `StudioPage title="Commissions"`, top-bar status (`3 pending review · 1 student price · 1 cleanup due`, mono XS, from root `pendingCommissions` + queue lengths), privacy note, `NeedsAction`, `CaseList`. Owns the one `set-status` fetcher (`useCommissionAction("/studio/commissions/status", …)`) and its toasts/Undo, and passes `submit`/`busyCaseId` down to the rows (§4.1, fetcher ownership). |
| `needs-action.tsx` | Two queues that **always render** (each with its own empty line, so the home deep links always find their anchor): `<section id="student-reviews" aria-labelledby>` "Student prices to check" (empty: "No student prices to check.") and `<section id="cleanup-due" aria-labelledby>` "Cleanup due" (empty: "No cleanup due."). Each `h2` has `tabIndex={-1}` so focus can move to it. Each item repeats the identifying fields (ID, date, service). Separate queues because the legacy table rendered these controls only for cases on the current page/filter (`CaseTable.tsx:38-99`); the plan 06 content rule (`:691`: only the two prices + accept/reject, gone after the choice) is kept. Owns the student-decision fetcher and the **single** `CleanupDialog` instance (state: the `caseId` being confirmed, or null) with its fetcher, so results survive the item leaving the queue. |
| `student-review-item.tsx` | Standard and student price; buttons **Accept student price** / **Charge standard price** → inline confirmation in place (`role="group"`, label "Confirm student price decision for KAM-…"): "Keep the student price NT$5,600 for KAM-…? This cannot be undone." [Confirm] [Cancel]. Focus moves to Confirm; Cancel/Escape restores focus to the button that opened it. Confirm calls the `NeedsAction` submit with `{ intent, caseId }`. After success the item disappears; focus moves to the "Student prices to check" heading. No modal (decision is not a deletion; admin-architecture §1.5). Hint: "Check the student proof in the Google Form first. The site never sees it." |
| `cleanup-dialog.tsx` | Port of `CleanupChecklist` inside `ConfirmDialog tone="danger"` (`app/components/studio/ui/confirm-dialog.tsx:8-59`). `ConfirmDialog` renders `actions` **outside** `children` (`:55-56`), so the body holds `<StudioForm fetcher={…} id={formId} action="/studio/commissions/cleanup">` with hidden `caseId` and a `<fieldset><legend>` with the three native checkboxes (`googleRecordsDeleted`, `gmailDeleted`, `otherSensitiveCopiesDeleted`, all `required`) plus the explanation (§4.9); `actions` holds Cancel and **Confirm cleanup** as `<button type="submit" form={formId} name="intent" value="confirm-cleanup">` (`studio-btn--danger-filled`, disabled until all three are checked, `aria-describedby` → "Check all three to continue."). Opening the dialog calls `useStudioSession().refresh()` so a long checklist session does not post an expired token. On 503 the dialog stays open with the error shown inline (`role="alert"`) so Retry is one click. On success the dialog closes, the toast reports it and focus moves to the "Cleanup due" heading (the opener leaves the queue). If `studentReviewPending`, the queue item's button is disabled with "Decide the student price first" (link to `#student-reviews`). |
| `case-list.tsx` | Filter form (GET, `role="search"`, label "Filter cases"; `Select` "Status" = All + 8; `Select` "Service" = All + 4 names; auto-submit on change like `FilterBar` (`list.tsx:84-93`), plus an Apply button; "Clear filters" link when a filter is set; inside a "Filters" `<details>` below 768 px). The filter form has **no `cursor` field**: changing a filter always returns to the newest page. Cursor notice when `cursorRejected` ("That page link is no longer valid. Showing the newest cases.", `role="status"`). Rows via `RowList` (`app/components/studio/ui/list.tsx:130-157`) with an `aria-hidden` column head (`Case ID · Submitted (UTC) · Service · Locked price · Status`). Pagination: "Older cases" (`cursor=nextCursor`, filters kept) and "Newest cases" when a cursor is active. Empty states: no cases at all → "No commissions yet" / "Cases appear here when someone submits the commission form."; filtered → "No cases match these filters" + "Clear filters". |
| `case-row.tsx` | One `<li aria-label="Case KAM-…">`: case ID (mono, `translate="no"`, CSS `user-select: all` so one click selects it for a Gmail search), submitted date `YYYY-MM-DD` (UTC, the same date as the ID segment), service name (zh, with the EN name as secondary line when different; `lang="zh-Hant"` / `lang="en"`), locked price, `CaseStatusBadge`, markers, `CaseStatusControl`. Cells carry visually hidden labels that become visible when rows stack under 768 px (pattern of `social-links.tsx:47-75`). |
| `case-status-control.tsx` | `<label class="visually-hidden">Status for KAM-…</label>` + native `<select>` (8 options, `CASE_STATUS_LABELS`) + **Update** button (`aria-busy` while this row's change is pending, label "Updating…"; disabled while the selection equals the current status; **deviation (§14.2):** after hydration "disabled" is `aria-disabled="true"` plus a submit guard, natively `disabled` only before hydration). Submits `set-status` through the `submit` prop from `CommissionsInbox` (it owns no fetcher). |
| `case-status-badge.tsx` | `CaseStatusBadge({ status })` and marker badges (`STUDENT PRICE`, `CLEANUP DUE`, `CLEANUP 20 OCT`, `CLEANED`) on the badge geometry of admin-architecture §5.8; the word is always present. |
| `use-commission-action.ts` | `useProjectSubmit` (`app/components/studio/projects/use-project-submit.ts:14-55`) generalised with an `action` path: `fetcher.submit({ csrfToken, ...fields }, { method: "post", action })`, `onResult(data, sentFields)` once per completion, `busy`, `sent` (fields in flight). When the result code is `case_not_found`, `student_review_conflict`, `cleanup_not_due` or `student_review_pending`, it also calls `useRevalidator().revalidate()` (React Router does not revalidate after a 4xx action; §4.1). Used only by components that stay mounted (`CommissionsInbox`, `NeedsAction`). "Finished" uses the 227faa1 rule of `use-project-submit.ts:25-44` (idle **and** either a busy state was seen or the data is new), never the busy-state-only pattern that wp6's static ban rejects (wp6 §4.1.5). wp6 merges first (plan §5), so when WP1 rebases onto it, build the hook on `useFetcherSettled` (`app/components/studio/ui/use-fetcher-settled.ts`) instead of copying the rule, in the isolated hook commit (plan §3.1, §12). |
| `format.ts` (pure, client-safe) | `formatCaseMoney(minor, currency)`: TWD → `NT$${Intl.NumberFormat("en-US").format(minor)}`, USD → `US$${(minor / 100).toFixed(2)}` (exactly the public formats in `app/components/pricing/service-price.tsx:15,24`); `caseMarkers(row, now)`; `cleanupLabel(dueAt, now)`; `serviceName(services, id)`. No arithmetic on prices besides the cents → dollars display. Do **not** reuse `formatMoney` from `app/components/studio/services/price.ts:45-47`: it treats every amount as major units, so 26000 USD cents would print "US$26,000". |

Toast copy (`useToast`, `app/components/studio/ui/toast.tsx`):

| Result | Toast |
| --- | --- |
| `set-status` ok, non-terminal | "KAM-… is now “In production”" + **Undo** (posts `set-status` with `previousStatus`) |
| `set-status` ok, terminal | "KAM-… is now “Delivered”. Cleanup due 20 Oct." + **Undo** |
| Undo ok | "KAM-… is back to “Pending review”" |
| `accept-student-price` ok | "Student price kept for KAM-…: NT$5,600. Email the client with the result." (plan 06 `:629`) |
| `reject-student-price` ok | "Standard price set for KAM-…: NT$8,000. Email the client with the result." |
| `confirm-cleanup` ok | "Temporary records removed for KAM-…. The permanent record stays." |
| any `ok: false` | error toast (`role="alert"`, persistent) with the server message |
| no answer | "The Studio did not answer. Check the connection and retry." (as `use-project-submit.ts:38-41`) |

Undo is offered only for status changes (reversible). Student decisions and cleanup are irreversible and get the
confirmation step / dialog instead. Undo goes through the same inbox-level fetcher as the change it reverts
(pattern `projects-list-view.tsx:149-158`), so it still works after the row left a filtered list. Undoing back
into a terminal status re-enters it and therefore schedules a **new** cleanup date `now + 7 d` (plan 06 `:623`:
the clock starts on entering delivered/cancelled/paused); the reused services cannot restore the earlier date and
WP1 does not change them. The terminal toast already shows the new date, so the owner sees it.

### 4.6 Studio home and attention hooks

- `attention.server.ts` and the sidebar badge: **unchanged**. The Commissions badge stays "pending review" only
  (admin-architecture `:343-344`); student reviews and cleanups are attention rows on HOME.
- `studio-home.server.ts:427-461` (`caseRow`): add `href`, `action` and `detail` parameters so each row "links to the
  fix" (admin-architecture `:357`). The three rows now go to three different places, so they also get distinct link
  labels instead of three identical "Open commissions" links (the label is the only link text,
  `studio-home.tsx:118-120`):

| key | href | action | detail |
| --- | --- | --- | --- |
| `commissions-review` | `/studio/commissions?status=pending_review` | "Review cases" | "Read the request in Gmail or the Google Form, then set the status." |
| `student-review` | `/studio/commissions#student-reviews` | "Check student prices" | "Check the proof in the Google Form, then keep the student price or charge the standard price." |
| `cleanup-due` | `/studio/commissions#cleanup-due` | "Confirm cleanups" | "Delete the Google and Gmail records, then confirm the cleanup." |

  Titles, severities, ordering and counts stay as they are, so `getStudioCounts().attention ===
  home.attention.length` still holds (`tests/worker/studio-home.test.ts:194-198`). No test asserts the old
  "Open commissions" attention label (`studio-p4-home.test.tsx:146` checks the home block link, which keeps its
  label).
- Home "Commissions" block (`studio-home.tsx:320-344`): unchanged.
- No other notification channel: the site never emails clients (plan 06 `:629`); the new-case email is the existing
  Apps Script Gmail notification.

### 4.7 Privacy: what the inbox may show

| Shown | Never shown or sent to the browser |
| --- | --- |
| case ID, service (name), locked price + currency, submitted date (UTC), status | anything from `submission_attempts`: `state`, `payload_hash`, `terms_versions_json`, `terms_accepted_at`, `google_response_id`, `last_error_code`, `updated_at` (plan 06 `:696`) |
| for pending student reviews: the two stored candidate prices | name, email, contact handle, identity name, age confirmation, student proof link, project/material links, purpose, terms tick details (plan 06 `:539`) |
| cleanup due date / scheduled date; "temporary records removed" marker (derived, §4.4) | `case_runtime.updated_at`; nonces; Apps Script responses; whether a `submission_attempts` row exists |
| | links to Google Form/Sheet/Gmail records; a case detail route (plan 06 `:627`); an audit log (`:697`) |

Enforcement: the loader returns only `CommissionsModel` fields (worker test with a key whitelist and sentinel
strings, §7.2); the new SQL selects explicit columns and never reads `submission_attempts`; responses are
`no-store` + `noindex` through the existing Studio surface (`workers/app.ts:59-72`, admin-architecture §3.8);
handlers log nothing but error codes. Known limitation (docs-mandated, see §9): a case whose Google sync never
completed is still listed as *Pending review* until `deleteOrphanAttempts` removes it (≤ 24 h); the inbox does not
reveal the sync state.

### 4.8 Brand and pricing rules

- No personal name anywhere in the new code, copy, fixtures or tests; address the owner as "you". The brand
  audit (`tests/unit/brand-audit.test.ts:11-19`) scans every `app/**` and `workers/**` file, **comments
  included**, for `Kevin`, `Yang`, `楊子賢`, `kevinyaungputra` etc., so docs-style phrasing like "Kevin checks…"
  must not be copied into source comments.
- No price is computed, suggested or editable on this page. Displayed numbers are `cases.locked_price_minor`,
  `case_runtime.standard_price_minor` and `student_price_minor` exactly as stored. The only price-changing action is
  `resolveStudentDiscount` (keep the stored student price or restore the stored standard price); no FX lookup
  (plan 06 `:548`).
- Test/fixture values reuse values the suite already uses (NT$8,000 locked / NT$5,600 student, US$260.00 =
  26000 cents, NT$1,000) and live only in `tests/**`; nothing is added to `migrations/` or seeds.
- Sample/TODO content: not involved (cases are never seeded).

### 4.9 Copy (English Studio chrome; content names zh + en)

Studio chrome is English (admin-architecture `:9-10`); the legacy zh strings (`cases.tsx:51-56`,
`CaseTable.tsx`, `CleanupChecklist.tsx`) are replaced by:

| Place | Copy |
| --- | --- |
| Privacy note (under the title) | "The site keeps only the case ID, service, locked price, date and status. Read the full request in the Google Form, its Sheet or Gmail. Seven days after a case is delivered, cancelled or paused, delete those records and confirm the cleanup here." |
| Status labels | Pending review · Awaiting deposit · In production · Preview approval · Awaiting balance · Paused · Delivered · Cancelled (matches the home block's "Awaiting deposit", `studio-home.tsx:323`) |
| Cleanup dialog title | "Confirm cleanup for KAM-…" |
| Checklist legend | "Delete these yourself first. The site cannot reach Google or Gmail data." |
| Checkboxes | "Google Form response and its Sheet row are deleted" · "Gmail notification is deleted, including Trash" · "Other copies with personal data are deleted (downloads, forwards, Drive)" |
| Dialog note | "Confirming removes this case's temporary records here and its Apps Script ledger entry. The permanent record stays: case ID, service, locked price, date and status. Gmail and Drive Trash and Google backups may keep data for their own retention period." |
| Student hint | "Check the student proof in the Google Form first. The site never sees it." |

Service names come from `services.name_i18n` (zh primary, EN secondary when different, admin-architecture
`:384-386`). Public zh/en copy is untouched.

### 4.10 Accessibility and responsive

- Landmarks/headings: one `h1` (StudioPage), `h2` per section; sections `aria-labelledby`; anchors
  `#student-reviews`, `#cleanup-due` always exist (both sections always render, with an empty-state line when
  empty), so a deep link from home never lands on a missing anchor.
- Focus never falls back to `<body>`: when an action removes the control that started it (decided student price,
  confirmed cleanup), focus moves to that section's `h2` (`tabIndex={-1}`); a status change keeps focus on the
  row's Update button, or on the list heading when the row left the filtered list.
- Every control has an accessible name that includes the case ID ("Status for KAM-…", "Update status of
  KAM-…" via visually hidden text, "Confirm cleanup for KAM-…").
- Results are announced by the toast region (`role="status"` polite; errors `role="alert"`).
- Dialog: native `<dialog>` with focus return (`confirm-dialog.tsx:23-50`); checkboxes in a `fieldset` with a
  legend; the disabled confirm button is explained by visible text.
- Status, markers and errors never rely on colour alone (§5.8); focus rings inset on rows (§5.5).
- Mobile (< 768 px): stacked rows (ID + status badge; date · service · price; status control full width), filters
  in a disclosure, ≥ 44 px targets under `(pointer: coarse)`, no horizontal scroll at 390 px.
- Styles in `app/styles/studio/commissions.css`, scoped under `.studio`, loaded only by `list.tsx` `links`;
  no inline `style` attributes (CSP `style-src 'self'`, admin-architecture `:304-305`); no motion beyond the
  existing toast and colour transitions.

---

## 5. File plan

### 5.1 Create

| Path | Purpose |
| --- | --- |
| `app/lib/cms/schemas/commission.ts` | statuses, labels, zod inputs, query parsing/href (§4.3) |
| `app/lib/cms/repositories/commissions.server.ts` | `loadCommissions`, handlers, gateway factory, error mapping (§4.4) |
| `app/components/studio/commissions/commissions-inbox.tsx` | page (§4.5) |
| `app/components/studio/commissions/needs-action.tsx` | student and cleanup queues |
| `app/components/studio/commissions/student-review-item.tsx` | inline-confirmed student decision |
| `app/components/studio/commissions/cleanup-dialog.tsx` | port of `CleanupChecklist` |
| `app/components/studio/commissions/case-list.tsx` | filters, rows, pagination, empty states |
| `app/components/studio/commissions/case-row.tsx` | one case row |
| `app/components/studio/commissions/case-status-control.tsx` | status select + Update |
| `app/components/studio/commissions/case-status-badge.tsx` | status and marker badges |
| `app/components/studio/commissions/use-commission-action.ts` | fetcher hook with `action` path |
| `app/components/studio/commissions/format.ts` | money/date/marker helpers |
| `app/styles/studio/commissions.css` | area styles |
| `tests/unit/studio-commissions-format.test.ts` | §7.1 |
| `tests/unit/studio-commissions-ui.test.tsx` | §7.1 |
| `tests/unit/commission-retention-policy.test.ts` | §7.1 |
| `tests/worker/studio-commissions.test.ts` | §7.2 |
| `tests/fixtures/commissions-studio-e2e.sql` | §7.4 seed (fixed IDs, delete-then-insert) |
| `tests/fixtures/commissions-studio-e2e-cleanup.sql` | §7.4 teardown (deletes the four fixed IDs, children first), same pairing as the existing `*-e2e.sql` / `*-e2e-cleanup.sql` fixtures |
| `tests/e2e-studio/commissions.spec.ts` | §7.4 |

### 5.2 Modify

| Path | Change |
| --- | --- |
| `app/routes/studio/commissions/list.tsx` | stub → loader + `CommissionsInbox` + `links` (§4.2) |
| `app/routes/studio/commissions/status.ts` | stub → `handleCommissionStatus` |
| `app/routes/studio/commissions/student-discount.ts` | stub → `handleStudentDiscount` |
| `app/routes/studio/commissions/cleanup.ts` | stub → `handleCommissionCleanup` + `appsScriptCleanupGateway(env)` |
| `app/lib/cms/repositories/studio-home.server.ts` | `caseRow` deep links, action labels + details (§4.6) |
| `tests/worker/studio-home.test.ts` | assert the three hrefs and action labels (§7.2) |
| `tests/e2e/studio-access.spec.ts` | commissions paths in `STUDIO_PATHS` and commissions posts in the mutations test → 403 (§7.3, §12) |
| `tests/e2e-studio/harness.ts` | `runLocalD1File(path)` helper (`wrangler d1 execute kamelkyp-com --local --config wrangler.base.jsonc --file …` with `CI=1`, same mechanism as the migration step `:71-89`; throws `studio_e2e_d1_file_failed` with stdout/stderr), appended as a new export (§12) |
| `docs/admin-architecture.md` §2.2 rows `:120-123` | list the query params (`?status&service&cursor`) and the resource-route intents (`set-status`; `accept-student-price` / `reject-student-price`; `confirm-cleanup`) |
| `docs/runbooks/google-setup.md:62` | "回 `/admin/cases`…" → (in zh, like the runbook) Studio → Commissions (`/studio/commissions`; `/admin/cases` until the flip) |
| `docs/runbooks/release-checklist.md:19` | extend the line (zh, like the rest of the checklist) so it also covers Studio → Commissions (`/studio/commissions`; `/admin/cases` until the flip): six limited fields only, no proof or full form, cleanup only through the three-item checklist |

Not modified: `app/routes.ts`, `workers/app.ts`, `app/lib/cms/studio/attention.server.ts`,
`app/lib/admin/case-service.server.ts`, `app/lib/admin/cleanup-service.server.ts`,
`app/lib/cases/*`, `app/components/studio/home/studio-home.tsx`, `app/components/studio/shell/*` (including
`stub-panel.tsx`: `list.tsx` stops importing it, but `services/pricing.tsx`, `services/terms.tsx` and
`settings/footer.tsx` still use it until their own packages land), `app/components/studio/services/price.ts`,
`migrations/*`,
`package.json`, `package-lock.json` (no new dependency; the lockfile is only regenerated by
`.github/workflows/lockfile.yml`).

### 5.3 Delete

None in WP1. `app/routes/admin/{cases.tsx,case-status.ts,cleanup-confirm.ts,student-discount.ts}` and
`app/components/admin/{CaseTable,CleanupChecklist}.tsx` stay working until the integration flip, which deletes
all of `app/routes/admin/**` and `app/components/admin/**` and points `/admin*` at `admin-legacy-redirect.ts`
(admin-architecture `:138-160`, content-architecture `:792-806`; `tests/unit/studio-route-guards.test.ts:110-116`
pins the pre-flip state). `app/lib/admin/case-service.server.ts` and `cleanup-service.server.ts` are **not**
deleted by the flip either (content-architecture `:795-799` deletes only `content-service`, `media-content-service`,
`block-form`); after the flip the Studio is their only caller.

---

## 6. Migration needs

None. The inbox reads and writes only existing columns of `cases`, `case_runtime`, `submission_attempts`
(`0001`, `0003`), `service_definitions` and `services` (`0005`/`0006`). No new state is stored (the "cleaned"
marker is derived from the absent runtime row; the permanent record must stay at its six columns, plan 06 `:561`).
Volumes are small (single-owner commission queue), the list query is bounded (`LIMIT 101`) and
`listCleanupDue` already has the partial index `case_runtime_cleanup_due`. If a list index is ever needed it would
be a later migration numbered after the plan's fixed `0009` (wp2) and `0010` (wp3), i.e. `0011` or later, with
`CREATE INDEX IF NOT EXISTS cases_submitted ON cases(submitted_at DESC, case_id DESC);` — out of scope for WP1, which
adds no migration (plan §2.1).

---

## 7. Test plan

All suites must stay green: `npm run check` (format, typecheck, unit, worker, apps-script, build),
`npm run test:e2e:ci` (loopback, production build) and `npm run test:e2e:studio` (dev harness).

### 7.1 Unit (`vitest.config.ts`)

`tests/unit/studio-commissions-format.test.ts`
- `formatCaseMoney(8000, "TWD") === "NT$8,000"`, `(5600, "TWD") === "NT$5,600"`, `(1000, "TWD") === "NT$1,000"`,
  `(26000, "USD") === "US$260.00"`, `(18200, "USD") === "US$182.00"` (strict string equality).
- `CASE_STATUSES` equals, as a set, the status CHECK list parsed from `migrations/0001_core.sql?raw`, and keeps the
  legacy order; `CASE_STATUS_LABELS` has a label for each.
- `CaseIdSchema` accepts a `createCaseId` output and rejects `KAM-1`, lowercase, `I/L/O/U` suffixes.
- `parseCommissionQuery`: valid status/service kept; `status=accepted`, `service=x` → null; cursor kept as a string;
  `commissionQueryHref` round-trips and omits empty values.
- `CleanupInputSchema` fails unless all three fields are `"on"`.
- `caseMarkers`: pending review → `STUDENT PRICE`; due ≤ now → `CLEANUP DUE`; future → `CLEANUP <d Mon>`;
  `temporaryRecords: "removed"` → `CLEANED`.

`tests/unit/studio-commissions-ui.test.tsx` (react-dom/server + `createRoutesStub`, as
`tests/unit/studio-p4-home.test.tsx:15-29`)
- Renders IDs, `NT$8,000`, `US$260.00`, zh service name with `lang="zh-Hant"` and EN secondary with `lang="en"`.
- Each status select is labelled "Status for KAM-…", has 8 options, the current one selected; Update disabled.
- `id="student-reviews"` shows both candidate prices and the two decision buttons; `id="cleanup-due"` shows
  "Confirm cleanup…"; a due case with a pending student review renders the button disabled with "Decide the student
  price first".
- With empty queues both `id="student-reviews"` and `id="cleanup-due"` are still rendered with their empty lines.
- Cleanup dialog markup (rendered open, `caseId` set): three checkboxes with the legacy field names, `required`,
  inside a form whose `id` equals the Confirm button's `form` attribute; Confirm has `name="intent"
  value="confirm-cleanup"` and is disabled.
- Privacy note present. The markup contains no `@`, no `payload`, no `google_response` and no absolute `https://`
  link (no Google Form, Sheet or Gmail record link); sentinel checks on real data are the worker and e2e tests'
  job. The word "proof" is **not** forbidden: the student hint legitimately says "Check the student proof in the
  Google Form first."
- Empty and filtered-empty states; cursor notice when `cursorRejected`; "Older cases" href keeps
  `status`/`service` and adds `cursor`; the filter form has no `cursor` input.

`tests/unit/commission-retention-policy.test.ts` (static, `?raw` via `import.meta.glob` like
`studio-route-guards.test.ts:11-21`; identifiers matched with word boundaries, e.g. `/\bconfirmCleanup\b/`, so
`confirmVerifiedCleanup` or a `handleConfirmCleanup` name does not count as `confirmCleanup`)
- `workers/app.ts` contains `deleteOrphanAttempts` and contains none of `confirmVerifiedCleanup`, `confirmCleanup`,
  `cleanupGoogleLedger`, and imports neither `cleanup-service.server` nor `repositories/commissions.server`
  (cleanup stays owner-confirmed, §2.3).
- Subset rule (so the later deletion of the legacy route by the `/admin` flip does not break it): every `app/**` file
  that references `confirmVerifiedCleanup` is in { `app/lib/admin/cleanup-service.server.ts` (definition),
  `app/lib/cms/repositories/commissions.server.ts`, `app/routes/admin/cleanup-confirm.ts` }; and
  `commissions.server.ts` does reference it (the Studio path exists).
- `confirmCleanup` (no checklist, no ledger) is referenced by no `app/**` or `workers/**` file other than its
  definition in `app/lib/cases/retention.server.ts`.

Unchanged and still passing: `studio-route-guards.test.ts` (the four modules keep `withOwner` /
`withOwnerMutation`), `studio-p4-home.test.tsx` (its "Open commissions" assertion `:146` is the home block, which
does not change), `brand-audit.test.ts` (new sources must stay clean).

### 7.2 Worker (`vitest.worker.config.ts`, migrated D1, no HTTP)

`tests/worker/studio-commissions.test.ts` (valid, per-test unique IDs; seeds `submission_attempts` with sentinel
values such as `sentinel-payload-hash`, `sentinel-google-id`, `["sentinel-terms"]`, `sentinel-error`).
Isolation: do not rely on per-test storage isolation. The repo's worker tests are written so that rows from
earlier tests in the same file may still be present (`tests/worker/studio-counts.test.ts:15-27` uses relative
counts; `@cloudflare/vitest-pool-workers` 0.16.19). So each test uses its own `submitted_at` window (later than
any other test's for the pagination test, so its rows are the newest), asserts membership (`toContain`,
`not.toContain`) or before/after deltas, and never asserts an exact global row count.
- **Privacy:** every `cases[]` row has exactly the keys `caseId, serviceId, lockedPriceMinor, currency,
  submittedAt, status, cleanupDueAt, studentReviewPending, temporaryRecords`; `studentReviews[]` and
  `cleanupDue[]` keys as in §4.4; `JSON.stringify({ ...model, nextCursor: null })` contains no sentinel and no
  `/payload|hash|google|terms|email|proof|nonce/i` (the signed cursor is excluded from the regex because its
  random base64url signature could contain such letters by chance; it is asserted separately to match
  `/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/`).
- **Service names** come from `services.name_i18n` (`{ zh: "完整歌曲混音", en: "Full Song Mixing" }` for
  `full_mix`), four entries in `service_definitions` order.
- **Filters:** `?status=delivered`, `?service=vocal_mix` return only matching rows and include this test's
  matching cases; `?status=accepted&service=x` → ignored (`query.status === null`, `query.service === null`, and
  this test's cases of different statuses and services are all listed); with `limit: 2` and three cases newer than
  any other test's, page 1 holds the two newest and the `nextCursor` page starts with the third;
  `?cursor=bogus` → first page and `cursorRejected: true`.
- **Queues:** a pending student review on a case outside the current filter/page is still in `studentReviews`
  (with service and date); a due cleanup outside the filter is still in `cleanupDue`; a future cleanup is not.
- **Status:** unknown intent → 422; `caseId: "KAM-1"` → 422 `invalid_request` with `ValidationIssue`-shaped
  issues; status `accepted` → 422; unknown valid ID → 404 `case_not_found`; `pending_review → delivered` →
  `cleanupDueAt = now + 7 d`, `previousStatus: "pending_review"`; `delivered → in_production` clears it; same status
  again → `unchanged: true` and `cleanup_due_at` not moved; `cases` still has exactly six columns
  (`PRAGMA table_info`).
- **Student:** `accept-student-price` keeps 5600, `reject-student-price` restores 8000 in the same currency; both
  clear the candidates; a second decision → 409 `student_review_conflict`; a decision for a valid but unknown ID →
  409 (plan 06 `:549`); returned `lockedPriceMinor` matches D1.
- **Cleanup:** missing checkbox → 422 with one issue per missing field, gateway not called, runtime intact; not due
  → 409; student pending → 409; gateway rejects → 503 `cleanup_gateway_failed`, runtime and attempts intact;
  a `db` wrapper whose `batch` throws after the gateway succeeded → 503 `cleanup_failed`, runtime and attempts
  intact, and a retry with the real `db` succeeds (ledger idempotent); success → gateway called once with
  `{ caseId, now }`, attempts + runtime gone, case kept; next `loadCommissions` shows `temporaryRecords: "removed"`
  and no `cleanupDue` entry; a later `set-status` to `in_production` on that case shows `temporaryRecords: "kept"`
  (runtime re-created) and never `CLEANED` for a non-terminal case.
- **Gateway factory:** `appsScriptCleanupGateway({ APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  APPS_SCRIPT_HMAC_SECRET: … }, fakeFetch)` posts once to that URL with a `cleanup_ledger` envelope; `fakeFetch`
  answers `{ ok: true, data: { operation: "cleanup_ledger", caseId } }` (anything else makes `cleanupGoogleLedger`
  throw, `google-submission-gateway.server.ts:111-127`). The signature format is covered by
  `tests/worker/google-gateway.test.ts:89-110`.
- **Counts:** `getStudioCounts().pendingCommissions` grows by exactly the number of `pending_review` cases this test
  seeds (before/after delta).

`tests/worker/studio-home.test.ts` (modified): "surfaces commissions waiting for review" (`:178-192`) additionally
asserts `href === "/studio/commissions?status=pending_review"` and `action === "Review cases"`; new cases assert the
`student-review` item (`/studio/commissions#student-reviews`, "Check student prices") and the `cleanup-due` item
(`/studio/commissions#cleanup-due`, "Confirm cleanups"). The new cases seed their own runtime rows; the existing
exact assertions (`pendingReview: 2`, `awaitingDeposit: 0`, `inProduction: 1`, `:186-191`) stay valid whatever the
test order because the new cases only use statuses the home block does not count (`preview_approval` for the
student row, `delivered` for the cleanup row). Reason: the deep links are new (§4.6);
counts and severities do not change.

Unchanged: `admin-cases.test.ts`, `admin-student-discount.test.ts`, `admin-cleanup.test.ts`, `retention.test.ts`,
`google-gateway.test.ts`, `studio-counts.test.ts` (the reused services do not change).

### 7.3 E2E loopback (`npm run test:e2e:ci`, production build, no owner)

`tests/e2e/studio-access.spec.ts` (modified):
- `STUDIO_PATHS` (`:5-15`) gains `/studio/commissions` and `/studio/commissions?status=pending_review&service=full_mix`
  → 403, `no-store`, `X-Robots-Tag`, body without `csrfToken` (existing loop assertions). They go into the array,
  not into a separate block: wp5's precondition check looks for `/studio/commissions` in `STUDIO_PATHS` and adds it
  if missing, and a second copy of the same path elsewhere would duplicate the generated test title
  (`GET ${path} is refused…`), which Playwright rejects.
- The mutations test (`:31-50`) also posts `/studio/commissions/student-discount` (`intent=accept-student-price`)
  and `/studio/commissions/cleanup` (`intent=confirm-cleanup`, all three boxes `on`) → 403, and asserts
  `cache-control` contains `no-store` for all three commissions posts.
Reason: the screens now hold real case data, so the fail-closed proof covers every commissions endpoint.
No other loopback spec changes; `/admin` 403 checks (`final-acceptance.spec.ts:123`,
`security-headers.spec.ts:27`) stay as they are.

### 7.4 E2E Studio (`npm run test:e2e:studio`, dev server + dev owner)

`tests/fixtures/commissions-studio-e2e.sql`: first deletes the four fixed IDs (children first:
`submission_attempts`, `case_runtime`, then `cases`), then inserts them, so it is re-run safe. Every case gets a
`cases` row (`submitted_at` = `2026-10-01T0N:00:00.000Z`, N = 1–4, matching the ID's date segment), a `case_runtime`
row (as `createCaseAttempt` creates one for every case) and a `submission_attempts` row:

| ID | Service | Status | Price | `case_runtime` | Attempt |
| --- | --- | --- | --- | --- | --- |
| `KAM-20261001-E2E0000001` | full_mix | pending_review | 8000 TWD | student `none`, no cleanup date | complete, sentinels |
| `KAM-20261001-E2E0000002` | full_mix | in_production | 26000 USD | student `none`, no cleanup date | complete |
| `KAM-20261001-E2E0000003` | full_mix | pending_review | 5600 TWD | student `pending`, 8000 / 5600 | complete |
| `KAM-20261001-E2E0000004` | simple_transition | delivered | 1000 TWD | student `none`, `cleanup_due_at` 2026-10-08T00:00:00.000Z | complete, sentinels |

`tests/fixtures/commissions-studio-e2e-cleanup.sql`: the same delete statements only, so the developer's local
Studio is not left with four fake cases nagging the attention list (the e2e fixtures of the loopback suite are paired
the same way, `scripts/run-loopback-e2e.mjs:34-45`).

`tests/e2e-studio/commissions.spec.ts`: `test.describe.configure({ mode: "serial" })` because the steps share and
mutate the four seeded cases; `test.beforeAll` → `runLocalD1File("tests/fixtures/commissions-studio-e2e.sql")`
(a retry re-runs `beforeAll`, so a retried group starts from a fresh seed); `test.afterAll` →
`runLocalD1File("tests/fixtures/commissions-studio-e2e-cleanup.sql")`. The webServer is already up when these run,
as it is for the migrations in `harness.ts:60-90`. Steps, in this order:
1. **Only permanent fields:** the four IDs, `NT$8,000`, `US$260.00` visible; `page.content()` contains no sentinel;
   `AxeBuilder` (`@axe-core/playwright` 4.12.1) with the repo's tag set `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`
   (as `tests/e2e/responsive-a11y.spec.ts:81-82`) reports no violations on the page and with the cleanup dialog open.
2. **Home deep link:** on `/studio`, the "student discount(s) to check" attention row's "Check student prices" link
   navigates to `/studio/commissions#student-reviews` and the section is in view (before step 4 consumes case 3).
3. **Status + Undo + badge:** read the Commissions nav badge; set case 1 to "Awaiting deposit" → toast "is now
   “Awaiting deposit”" → badge one lower (relative, the local DB may hold other cases); Undo → "back to “Pending
   review”" → badge restored. Repeat with the list filtered to `?status=pending_review`: the row leaves the list,
   the toast and its Undo still appear and work (fetcher ownership, §4.1).
4. **Student decision:** in `#student-reviews`, "Accept student price" for case 3 → confirmation → Confirm → toast
   contains "Email the client"; case 3 leaves the queue; focus is on the "Student prices to check" heading; its row
   shows `NT$5,600`.
5. **Cleanup checklist:** in `#cleanup-due`, open case 4's dialog; Confirm disabled with 0, 1, 2 boxes, enabled with
   3; Escape closes it and focus returns to the opener; case 4 still listed. The test **never clicks Confirm
   cleanup**: the harness's `APPS_SCRIPT_URL` is a syntactically valid `script.google.com` URL, so a submission would
   make a real outbound request from the dev server. Success and failure paths are worker-tested.
6. **Legacy query string:** `/studio/commissions?service=full_mix&status=pending_review` preselects both filters and
   lists case 1 (and 3), not 2 or 4; `?cursor=bogus` shows the notice.
7. **Mobile:** at 390 × 844 rows stack, the status control of case 1 is operable, and
   `document.documentElement.scrollWidth <= innerWidth`.

---

## 8. Error states (summary)

| Situation | Behaviour |
| --- | --- |
| No Access identity / wrong owner | 403 from the middleware or wrappers (unchanged) |
| CSRF expired on a fetcher post | 403 → Studio root error boundary "Sign in to open the Studio" (same as other list actions); the session provider refreshes the token every 20 min and on focus (`studio-session.tsx:55-65`) and the cleanup dialog refreshes it on open, so this stays rare |
| Bad `status` / `service` query | ignored, all cases shown, filter shows "All" |
| Bad / rotated cursor | first page + notice |
| Status/student/cleanup validation | 422 toast (and inline in the dialog for cleanup) |
| Case vanished (orphan cleanup ran) | 404 toast; the hook's explicit `revalidate()` removes the row (React Router would not revalidate after a 404 on its own) |
| Second tab already decided | 409 toast; explicit `revalidate()` updates queues |
| Apps Script down or missing `cleanup_ledger` | 503; nothing deleted; dialog stays open for Retry |
| D1 error inside the cleanup | 503 `cleanup_failed`; nothing marked as done; Retry is safe (ledger idempotent). After the ledger confirmed (§14.1): no runtime row left → reported as done; read-back fails → 503 `cleanup_unverified` (reload, confirm again if still listed) |
| D1 failure in the loader | thrown → Studio root error boundary "Something went wrong" |

---

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Production Access application does not yet include `/studio*` (admin-architecture `:203-212`) | Studio commissions answer 403 in production | Legacy `/admin/cases` stays live (no flip in WP1); the runbook update is part of the integration flip |
| Unfinished submissions (`submission_attempts.state != 'complete'`) appear as *Pending review* for up to 24 h | owner looks for an email that does not exist | Docs forbid showing sync state (plan 06 `:696`); `deleteOrphanAttempts` removes them nightly; noted here for the owner |
| Status changed after cleanup recreates a runtime row and a new cleanup reminder | an extra reminder | Harmless: `cleanup_ledger` is idempotent (plan 06 `:563`); no data reappears |
| Brand audit flags names in comments | `npm run check` fails | §4.8: write "you" / "the owner" |
| Local D1 persists between Studio e2e runs | flaky counts | fixed IDs with delete-then-insert; relative badge assertions |
| Concurrent wrangler write while the dev server runs | seed fails | same mechanism already used by the harness's migration step; the helper throws with stdout/stderr like `harness.ts:85-88` |
| UTC dates vs Taipei time | a case submitted late evening shows the previous/next day | intentional: the date matches the case ID segment; header says "(UTC)" |
| Legacy and Studio both mutate cases until the flip | none functionally (same services) | single source of logic (`app/lib/admin/*` unchanged) |
| Fetcher owned by a row that disappears after revalidation | lost toast, lost Undo | all commission fetchers live in `CommissionsInbox` / `NeedsAction` (§4.1); e2e step 3 covers the filtered case |
| React Router skips revalidation after 4xx/5xx actions | stale list after a 404/409 | `useCommissionAction` revalidates explicitly on the stale-page codes (§4.1) |
| Undo into a terminal status restarts the 7-day clock | temporary records kept up to 7 days longer than the first due date | documented behaviour of "entering" a terminal status (plan 06 `:623`); the toast shows the new date |
| Shared files with sibling packages | merge conflicts | §12 |

---

## 10. Owner decisions

None. The docs decide every open point this package touches: cleanup stays owner-confirmed (§2.3), chrome is
English, the badge counts pending review only, no detail page/search/email, legacy deletion waits for the flip.
No price value is introduced or changed.

---

## 11. Acceptance criteria

- [ ] `/studio/commissions` replaces the stub: lists cases newest first with filters `status`, `service` and a
      working "Older cases" cursor; the legacy query string (`?service&status&cursor`) renders the same view.
- [ ] Rows show only case ID, submitted date (UTC), service name, locked price (`NT$8,000`, `US$260.00` formats),
      status and markers; no `submission_attempts` field, identity data, proof link or form content reaches the
      browser (worker whitelist + sentinel test, Studio e2e sentinel check).
- [ ] Status change via `/studio/commissions/status` (`set-status`) works on desktop and at 390 px, toasts with
      Undo (also when the row left a filtered list), schedules cleanup 7 days after delivered/cancelled/paused and
      clears it otherwise; a no-op change writes nothing; the sidebar badge updates after revalidation.
- [ ] Every pending student price is listed (independent of filters) with both stored prices; accept/reject need a
      confirmation, resolve through `resolveStudentDiscount`, remind the owner to email the client, and a repeat
      answers 409 and refreshes the list.
- [ ] Every due cleanup is listed; the dialog requires all three confirmations; success removes
      `submission_attempts` + `case_runtime` after the Apps Script ledger confirms and keeps the six-column case;
      gateway or D1 failure answers 503, marks nothing done and allows retry (a D1 error after the delete batch
      committed is reported as done, or as 503 `cleanup_unverified` when even the read-back fails, §14.1); pending
      student review blocks cleanup.
- [ ] `workers/app.ts` is unchanged and the retention-policy test proves the cron never confirms cleanup.
- [ ] Home attention rows for commissions deep-link to `?status=pending_review`, `#student-reviews`,
      `#cleanup-due` with distinct link labels; both anchors always exist; counts and the badge rule are unchanged.
- [ ] All four commissions endpoints answer 403 without an owner in the loopback suite.
- [ ] Axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) reports no violations on the inbox and the open cleanup
      dialog; status words are never colour-only; focus never drops to `<body>` after an item leaves a queue; no
      inline styles.
- [ ] No migration, no new dependency, no lockfile change; no personal name in any new file; no price value
      invented or editable.
- [ ] `/admin/cases` and its three POST routes still work unchanged (flip deferred).
- [ ] `docs/admin-architecture.md` §2.2 and the two runbooks reflect the Studio inbox.
- [ ] `npm run check`, `npm run test:e2e:ci` and `npm run test:e2e:studio` pass; the Studio e2e leaves no fixture
      case behind in the local D1.

---

## 12. Coordination with sibling packages

WP1 has no dependency on another package. Others depend on it or share files with it:

| Package | Shared surface | Rule |
| --- | --- | --- |
| `/admin` retirement (wp5, `2026-10-13-wp5-admin-retirement.md`) | `app/routes.ts` flip, deletion of `app/routes/admin/{cases,case-status,student-discount,cleanup-confirm}.*`, `app/components/admin/{CaseTable,CleanupChecklist}.tsx`, `stub-panel.tsx`; `tests/e2e/studio-access.spec.ts`; `docs/runbooks/google-setup.md:62`, `release-checklist.md:19` | wp5 depends on WP1 and lands **after** it (wp5 §4.1; content-architecture `:792-807`). wp5 keeps `app/lib/admin/{case,cleanup}-service.server.ts` and `app/lib/cases/*` (wp5 §3 "kept"; WP1 imports them). The retention-policy test uses the subset rule (§7.1), so wp5's deletion of `cleanup-confirm.ts` needs no test change. WP1 keeps the legacy query names `status`/`service`/`cursor` that wp5's redirect forwards verbatim. WP1 writes the two runbook lines as "Studio → Commissions (`/studio/commissions`; `/admin/cases` until the flip)" because production Access may not cover `/studio` yet (§9); wp5 later rewrites the same lines for the post-flip state (wp5 §5 rows for `google-setup.md:62`, `release-checklist.md:19`), so wp5 rebases onto WP1's wording. |
| Pricing/terms (wp2), footer (wp3) | `tests/e2e/studio-access.spec.ts` (`STUDIO_PATHS` and the mutations test), `docs/admin-architecture.md` §2.2 | All three packages insert lines into the same `STUDIO_PATHS` array and the same mutations test; whichever lands second resolves the adjacent-insertion conflict by keeping every entry. WP1 touches only the four commissions rows (`:120-123`) of admin-architecture §2.2 (wp2 edits `:109-110`, wp3 `:119`). WP1 is the only package that changes `tests/e2e-studio/harness.ts` (it appends `runLocalD1File` as a new export); the siblings' Studio specs create their data through the UI with a per-run token. WP1 does not delete `stub-panel.tsx`; wp5 deletes it once no stub imports it. |
| Hygiene (wp6, `2026-10-13-wp6-hygiene.md`) | fetcher "settled" primitive (wp6 (a): `ui/fetcher-settle.ts`, `ui/use-fetcher-settled.ts`, a static ban on the busy-state-only pattern); plan 05 de-duplication (wp6 (f)) | `use-commission-action.ts` follows the 227faa1 rule, which passes the ban; if wp6 lands first, WP1 builds the hook on `useFetcherSettled`; if WP1 lands first, wp6 switches it over in its refactor (wp6 risk row "Overlap with sibling Studio packages on the fetcher layer"). WP1 cites only the canonical `2026-08-10-05-google-submission-data.md`, never the draft wp6 deletes, so wp6's "no remaining reference" grep stays clean. WP1 does not read `SERVICE_CATALOG[].name` (removed by wp5). |
| SEO (wp4) | none | `/studio` stays `noindex` through the existing security headers; WP1 adds no public route or meta. |

---

## 13. Review notes (adversarial review, 2026-10-13)

What this review changed, and why (all claims re-checked against the code at 6bd682a):

1. **Revalidation after errors.** React Router 8.3.0 does not revalidate loaders after an action that answers
   4xx/5xx (`node_modules/react-router/dist/development/lib/router/router.js:1937-1962`). The 404/409 messages
   ("The list has been refreshed") and §8 relied on that revalidation. `useCommissionAction` now revalidates
   explicitly on the stale-page codes (§4.1, §4.5, §8).
2. **Fetcher ownership.** Per-row or per-item fetchers would unmount when the row leaves a filtered list or a queue
   item is resolved, which loses the result toast and the Undo. All fetchers now live in `CommissionsInbox` /
   `NeedsAction`, following `projects-list-view.tsx:149-158`; e2e step 3 covers the filtered case.
3. **Cleanup dialog form.** `ConfirmDialog` renders `actions` outside `children`, so the Confirm button needs
   `form={formId}` plus `name="intent" value="confirm-cleanup"`; the spec did not say how the checkboxes and the
   intent reach the action (§4.5).
4. **Cleanup failures per plan 06 `:681`.** Any failed step must answer 503 retryable. A D1 error in the delete
   batch was rethrown to the error boundary (500 page). It now maps to 503 `cleanup_failed`, with a worker test.
5. **`temporaryRecords` derivation.** "No runtime row ⇔ cleaned" was false: status changes re-create the runtime
   row, and `0003` did not backfill. "Removed" now also requires a terminal status (§3.2, §4.4).
6. **Contradiction fixed.** §4.5 rendered the queues only when non-empty, while §4.10 required their anchors to
   exist. Both sections now always render.
7. **Tests that would assert the wrong thing.** (a) The UI test forbade "proof" in the markup, but the required
   student hint says "student proof". (b) The worker tests asserted exact global results ("all rows", exact
   counts), which breaks when tests in a file share rows; they now use membership and deltas. (c) The sentinel
   regex ran over the random cursor signature. (d) The retention-policy test would have failed on
   `confirmCleanup`'s own definition and would break when wp5 deletes the legacy route; it now exempts the
   definition, uses word boundaries and a subset rule, and checks the cron imports. (e) The studio-home test
   additions now avoid statuses that its existing exact counts include.
8. **Studio e2e hygiene.** The steps mutate shared seed rows, so the suite now runs serially with a seed in
   `beforeAll` and a teardown in `afterAll`. A new `commissions-studio-e2e-cleanup.sql` follows the repo's
   fixture/cleanup pairing. The home deep-link step now runs before the student decision, the axe tags include
   `wcag22aa` like `responsive-a11y.spec.ts`, and the spec states that the test never clicks Confirm cleanup, which
   would make a real call to `script.google.com`.
9. **Issue shape.** `invalid_request` issues now map to the existing `ValidationIssue` shape (`required` /
   `invalid_value`).
10. **Wrong line references.** `root.tsx:230-241` → `:31-42` (the file has 110 lines); `responses.ts:322-327` →
    `:96-101` (133 lines). Added the missing plan citations: plan 05 `:24,:28` (manual cleanup, then confirm; no
    automatic deletion), plan 06 `:544-545` (404, Origin check), `:549`, `:563`, `:681`, `:691` (layout deviation
    stated explicitly).
11. **Smaller fixes.** The filter form carries no cursor; focus moves to the section heading when an item leaves a
    queue; the attention rows get distinct link labels now that they lead to different places; a note not to reuse
    `services/price.ts` `formatMoney` for USD cents; Undo into a terminal status restarts the 7-day clock, which is
    now documented; `StubPanel` stays.
12. **Sibling packages** (their specs were read: wp2–wp6 under `docs/superpowers/specs/2026-10-13-*`).
    (a) wp6 (f) deletes the older plan 05 draft and greps for any remaining reference, so WP1 now cites only the
    canonical `2026-08-10-05-google-submission-data.md`. (b) wp6 (a) bans the busy-state-only fetcher pattern;
    `use-commission-action.ts` must use the 227faa1 rule or `useFetcherSettled`. (c) wp5 checks `STUDIO_PATHS` for
    `/studio/commissions` and adds it if missing, so WP1 adds its paths to that array (a separate block could
    duplicate a Playwright test title). (d) wp5 rewrites the same runbook lines after the flip, and keeps the
    reused services. All of this is recorded in §12.

Verified and unchanged: cleanup stays owner-confirmed and `workers/app.ts` does not change (plan 05 `:24,:28,:886,:891`,
site spec §16.3). The service contracts and SQL in `app/lib/admin/*` and `app/lib/cases/*` match
§3.2. Prices are only displayed, using the same formats as `service-price.tsx:15,24`. No migration, dependency or
lockfile change. Copy and fixtures contain no personal name. The route-guard test (`studio-route-guards.test.ts`)
keeps passing with the planned module shapes.

Integration-plan completeness review (2026-10-13, plan §9):

- The branch is `claude/wp1-commissions`.
- wp6 merges first (plan §5), so `use-commission-action.ts` is built on `useFetcherSettled` during the rebase.
- The optional list index of §6 would be `0011` or later. WP1 adds no migration, because `0009` and `0010` are taken
  (plan §2.1).
- The owner-list item "nightly retention cleanup" is closed by §2.3 and recorded as plan decision D7.
- `LocalizedText` comes from `app/lib/cms/types.ts` (plan §2.9).

---

## 14. Implementation deviations (recorded 2026-10-20)

Recorded here (plan §3.2: a package amends only its own spec, to record a deviation) so the reason does not live only
in a source comment.

1. **Cleanup error mapping after the ledger confirmed** (§4.4, §8, §11). The table above mapped every uncoded error
   inside the cleanup to 503 `cleanup_failed`, whose message says nothing was marked as done. That is false once the
   delete batch has committed (for example when only the read after it fails), and a retry would then answer 409
   `cleanup_not_due` for a cleanup that went through. `handleCommissionCleanup` therefore records whether the ledger
   call confirmed; an uncoded error before it stays `cleanup_failed`. After it, one read-back (`cases` and
   `case_runtime` only, never `submission_attempts`, §4.7) decides: runtime row still there → 503 `cleanup_failed`
   (nothing removed; retry safe); no runtime row and the case present → success; no runtime row and no case → 500
   `case_record_missing`; read-back fails → 503 `cleanup_unverified` ("The Studio could not check whether the cleanup
   finished. Reload the page: if the case is still in Cleanup due, confirm it again."). Worker tests: "answers 503 and
   marks nothing done when D1 fails after the ledger; a retry finishes", "reports the cleanup as done when only the
   read after the committed delete fails", "never says nothing was done when D1 cannot be read after the delete",
   "decides a failed cleanup without reading submission_attempts".
2. **Update is `aria-disabled`, not `disabled`, after hydration** (§4.5). A natively disabled button loses focus when
   it becomes disabled, and it does exactly that the moment a status change lands (the selection equals the stored
   status again), which would drop focus to `<body>` and break §4.10 ("a status change keeps focus on the row's
   Update button"). After hydration the button is `aria-disabled="true"` while the selection is unchanged or the
   case's change is in flight, and the form's submit handler posts nothing in that state. Before hydration it is
   natively `disabled` (the status change exists only in the React submit handler; a plain form submit would GET
   `?status=…`), which is what the §7.1 markup test sees. Studio e2e: "Update posts nothing while the selection is
   unchanged and keeps focus after a change".
3. **One queue per commissions fetcher** (§4.5 `use-commission-action.ts`). A second `fetcher.submit` on the shared
   fetcher aborts the first (its toast, its Undo and possibly the change are lost), so the hook queues a submission
   made while another is in flight and posts it once that one has settled (`useFetcherSettled`); rows and queue items
   are busy while their case is in flight or waiting. The cleanup checklist posts through the same queue (its form
   markup is unchanged; the submit handler calls the hook's `submit`), so confirming a second case while the first
   is in flight waits instead of being dropped, and "Confirming…" shows only for the dialog's own case.
4. **Focus after a student-price decision** (§4.5, §4.10). Focus moves to the "Student prices to check" heading only
   when the decided item took focus with it (the shared focus fallback of the case list and the cleanup queue); focus
   the owner moved elsewhere while the request ran stays there. The inline confirmation's buttons are named
   "Confirm decision for KAM-…" and "Cancel decision for KAM-…".
5. **Over-long cursor** (§4.3, §8). `parseCommissionQuery` still drops a cursor over 512 characters; the loader now
   reports it as `cursorRejected`, so the owner sees the same notice as for any other rejected page link.
