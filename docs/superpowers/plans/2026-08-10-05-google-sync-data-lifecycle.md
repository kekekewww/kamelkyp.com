# Kamel Google Sync and Data Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將通過伺服器驗證的完整委託內容冪等同步至 Google Form／Sheet 與管理者 Gmail，並完成失敗重試、成功清稿及七日個資清理流程。

**Architecture:** Worker 產生 Case ID、保存不含個資的 attempt metadata，並把完整 payload 編成 Base64URL 後以 HMAC-SHA256 簽署於 JSON Body。Apps Script 使用 Script Properties 保存短小冪等 Ledger；Google Form 成功但 MailApp 失敗時保留 form_written 狀態，下一次相同 Case ID 只重試 Email。

**Tech Stack:** Cloudflare Workers Web Crypto、D1、Google Apps Script V8、Google Forms FormResponse、MailApp、Vitest、Playwright。

## Global Constraints

- 前置計畫 01–04 已合併 main。
- Branch：codex/05-google-sync。
- 完整表單不得保存於 D1、Worker Log、GitHub Actions Log 或管理後台。
- 完整表單只傳入 Apps Script，並保存於 Google Form／相關 Sheet 與 Gmail。
- Apps Script 無法可靠讀取任意 Request Header，簽章欄位必須放在 JSON Body。
- Client 不收到確認 Email。
- 成功頁只顯示案件編號、日期、服務類型與保存提醒，不顯示完整表單。
- 只有 Form Response 與 Gmail 都完成後，瀏覽器才清除草稿。
- Case ID 是 Worker、Apps Script、Form、Mail 與 D1 的冪等鍵。
- HMAC timestamp 最多允許 300 秒差異；Payload 使用 Base64URL，不使用不穩定的 Object Key 排序作為簽章來源。
- 管理者 Gmail 地址與 HMAC Secret 只放 Worker Secret／Apps Script Properties。
- 交付、取消或暫停後七日，Kamel 手動刪除 Form／Sheet／Gmail 可識別資料，再在後台確認。
- 清理後 D1 只保留案件編號、服務類型、鎖定價格、日期、狀態。
- 申請學生優惠時，case_runtime 暫存一般價、學生價與 pending 狀態；Kamel 在 Google Form 人工驗證後由後台確認，隨即清空這些暫存欄位，cases 最後只留實際鎖定價格。
- 未完成同步且超過 24 小時的孤立 Case／Attempt 全部刪除。
- 不自動刪除 Kamel 尚未人工確認的 Google 資料。

---

## File Map

### Create

- migrations/0003_case_runtime.sql
- app/lib/integrations/hmac-envelope.ts
- app/lib/integrations/google-submission-gateway.server.ts
- app/lib/cases/case-id.ts
- app/lib/cases/case-repository.server.ts
- app/lib/cases/retention.server.ts
- app/lib/commission/submit.server.ts
- app/routes/api/commission-submit.ts
- app/routes/public/commission-success.tsx
- integrations/apps-script/Code.gs
- integrations/apps-script/appsscript.json
- integrations/apps-script/README.md
- tests/unit/hmac-envelope.test.ts
- tests/unit/case-id.test.ts
- tests/worker/google-gateway.test.ts
- tests/worker/commission-submit.test.ts
- tests/worker/retention.test.ts
- tests/apps-script/Code.test.ts
- tests/e2e/commission-submit.spec.ts
- tests/e2e/commission-retry.spec.ts

### Modify

- package.json
- app/lib/commission/prepare-submission.server.ts
- app/components/commission/commission-wizard.tsx
- app/routes.ts
- workers/app.ts
- scripts/render-wrangler-config.mjs

### Produced Interfaces

~~~ts
export interface SignedEnvelope {
  version: "v1";
  timestamp: string;
  nonce: string;
  caseId: string;
  payloadBase64Url: string;
  signatureBase64Url: string;
}

export interface GoogleSubmissionResult {
  state: "complete";
  googleResponseId: string;
  notified: true;
}

export interface SubmissionSuccess {
  caseId: string;
  serviceId: ServiceId;
  submittedAt: string;
}

export type SubmitCommissionResult =
  | ({ state: "complete" } & SubmissionSuccess)
  | ({ state: "pending_retry" } & SubmissionSuccess);

export interface PermanentCaseRecord {
  caseId: string;
  serviceId: ServiceId;
  lockedPriceMinor: number;
  currency: "TWD" | "USD";
  submittedAt: string;
  status: CaseStatus;
}
~~~

---

### Task 1: Define the HMAC envelope and Case ID

**Files:**
- Create: app/lib/integrations/hmac-envelope.ts
- Create: app/lib/cases/case-id.ts
- Create: tests/unit/hmac-envelope.test.ts
- Create: tests/unit/case-id.test.ts

**Interfaces:**
- Consumes: PreparedSubmission JSON.
- Produces: createSignedEnvelope(), verifySignedEnvelopeForTest(), createCaseId().

- [ ] **Step 1: Commit failing cryptographic and Case ID tests**

~~~ts
// tests/unit/hmac-envelope.test.ts
import { describe, expect, it } from "vitest";
import {
  createSignedEnvelope,
  verifySignedEnvelopeForTest,
} from "../../app/lib/integrations/hmac-envelope";

describe("HMAC envelope", () => {
  it("round-trips Unicode payload without depending on JSON property order", async () => {
    const envelope = await createSignedEnvelope({
      caseId: "KAM-20260810-01HZX8J4",
      payload: { displayName: "藝名 K", serviceId: "full_mix" },
      secret: "test-secret-with-at-least-32-characters",
      now: "2026-08-10T12:00:00.000Z",
      nonce: "f5dc165c-6f50-40d5-aee3-cc03128cbf58",
    });

    await expect(
      verifySignedEnvelopeForTest(
        envelope,
        "test-secret-with-at-least-32-characters",
      ),
    ).resolves.toEqual({
      displayName: "藝名 K",
      serviceId: "full_mix",
    });
  });

  it("rejects any payload change", async () => {
    const envelope = await createSignedEnvelope({
      caseId: "KAM-20260810-01HZX8J4",
      payload: { amount: 8000 },
      secret: "test-secret-with-at-least-32-characters",
      now: "2026-08-10T12:00:00.000Z",
      nonce: "f5dc165c-6f50-40d5-aee3-cc03128cbf58",
    });
    envelope.payloadBase64Url += "A";
    await expect(
      verifySignedEnvelopeForTest(
        envelope,
        "test-secret-with-at-least-32-characters",
      ),
    ).rejects.toThrow("invalid_signature");
  });
});
~~~

~~~ts
// tests/unit/case-id.test.ts
import { describe, expect, it } from "vitest";
import { createCaseId } from "../../app/lib/cases/case-id";

describe("Case ID", () => {
  it("contains date and a non-sequential Crockford suffix", () => {
    const id = createCaseId(
      new Date("2026-08-10T12:00:00Z"),
      new Uint8Array([1, 31, 10, 20, 30, 5]),
    );
    expect(id).toMatch(/^KAM-20260810-[0-9A-HJKMNP-TV-Z]{10}$/);
  });
});
~~~

- [ ] **Step 2: Run tests and verify failure**

~~~bash
npm run test:unit -- tests/unit/hmac-envelope.test.ts tests/unit/case-id.test.ts
~~~

Expected result: FAIL because both modules are absent.

- [ ] **Step 3: Implement the exact canonical message**

~~~ts
// app/lib/integrations/hmac-envelope.ts
export interface SignedEnvelope {
  version: "v1";
  timestamp: string;
  nonce: string;
  caseId: string;
  payloadBase64Url: string;
  signatureBase64Url: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function canonical(envelope: Omit<SignedEnvelope, "signatureBase64Url">): string {
  return [
    envelope.version,
    envelope.timestamp,
    envelope.nonce,
    envelope.caseId,
    envelope.payloadBase64Url,
  ].join("\n");
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
  );
}

export async function createSignedEnvelope(input: {
  caseId: string;
  payload: unknown;
  secret: string;
  now: string;
  nonce: string;
}): Promise<SignedEnvelope> {
  const payloadBase64Url = toBase64Url(
    new TextEncoder().encode(JSON.stringify(input.payload)),
  );
  const unsigned = {
    version: "v1" as const,
    timestamp: input.now,
    nonce: input.nonce,
    caseId: input.caseId,
    payloadBase64Url,
  };
  return {
    ...unsigned,
    signatureBase64Url: toBase64Url(
      await hmac(canonical(unsigned), input.secret),
    ),
  };
}

export async function verifySignedEnvelopeForTest(
  envelope: SignedEnvelope,
  secret: string,
): Promise<unknown> {
  const expected = await hmac(
    canonical({
      version: envelope.version,
      timestamp: envelope.timestamp,
      nonce: envelope.nonce,
      caseId: envelope.caseId,
      payloadBase64Url: envelope.payloadBase64Url,
    }),
    secret,
  );
  const actual = fromBase64Url(envelope.signatureBase64Url);
  if (
    expected.length !== actual.length ||
    !expected.every((byte, index) => byte === actual[index])
  ) {
    throw new Error("invalid_signature");
  }
  return JSON.parse(new TextDecoder().decode(fromBase64Url(envelope.payloadBase64Url)));
}
~~~

Production verification uses crypto.subtle.verify rather than the test-only byte comparison.

- [ ] **Step 4: Implement non-sequential Case IDs**

createCaseId formats UTC YYYYMMDD and encodes 6 random bytes into 10 Crockford Base32 characters. It excludes I, L, O and U and never uses a D1 row count. Production calls crypto.getRandomValues(new Uint8Array(6)).

- [ ] **Step 5: Run tests and commit**

~~~bash
npm run test:unit -- tests/unit/hmac-envelope.test.ts tests/unit/case-id.test.ts
npm run typecheck
~~~

Expected result: PASS.

Cloud commit message: feat: add signed submission envelopes.

---

### Task 2: Implement Apps Script Form and Gmail idempotency

**Files:**
- Create: integrations/apps-script/Code.gs
- Create: integrations/apps-script/appsscript.json
- Create: integrations/apps-script/README.md
- Create: tests/apps-script/Code.test.ts
- Modify: package.json

**Interfaces:**
- Consumes: SignedEnvelope V1 and Script Properties.
- Produces: JSON state complete, googleResponseId, notified.

- [ ] **Step 1: Commit failing Apps Script contract tests**

The test loads Code.gs into a V8 sandbox with mocks for Utilities, PropertiesService, LockService, FormApp and MailApp.

~~~ts
// tests/apps-script/Code.test.ts
it("writes one Form response and one email for duplicate complete requests", () => {
  const first = invokeDoPost(validSignedEvent);
  const second = invokeDoPost(validSignedEvent);
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(formSubmit).toHaveBeenCalledTimes(1);
  expect(mailSend).toHaveBeenCalledTimes(1);
});

it("retries only MailApp after Form submit succeeds", () => {
  mailSend.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(invokeDoPost(validSignedEvent).error.code).toBe("mail_failed");
  expect(invokeDoPost(validSignedEvent).ok).toBe(true);
  expect(formSubmit).toHaveBeenCalledTimes(1);
  expect(mailSend).toHaveBeenCalledTimes(2);
});

it("rejects expired timestamp and changed payload", () => {
  expect(invokeDoPost(expiredEvent).error.code).toBe("expired_request");
  expect(invokeDoPost(tamperedEvent).error.code).toBe("invalid_signature");
});
~~~

- [ ] **Step 2: Add the Node test command, run Apps Script tests and verify failure**

Add the script to package.json so Apps Script sandbox tests never use the Workers runtime:

~~~json
{
  "scripts": {
    "test:apps-script": "vitest run --config vitest.config.ts tests/apps-script"
  }
}
~~~

~~~bash
npm run test:apps-script
~~~

Expected result: FAIL because Code.gs is absent.

- [ ] **Step 3: Implement Apps Script verification and Ledger**

Script Properties required:

- FORM_ID
- ADMIN_EMAIL
- HMAC_SECRET
- FORM_ITEM_MAP as JSON mapping the exact keys below to Google Form Item IDs.

Form item keys:

- case_id
- submitted_at
- locale
- service
- locked_price
- display_name
- email
- contacts
- age_and_guardian
- student_and_proof
- project_links
- purpose_and_date
- credit_and_portfolio
- options
- service_details
- terms

Core Apps Script flow:

~~~js
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var envelope = JSON.parse(e.postData.contents);
    verifyEnvelope_(envelope);

    var ledgerKey = "case:" + envelope.caseId;
    var properties = PropertiesService.getScriptProperties();
    var ledgerRaw = properties.getProperty(ledgerKey);
    var ledger = ledgerRaw ? JSON.parse(ledgerRaw) : null;

    if (ledger && ledger.state === "complete") {
      return json_({
        ok: true,
        data: {
          state: "complete",
          googleResponseId: ledger.googleResponseId,
          notified: true
        }
      });
    }

    var payload = JSON.parse(
      Utilities.newBlob(
        Utilities.base64DecodeWebSafe(envelope.payloadBase64Url)
      ).getDataAsString("UTF-8")
    );

    if (!ledger || ledger.state === "created") {
      var responseId = submitForm_(envelope.caseId, payload);
      ledger = {
        state: "form_written",
        googleResponseId: responseId
      };
      properties.setProperty(ledgerKey, JSON.stringify(ledger));
    }

    try {
      sendAdminMail_(envelope.caseId, payload);
    } catch (mailError) {
      return json_({
        ok: false,
        error: { code: "mail_failed", message: "Notification is pending." }
      });
    }

    ledger.state = "complete";
    properties.setProperty(ledgerKey, JSON.stringify(ledger));
    return json_({
      ok: true,
      data: {
        state: "complete",
        googleResponseId: ledger.googleResponseId,
        notified: true
      }
    });
  } catch (error) {
    return json_({
      ok: false,
      error: {
        code: publicErrorCode_(error),
        message: "Submission could not be completed."
      }
    });
  } finally {
    lock.releaseLock();
  }
}
~~~

verifyEnvelope_:

1. Requires version v1.
2. Parses timestamp and rejects absolute difference over 300000 ms.
3. Reconstructs canonical string with newline separators.
4. Uses Utilities.computeHmacSha256Signature(canonical, HMAC_SECRET).
5. Encodes signature with Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "").
6. Compares equal length and every character without early return.
7. Decodes payload and checks payload.caseId equals envelope.caseId.

submitForm_ gets items by ID from FORM_ITEM_MAP. It uses the appropriate asTextItem() or asParagraphTextItem() adapter and includes every field listed above. It never uses mutable item titles as identifiers.

sendAdminMail_:

- To: ADMIN_EMAIL.
- Subject: [Kamel Commission] CASE_ID — SERVICE_ID.
- Text and HTML body both contain the complete normalized fields and quote.
- Every value in HTML passes escapeHtml_ for &, <, >, ", '.
- It does not send to payload.email.
- It does not include secrets or signature.

- [ ] **Step 4: Add cloud deployment instructions**

integrations/apps-script/README.md gives exact cloud steps:

1. Create one Google Form in the Kamel Google account.
2. Add the 16 item keys above and copy their numeric Item IDs.
3. Link the Form to a Google Sheet.
4. Open Apps Script from the Google account and paste Code.gs.
5. Set Script Properties FORM_ID, ADMIN_EMAIL, HMAC_SECRET and FORM_ITEM_MAP.
6. Deploy as Web App, execute as owner, access limited to the intended invocation policy.
7. Copy Web App URL to Cloudflare Worker Secret APPS_SCRIPT_URL.
8. Copy the same 32+ character HMAC value to Worker Secret APPS_SCRIPT_HMAC_SECRET.
9. Run the included signed health-test function from Apps Script editor.
10. Never publish the secret or item map in GitHub.

appsscript.json:

~~~json
{
  "timeZone": "Asia/Taipei",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
~~~

- [ ] **Step 5: Run tests and commit**

~~~bash
npm run test:apps-script
npm run format:check
~~~

Expected result: duplicate complete requests submit and mail once; partial failure submits once and mails twice; invalid signatures do neither.

Cloud commit message: feat: add idempotent Google Form and Gmail relay.

---

### Task 3: Add Worker Google gateway and retry-safe Case metadata

**Files:**
- Create: migrations/0003_case_runtime.sql
- Create: app/lib/integrations/google-submission-gateway.server.ts
- Create: app/lib/cases/case-repository.server.ts
- Create: app/lib/commission/submit.server.ts
- Create: app/routes/api/commission-submit.ts
- Create: tests/worker/google-gateway.test.ts
- Create: tests/worker/commission-submit.test.ts
- Modify: app/lib/commission/prepare-submission.server.ts
- Modify: app/routes.ts

**Interfaces:**
- Consumes: PreparedSubmission, SignedEnvelope, Apps Script URL and Secret.
- Produces: submitCommission(), POST /api/commission/submit.

- [ ] **Step 1: Commit failing retry and privacy tests**

~~~ts
// tests/worker/commission-submit.test.ts
it("stores only non-PII metadata when Google requires retry", async () => {
  const result = await submitCommission(failingGoogleInput);
  expect(result.state).toBe("pending_retry");
  expect(result.caseId).toMatch(/^KAM-/);
  const columns = await env.DB.prepare("PRAGMA table_info(submission_attempts)")
    .all<{ name: string }>();
  expect(columns.results.map((row) => row.name)).not.toEqual(
    expect.arrayContaining(["email", "contact", "project_url", "payload"]),
  );
});

it("reuses the same case only when the payload hash matches", async () => {
  const first = await submitCommission(mailFailureInput);
  expect(first.state).toBe("pending_retry");
  expect(await readStudentRuntime(first.caseId)).toMatchObject({
    studentReviewState: "pending",
    standardPriceMinor: expect.any(Number),
    studentPriceMinor: expect.any(Number),
  });

  const retry = await submitCommission({
    ...mailFailureInput,
    existingCaseId: first.caseId,
  });
  expect(retry.state).toBe("complete");

  await expect(
    submitCommission({
      ...changedPayloadInput,
      existingCaseId: first.caseId,
    }),
  ).rejects.toThrow("case_payload_mismatch");
});
~~~

- [ ] **Step 2: Run Worker tests and verify failure**

~~~bash
npm run test:worker -- tests/worker/google-gateway.test.ts tests/worker/commission-submit.test.ts
~~~

Expected result: FAIL because gateway and repository are absent.

- [ ] **Step 3: Create temporary runtime migration**

~~~sql
-- migrations/0003_case_runtime.sql
CREATE TABLE IF NOT EXISTS case_runtime (
  case_id TEXT PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
  cleanup_due_at TEXT,
  student_review_state TEXT NOT NULL DEFAULT 'none'
    CHECK (student_review_state IN ('none', 'pending')),
  standard_price_minor INTEGER,
  student_price_minor INTEGER,
  updated_at TEXT NOT NULL,
  CHECK (
    (student_review_state = 'none') OR
    (standard_price_minor IS NOT NULL AND student_price_minor IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS case_runtime_cleanup_due
  ON case_runtime(cleanup_due_at)
  WHERE cleanup_due_at IS NOT NULL;
~~~

The cases table itself contains only the permanent record. submission_attempts and case_runtime are deleted at confirmed cleanup.

case_runtime 的 student_review_state 與兩個候選價格不包含身份或證明 URL；完整學生證明只在 Google Form。Plan 06 的管理 action 在 Kamel 選擇接受時保留 student_price_minor、拒絕時把 cases.locked_price_minor 改為 standard_price_minor，之後把三個 runtime 欄位清為 none/null。

Google gateway:

~~~ts
export async function sendToGoogle(input: {
  url: string;
  secret: string;
  caseId: string;
  payload: unknown;
  now: string;
  fetcher: typeof fetch;
}): Promise<GoogleSubmissionResult> {
  const envelope = await createSignedEnvelope({
    caseId: input.caseId,
    payload: input.payload,
    secret: input.secret,
    now: input.now,
    nonce: crypto.randomUUID(),
  });

  const response = await input.fetcher(input.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
    redirect: "follow",
  });

  if (!response.ok) throw new Error("google_transport_failed");
  const result = await response.json<{
    ok: boolean;
    data?: GoogleSubmissionResult;
    error?: { code: string };
  }>();
  if (!result.ok || result.data?.state !== "complete") {
    throw new Error(
      result.error?.code === "mail_failed"
        ? "google_mail_pending"
        : "google_sync_failed",
    );
  }
  return result.data;
}
~~~

- [ ] **Step 4: Implement the final submission transaction**

submitCommission:

1. Rate limit before parsing full input.
2. Call prepareSubmission to parse, price, terms and Turnstile.
3. Compute SHA-256 of normalized full payload in memory.
4. If existingCaseId is supplied, load attempt and require matching hash.
5. Otherwise generate Case ID and insert:
   - cases permanent fields.
   - case_runtime updated_at；若 studentRequested=true，另寫 student_review_state=pending、相同幣別的一般價與學生價，否則 state=none 且價格欄為 null。
   - submission_attempts with hash, term IDs, accepted_at, state created.
6. Call sendToGoogle with the complete payload.
7. On any recoverable Google transport or mail-pending result, update the attempt state and return SubmitCommissionResult with state pending_retry and the same Case ID; do not clear the draft.
8. On complete, update attempt to complete/google response ID and return SubmitCommissionResult with state complete.
9. Never store the complete payload.
10. Never include googleResponseId in the public success response.

The route maps internal state pending_retry to the public retry_required error envelope and maps complete to success; submitCommission itself does not both throw and return for the same recoverable condition.

POST response:

~~~ts
type SubmitResponse =
  | {
      ok: true;
      data: {
        caseId: string;
        serviceId: ServiceId;
        submittedAt: string;
      };
    }
  | {
      ok: false;
      error: {
        code: "retry_required" | "validation_failed" | "service_unavailable";
        message: string;
        retryCaseId?: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
~~~

Browser stores retryCaseId separately at kamel:commission-attempt:v1:SERVICE until completion.

- [ ] **Step 5: Run tests and commit**

~~~bash
npm run test:worker -- tests/worker/google-gateway.test.ts tests/worker/commission-submit.test.ts
npm run typecheck
npm run build
~~~

Expected result: no PII in D1, retry case hash enforced, duplicate Google response avoided.

Cloud commit message: feat: submit commissions to Google without D1 PII.

---

### Task 4: Complete success and retry UX

**Files:**
- Create: app/routes/public/commission-success.tsx
- Create: tests/e2e/commission-submit.spec.ts
- Create: tests/e2e/commission-retry.spec.ts
- Modify: app/components/commission/commission-wizard.tsx
- Modify: app/routes.ts

**Interfaces:**
- Consumes: SubmitResponse.
- Produces: success route state with Case ID, service and date only.

- [ ] **Step 1: Commit failing E2E success and retry tests**

~~~ts
// tests/e2e/commission-submit.spec.ts
test("successful submit clears draft and shows limited confirmation", async ({ page }) => {
  await completeValidFullMix(page);
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Submit commission" }).click();

  await expect(page.getByText(/KAM-\d{8}-[0-9A-HJKMNP-TV-Z]{10}/)).toBeVisible();
  await expect(page.getByText("Full Song Mixing")).toBeVisible();
  await expect(page.getByText("artist@example.com")).toHaveCount(0);
  await expect(page.getByText("https://drive.google.com")).toHaveCount(0);

  const draft = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("kamel:commission:")),
  );
  expect(draft).toEqual([]);
});

test("does not send a client confirmation email", async () => {
  expect(mockMailRecipients).toEqual(["admin@example.com"]);
});
~~~

~~~ts
// tests/e2e/commission-retry.spec.ts
test("mail failure preserves draft and retry case", async ({ page }) => {
  await configureGoogleMock(page, "form_written_mail_failed");
  await completeValidFullMix(page);
  await page.getByRole("button", { name: "Submit commission" }).click();

  await expect(page.getByText("Your form is saved in Google, but notification is still pending.")).toBeVisible();
  expect(await readDraft(page)).not.toBeNull();

  await configureGoogleMock(page, "complete");
  await page.getByRole("button", { name: "Retry notification" }).click();
  await expect(page.getByText(/KAM-/)).toBeVisible();
  expect(await readDraft(page)).toBeNull();
});
~~~

- [ ] **Step 2: Run E2E and verify failure**

Expected: FAIL because Wizard still calls prepare only.

- [ ] **Step 3: Replace Preview prepare with final submit**

- Final button loads a fresh Turnstile token immediately before POST.
- On timeout-or-duplicate, reset the widget and keep all fields.
- On retry_required, persist retryCaseId and show one retry button.
- On success, clear form draft, terms state, Turnstile token and retryCaseId.
- Navigate using replace to the success route with server-returned case ID, service ID and date.
- Success page renders only Case ID, date, localized service name and screenshot/save reminder.
- Browser Back must not reveal the submitted form from route state.

- [ ] **Step 4: Run E2E**

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/commission-submit.spec.ts tests/e2e/commission-retry.spec.ts
~~~

Expected result: PASS. Form and Email mocks show one Form response and one eventual admin Email.

- [ ] **Step 5: Commit**

Cloud commit message: feat: complete retry-safe commission submission UX.

---

### Task 5: Implement seven-day cleanup metadata and orphan removal

**Files:**
- Create: app/lib/cases/retention.server.ts
- Create: tests/worker/retention.test.ts
- Modify: app/lib/cases/case-repository.server.ts
- Modify: workers/app.ts

**Interfaces:**
- Consumes: CaseStatus, case_runtime, submission_attempts.
- Produces: markCaseTerminal(), listCleanupDue(), confirmCleanup(), deleteOrphanAttempts().

- [ ] **Step 1: Commit failing retention tests**

~~~ts
// tests/worker/retention.test.ts
it("sets cleanup seven days after delivered, cancelled or paused", async () => {
  await markCaseTerminal(env.DB, "KAM-1", "delivered", "2026-08-10T12:00:00Z");
  expect(await getCleanupDue(env.DB, "KAM-1")).toBe("2026-08-17T12:00:00.000Z");
});

it("confirmed cleanup removes all temporary metadata", async () => {
  await confirmCleanup(env.DB, "KAM-1", "2026-08-18T00:00:00Z");
  expect(await getSubmissionAttempt(env.DB, "KAM-1")).toBeNull();
  expect(await getCaseRuntime(env.DB, "KAM-1")).toBeNull();
  expect(await getPermanentCase(env.DB, "KAM-1")).toMatchObject({
    caseId: "KAM-1",
    status: "delivered",
  });
});

it("deletes incomplete attempts older than 24 hours", async () => {
  await deleteOrphanAttempts(env.DB, "2026-08-11T13:00:00Z");
  expect(await getPermanentCase(env.DB, "KAM-ORPHAN")).toBeNull();
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
npm run test:worker -- tests/worker/retention.test.ts
~~~

Expected result: FAIL because retention module is absent.

- [ ] **Step 3: Implement retention functions**

- markCaseTerminal accepts only delivered, cancelled or paused.
- It updates cases.status and upserts case_runtime.cleanup_due_at to terminal time + 7 × 24 hours.
- listCleanupDue returns Case ID, service, terminal status, submitted date and cleanup due only.
- confirmCleanup first requires runtime cleanup_due_at <= now, then D1 batch deletes submission_attempts and case_runtime.
- It does not delete Google data; the API caller must show an explicit confirmation that Kamel already deleted Form／Sheet／Gmail records.
- deleteOrphanAttempts deletes cases whose submission attempt is not complete and updated_at < now - 24 hours.

- [ ] **Step 4: Add orphan cleanup to scheduled handler and test**

scheduled handler runs both refreshFxRate and deleteOrphanAttempts using ctx.waitUntil(Promise.all(...)). It does not auto-confirm seven-day cleanup.

~~~bash
npm run test:worker -- tests/worker/retention.test.ts
npm run check
~~~

Expected result: PASS.

- [ ] **Step 5: Commit and open PR**

Cloud commit message: feat: add commission data retention lifecycle.

Create PR codex/05-google-sync → main. Before merge, complete one Preview submission using a dedicated test Google Form and test Gmail recipient; verify no full form appears in D1 or logs.
