/**
 * Studio Commissions inbox (wp1 §7.2): loader model, privacy whitelist and
 * the three resource-route handlers, against the migrated D1 (no HTTP).
 *
 * Rows from earlier tests in this file stay in D1, so every test uses its
 * own `submitted_at` window and asserts membership or deltas, never an
 * exact global row count. Case IDs are deterministic (`W` + counter).
 */
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  appsScriptCleanupGateway,
  type CleanupGateway,
  handleCommissionCleanup,
  handleCommissionStatus,
  handleStudentDiscount,
  loadCommissions,
} from "../../app/lib/cms/repositories/commissions.server";
import type {
  CaseStatus,
  ServiceId,
} from "../../app/lib/cms/schemas/commission";
import { getStudioCounts } from "../../app/lib/cms/studio/attention.server";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const SECRET = "studio-commissions-cursor-secret-at-least-32-chars";
const DAY = 24 * 60 * 60 * 1000;

const SENTINELS = [
  "sentinel-payload-hash",
  "sentinel-google-id",
  "sentinel-terms",
  "sentinel-error",
];

let counter = 0;
function nextCaseId(submittedAt: string): string {
  counter += 1;
  const date = submittedAt.slice(0, 10).replaceAll("-", "");
  return `KAM-${date}-W${String(counter).padStart(9, "0")}`;
}

type Seed = {
  submittedAt: string;
  serviceId?: ServiceId;
  status?: CaseStatus;
  lockedPriceMinor?: number;
  currency?: "TWD" | "USD";
  cleanupDueAt?: string | null;
  student?: { standard: number; student: number };
  /** `false`: no case_runtime row (a case created before 0003). */
  runtime?: boolean;
};

async function seedCase(seed: Seed): Promise<string> {
  const caseId = nextCaseId(seed.submittedAt);
  const statements = [
    env.DB.prepare(
      "INSERT INTO cases (case_id, service_id, locked_price_minor, currency, submitted_at, status) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      caseId,
      seed.serviceId ?? "full_mix",
      seed.lockedPriceMinor ?? 8000,
      seed.currency ?? "TWD",
      seed.submittedAt,
      seed.status ?? "pending_review",
    ),
    env.DB.prepare(
      "INSERT INTO submission_attempts (case_id, state, payload_hash, terms_versions_json, terms_accepted_at, google_response_id, last_error_code, updated_at) VALUES (?, 'complete', 'sentinel-payload-hash', '[\"sentinel-terms\"]', ?, 'sentinel-google-id', 'sentinel-error', ?)",
    ).bind(caseId, seed.submittedAt, seed.submittedAt),
  ];
  if (seed.runtime !== false) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO case_runtime (case_id, cleanup_due_at, student_review_state, standard_price_minor, student_price_minor, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        caseId,
        seed.cleanupDueAt ?? null,
        seed.student ? "pending" : "none",
        seed.student?.standard ?? null,
        seed.student?.student ?? null,
        seed.submittedAt,
      ),
    );
  }
  await env.DB.batch(statements);
  return caseId;
}

function load(search = "", limit?: number, db: D1Database = env.DB) {
  return loadCommissions({
    db,
    url: new URL(`https://kamelkyp.test/studio/commissions${search}`),
    cursorSecret: SECRET,
    now: NOW,
    ...(limit ? { limit } : {}),
  });
}

type Unwrapped = { status: number; body: Record<string, unknown> };

function unwrap(result: unknown): Unwrapped {
  const value = result as {
    data?: Record<string, unknown>;
    init?: ResponseInit | null;
  };
  return { status: value.init?.status ?? 200, body: value.data ?? {} };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

async function setStatus(fields: Record<string, string>, now = NOW) {
  return unwrap(
    await handleCommissionStatus({
      db: env.DB,
      formData: form(fields),
      intent: fields.intent ?? null,
      now,
    }),
  );
}

async function decide(fields: Record<string, string>) {
  return unwrap(
    await handleStudentDiscount({
      db: env.DB,
      formData: form(fields),
      intent: fields.intent ?? null,
    }),
  );
}

const CHECKLIST = {
  googleRecordsDeleted: "on",
  gmailDeleted: "on",
  otherSensitiveCopiesDeleted: "on",
};

function okGateway() {
  const cleanupLedger = vi.fn<CleanupGateway["cleanupLedger"]>(
    async () => undefined,
  );
  return { gateway: { cleanupLedger }, cleanupLedger };
}

async function cleanup(
  fields: Record<string, string>,
  gateway: CleanupGateway,
  db: D1Database = env.DB,
) {
  return unwrap(
    await handleCommissionCleanup({
      db,
      formData: form(fields),
      intent: fields.intent ?? null,
      now: NOW,
      gateway,
    }),
  );
}

async function runtimeOf(caseId: string) {
  return env.DB.prepare(
    "SELECT cleanup_due_at, student_review_state, standard_price_minor, student_price_minor FROM case_runtime WHERE case_id = ?",
  )
    .bind(caseId)
    .first<{
      cleanup_due_at: string | null;
      student_review_state: string;
      standard_price_minor: number | null;
      student_price_minor: number | null;
    }>();
}

async function attemptOf(caseId: string) {
  return env.DB.prepare(
    "SELECT case_id FROM submission_attempts WHERE case_id = ?",
  )
    .bind(caseId)
    .first("case_id");
}

async function caseOf(caseId: string) {
  return env.DB.prepare(
    "SELECT locked_price_minor, currency, status FROM cases WHERE case_id = ?",
  )
    .bind(caseId)
    .first<{ locked_price_minor: number; currency: string; status: string }>();
}

describe("loadCommissions", () => {
  it("returns only the whitelisted fields, never submission data", async () => {
    const review = await seedCase({
      submittedAt: "2026-09-01T01:00:00.000Z",
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const due = await seedCase({
      submittedAt: "2026-09-01T02:00:00.000Z",
      status: "delivered",
      cleanupDueAt: "2026-10-08T00:00:00.000Z",
    });
    const usd = await seedCase({
      submittedAt: "2026-09-01T03:00:00.000Z",
      status: "in_production",
      lockedPriceMinor: 26000,
      currency: "USD",
    });
    const model = await load();
    const ids = model.cases.map((row) => row.caseId);
    expect(ids).toEqual(expect.arrayContaining([review, due, usd]));
    for (const row of model.cases) {
      expect(Object.keys(row).sort()).toEqual([
        "caseId",
        "cleanupDueAt",
        "currency",
        "lockedPriceMinor",
        "serviceId",
        "status",
        "studentReviewPending",
        "submittedAt",
        "temporaryRecords",
      ]);
    }
    for (const item of model.studentReviews) {
      expect(Object.keys(item).sort()).toEqual([
        "caseId",
        "currency",
        "serviceId",
        "standardPriceMinor",
        "studentPriceMinor",
        "submittedAt",
      ]);
    }
    for (const item of model.cleanupDue) {
      expect(Object.keys(item).sort()).toEqual([
        "caseId",
        "cleanupDueAt",
        "serviceId",
        "status",
        "studentReviewPending",
        "submittedAt",
      ]);
    }
    expect(Object.keys(model).sort()).toEqual([
      "cases",
      "cleanupDue",
      "cursorRejected",
      "nextCursor",
      "now",
      "query",
      "services",
      "studentReviews",
    ]);
    const json = JSON.stringify({ ...model, nextCursor: null });
    for (const sentinel of SENTINELS) expect(json).not.toContain(sentinel);
    expect(json).not.toMatch(/payload|hash|google|terms|email|proof|nonce/i);

    const usdRow = model.cases.find((row) => row.caseId === usd);
    expect(usdRow).toMatchObject({
      lockedPriceMinor: 26000,
      currency: "USD",
      status: "in_production",
      cleanupDueAt: null,
      studentReviewPending: false,
      temporaryRecords: "kept",
    });
    expect(model.cases.find((row) => row.caseId === review)).toMatchObject({
      studentReviewPending: true,
    });
    expect(model.cases.find((row) => row.caseId === due)).toMatchObject({
      cleanupDueAt: "2026-10-08T00:00:00.000Z",
    });
    expect(model.now).toBe(NOW.toISOString());
  });

  it("names the four services from services.name_i18n in definition order", async () => {
    const model = await load();
    expect(model.services.map((service) => service.id)).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
    expect(model.services[0]?.name).toEqual({
      zh: "完整歌曲混音",
      en: "Full Song Mixing",
    });
  });

  it("filters by status and service and ignores unknown values", async () => {
    const delivered = await seedCase({
      submittedAt: "2026-08-01T01:00:00.000Z",
      status: "delivered",
      serviceId: "full_mix",
      cleanupDueAt: "2026-12-01T00:00:00.000Z",
    });
    const vocal = await seedCase({
      submittedAt: "2026-08-01T02:00:00.000Z",
      serviceId: "vocal_mix",
    });
    const transition = await seedCase({
      submittedAt: "2026-08-01T03:00:00.000Z",
      status: "in_production",
      serviceId: "simple_transition",
    });

    const byStatus = await load("?status=delivered");
    expect(byStatus.query.status).toBe("delivered");
    expect(byStatus.cases.every((row) => row.status === "delivered")).toBe(
      true,
    );
    expect(byStatus.cases.map((row) => row.caseId)).toContain(delivered);
    expect(byStatus.cases.map((row) => row.caseId)).not.toContain(vocal);

    const byService = await load("?service=vocal_mix");
    expect(byService.query.service).toBe("vocal_mix");
    expect(byService.cases.every((row) => row.serviceId === "vocal_mix")).toBe(
      true,
    );
    expect(byService.cases.map((row) => row.caseId)).toContain(vocal);
    expect(byService.cases.map((row) => row.caseId)).not.toContain(transition);

    const ignored = await load("?status=accepted&service=x");
    expect(ignored.query).toEqual({
      status: null,
      service: null,
      cursor: null,
    });
    expect(ignored.cases.map((row) => row.caseId)).toEqual(
      expect.arrayContaining([delivered, vocal, transition]),
    );
  });

  it("pages with a signed cursor, newest first", async () => {
    const first = await seedCase({ submittedAt: "2099-12-01T00:00:00.000Z" });
    const second = await seedCase({ submittedAt: "2099-12-02T00:00:00.000Z" });
    const third = await seedCase({ submittedAt: "2099-12-03T00:00:00.000Z" });
    const page = await load("", 2);
    expect(page.cases.map((row) => row.caseId)).toEqual([third, second]);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const older = await load(
      `?cursor=${encodeURIComponent(page.nextCursor ?? "")}`,
      2,
    );
    expect(older.cursorRejected).toBe(false);
    expect(older.query.cursor).toBe(page.nextCursor);
    expect(older.cases[0]?.caseId).toBe(first);
  });

  it("falls back to the first page when the cursor is invalid", async () => {
    const model = await load("?cursor=bogus");
    expect(model.cursorRejected).toBe(true);
    expect(model.query.cursor).toBeNull();
    expect(model.cases.length).toBeGreaterThan(0);
  });

  it("lists every pending student price and due cleanup, whatever the filter", async () => {
    const student = await seedCase({
      submittedAt: "2026-06-01T01:00:00.000Z",
      status: "preview_approval",
      serviceId: "vocal_mix",
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const due = await seedCase({
      submittedAt: "2026-06-01T02:00:00.000Z",
      status: "cancelled",
      serviceId: "edit_transition",
      cleanupDueAt: "2026-10-01T00:00:00.000Z",
    });
    const dueWithStudent = await seedCase({
      submittedAt: "2026-06-01T03:00:00.000Z",
      status: "paused",
      cleanupDueAt: "2026-10-02T00:00:00.000Z",
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const future = await seedCase({
      submittedAt: "2026-06-01T04:00:00.000Z",
      status: "paused",
      cleanupDueAt: "2026-10-20T00:00:00.000Z",
    });
    const model = await load("?status=pending_deposit&service=full_mix");
    expect(model.cases.map((row) => row.caseId)).not.toContain(student);
    expect(model.studentReviews).toContainEqual({
      caseId: student,
      serviceId: "vocal_mix",
      submittedAt: "2026-06-01T01:00:00.000Z",
      currency: "TWD",
      standardPriceMinor: 8000,
      studentPriceMinor: 5600,
    });
    expect(model.cleanupDue).toContainEqual({
      caseId: due,
      serviceId: "edit_transition",
      status: "cancelled",
      submittedAt: "2026-06-01T02:00:00.000Z",
      cleanupDueAt: "2026-10-01T00:00:00.000Z",
      studentReviewPending: false,
    });
    expect(
      model.cleanupDue.find((item) => item.caseId === dueWithStudent),
    ).toMatchObject({ studentReviewPending: true });
    expect(model.cleanupDue.map((item) => item.caseId)).not.toContain(future);
  });

  it("marks only terminal cases without runtime data as cleaned", async () => {
    const legacy = await seedCase({
      submittedAt: "2026-05-01T01:00:00.000Z",
      runtime: false,
    });
    const cleaned = await seedCase({
      submittedAt: "2026-05-01T02:00:00.000Z",
      status: "delivered",
      runtime: false,
    });
    const model = await load();
    expect(
      model.cases.find((row) => row.caseId === legacy)?.temporaryRecords,
    ).toBe("kept");
    expect(
      model.cases.find((row) => row.caseId === cleaned)?.temporaryRecords,
    ).toBe("removed");
  });
});

describe("handleCommissionStatus", () => {
  it("refuses unknown intents and missing form data", async () => {
    expect((await setStatus({ intent: "nope" })).status).toBe(422);
    expect((await setStatus({ intent: "nope" })).body.code).toBe(
      "unknown_intent",
    );
    const missing = unwrap(
      await handleCommissionStatus({
        db: env.DB,
        formData: null,
        intent: null,
        now: NOW,
      }),
    );
    expect(missing.status).toBe(422);
  });

  it("answers 422 with validation issues for a bad case ID or status", async () => {
    const badId = await setStatus({
      intent: "set-status",
      caseId: "KAM-1",
      status: "delivered",
    });
    expect(badId.status).toBe(422);
    expect(badId.body.code).toBe("invalid_request");
    const issues = badId.body.issues as Array<Record<string, unknown>>;
    expect(issues).toContainEqual({
      field: "caseId",
      code: "invalid_value",
      severity: "error",
      message: expect.any(String),
    });

    const badStatus = await setStatus({
      intent: "set-status",
      caseId: "KAM-20260401-W000000000",
      status: "accepted",
    });
    expect(badStatus.status).toBe(422);
    expect(badStatus.body.issues).toContainEqual(
      expect.objectContaining({ field: "status", code: "invalid_value" }),
    );

    const missing = await setStatus({ intent: "set-status" });
    expect(missing.status).toBe(422);
    expect(missing.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "caseId", code: "required" }),
        expect.objectContaining({ field: "status", code: "required" }),
      ]),
    );
  });

  it("answers 404 for a case that does not exist", async () => {
    const result = await setStatus({
      intent: "set-status",
      caseId: "KAM-20260401-W000000000",
      status: "delivered",
    });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe("case_not_found");
    expect(result.body.message).toMatch(/refreshed/);
  });

  it("schedules the cleanup on a terminal status and clears it otherwise", async () => {
    const caseId = await seedCase({ submittedAt: "2026-04-01T01:00:00.000Z" });
    const delivered = await setStatus({
      intent: "set-status",
      caseId,
      status: "delivered",
    });
    const due = new Date(NOW.getTime() + 7 * DAY).toISOString();
    expect(delivered.status).toBe(200);
    expect(delivered.body).toEqual({
      ok: true,
      intent: "set-status",
      caseId,
      status: "delivered",
      previousStatus: "pending_review",
      cleanupDueAt: due,
      unchanged: false,
    });
    expect((await runtimeOf(caseId))?.cleanup_due_at).toBe(due);
    expect((await caseOf(caseId))?.status).toBe("delivered");

    const later = new Date(NOW.getTime() + DAY);
    const again = await setStatus(
      { intent: "set-status", caseId, status: "delivered" },
      later,
    );
    expect(again.body).toMatchObject({
      unchanged: true,
      previousStatus: "delivered",
      cleanupDueAt: due,
    });
    expect((await runtimeOf(caseId))?.cleanup_due_at).toBe(due);

    const back = await setStatus({
      intent: "set-status",
      caseId,
      status: "in_production",
    });
    expect(back.body).toMatchObject({
      status: "in_production",
      previousStatus: "delivered",
      cleanupDueAt: null,
      unchanged: false,
    });
    expect((await runtimeOf(caseId))?.cleanup_due_at).toBeNull();
  });

  it("keeps the cases table at its six permanent columns", async () => {
    const columns = await env.DB.prepare("PRAGMA table_info(cases)").all<{
      name: string;
    }>();
    expect(columns.results.map((column) => column.name).sort()).toEqual([
      "case_id",
      "currency",
      "locked_price_minor",
      "service_id",
      "status",
      "submitted_at",
    ]);
  });
});

describe("handleStudentDiscount", () => {
  it("keeps the stored student price when accepted, once", async () => {
    const caseId = await seedCase({
      submittedAt: "2026-03-01T01:00:00.000Z",
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const accepted = await decide({ intent: "accept-student-price", caseId });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({
      ok: true,
      intent: "accept-student-price",
      caseId,
      lockedPriceMinor: 5600,
      currency: "TWD",
    });
    expect((await caseOf(caseId))?.locked_price_minor).toBe(5600);
    expect(await runtimeOf(caseId)).toMatchObject({
      student_review_state: "none",
      standard_price_minor: null,
      student_price_minor: null,
    });

    const repeat = await decide({ intent: "reject-student-price", caseId });
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe("student_review_conflict");
    expect((await caseOf(caseId))?.locked_price_minor).toBe(5600);
  });

  it("restores the stored standard price in the same currency when rejected", async () => {
    const caseId = await seedCase({
      submittedAt: "2026-03-01T02:00:00.000Z",
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const rejected = await decide({ intent: "reject-student-price", caseId });
    expect(rejected.body).toMatchObject({
      intent: "reject-student-price",
      lockedPriceMinor: 8000,
      currency: "TWD",
    });
    const stored = await caseOf(caseId);
    expect(stored).toMatchObject({ locked_price_minor: 8000, currency: "TWD" });
    // Both candidate prices are cleared, as after an accepted student price.
    expect(await runtimeOf(caseId)).toMatchObject({
      student_review_state: "none",
      standard_price_minor: null,
      student_price_minor: null,
    });
  });

  it("answers 409 for an unknown case and 422 for bad input", async () => {
    const unknown = await decide({
      intent: "accept-student-price",
      caseId: "KAM-20260301-W000000000",
    });
    expect(unknown.status).toBe(409);
    expect(unknown.body.code).toBe("student_review_conflict");
    const bad = await decide({ intent: "accept-student-price", caseId: "x" });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("invalid_request");
    const intent = await decide({ intent: "accept", caseId: "x" });
    expect(intent.status).toBe(422);
    expect(intent.body.code).toBe("unknown_intent");
  });
});

describe("handleCommissionCleanup", () => {
  const dueCase = (submittedAt: string, extra: Partial<Seed> = {}) =>
    seedCase({
      submittedAt,
      status: "delivered",
      cleanupDueAt: "2026-10-08T00:00:00.000Z",
      ...extra,
    });

  it("refuses an incomplete checklist before touching D1 or the ledger", async () => {
    const caseId = await dueCase("2026-02-01T01:00:00.000Z");
    const { gateway, cleanupLedger } = okGateway();
    const result = await cleanup(
      { intent: "confirm-cleanup", caseId, googleRecordsDeleted: "on" },
      gateway,
    );
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("cleanup_checklist_incomplete");
    expect(result.body.issues).toEqual([
      expect.objectContaining({ field: "gmailDeleted", code: "required" }),
      expect.objectContaining({
        field: "otherSensitiveCopiesDeleted",
        code: "required",
      }),
    ]);
    expect(cleanupLedger).not.toHaveBeenCalled();
    expect(await runtimeOf(caseId)).not.toBeNull();
    expect(await attemptOf(caseId)).toBe(caseId);
  });

  it("answers 409 when the cleanup is not due or a student price is open", async () => {
    const notDue = await dueCase("2026-02-01T02:00:00.000Z", {
      cleanupDueAt: "2026-10-20T00:00:00.000Z",
    });
    const student = await dueCase("2026-02-01T03:00:00.000Z", {
      lockedPriceMinor: 5600,
      student: { standard: 8000, student: 5600 },
    });
    const { gateway, cleanupLedger } = okGateway();
    const early = await cleanup(
      { intent: "confirm-cleanup", caseId: notDue, ...CHECKLIST },
      gateway,
    );
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("cleanup_not_due");
    const pending = await cleanup(
      { intent: "confirm-cleanup", caseId: student, ...CHECKLIST },
      gateway,
    );
    expect(pending.status).toBe(409);
    expect(pending.body.code).toBe("student_review_pending");
    expect(cleanupLedger).not.toHaveBeenCalled();
  });

  it("deletes nothing when the Apps Script ledger fails", async () => {
    const caseId = await dueCase("2026-02-01T04:00:00.000Z");
    const result = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      { cleanupLedger: async () => Promise.reject(new Error("down")) },
    );
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("cleanup_gateway_failed");
    expect(await runtimeOf(caseId)).not.toBeNull();
    expect(await attemptOf(caseId)).toBe(caseId);
  });

  it("answers 503 and marks nothing done when D1 fails after the ledger; a retry finishes", async () => {
    const caseId = await dueCase("2026-02-01T05:00:00.000Z");
    const { gateway, cleanupLedger } = okGateway();
    const failing = {
      prepare: (query: string) => env.DB.prepare(query),
      batch: async () => {
        throw new Error("d1_unavailable");
      },
    } as unknown as D1Database;
    const failed = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      gateway,
      failing,
    );
    expect(failed.status).toBe(503);
    expect(failed.body.code).toBe("cleanup_failed");
    expect(await runtimeOf(caseId)).not.toBeNull();
    expect(await attemptOf(caseId)).toBe(caseId);

    const retry = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      gateway,
    );
    expect(retry.status).toBe(200);
    expect(cleanupLedger).toHaveBeenCalledTimes(2);
    expect(await runtimeOf(caseId)).toBeNull();
  });

  /** `env.DB` whose matching reads fail once the delete batch has committed. */
  function failingAfterCommit(fails: (query: string) => boolean): D1Database {
    let committed = false;
    const broken = {
      bind: () => broken,
      first: async () => {
        throw new Error("d1_unavailable");
      },
      all: async () => {
        throw new Error("d1_unavailable");
      },
    };
    return {
      prepare: (query: string) =>
        committed && fails(query) ? broken : env.DB.prepare(query),
      batch: async (statements: D1PreparedStatement[]) => {
        const results = await env.DB.batch(statements);
        committed = true;
        return results;
      },
    } as unknown as D1Database;
  }

  it("reports the cleanup as done when only the read after the committed delete fails", async () => {
    const caseId = await dueCase("2026-02-01T07:00:00.000Z");
    const { gateway, cleanupLedger } = okGateway();
    const result = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      gateway,
      failingAfterCommit(
        (query) => query === "SELECT case_id FROM cases WHERE case_id = ?",
      ),
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      intent: "confirm-cleanup",
      caseId,
    });
    expect(cleanupLedger).toHaveBeenCalledTimes(1);
    expect(await runtimeOf(caseId)).toBeNull();
    expect(await attemptOf(caseId)).toBeNull();
    expect((await caseOf(caseId))?.status).toBe("delivered");
  });

  it("never says nothing was done when D1 cannot be read after the delete", async () => {
    const caseId = await dueCase("2026-02-01T08:00:00.000Z");
    const { gateway } = okGateway();
    const result = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      gateway,
      failingAfterCommit(() => true),
    );
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("cleanup_unverified");
    expect(String(result.body.message)).not.toMatch(/nothing was/i);
    // The delete did commit.
    expect(await runtimeOf(caseId)).toBeNull();
    expect(await attemptOf(caseId)).toBeNull();
  });

  it("removes the temporary records after the ledger confirms and keeps the case", async () => {
    const caseId = await dueCase("2026-02-01T06:00:00.000Z");
    const { gateway, cleanupLedger } = okGateway();
    const result = await cleanup(
      { intent: "confirm-cleanup", caseId, ...CHECKLIST },
      gateway,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      intent: "confirm-cleanup",
      caseId,
    });
    expect(cleanupLedger).toHaveBeenCalledTimes(1);
    expect(cleanupLedger).toHaveBeenCalledWith({
      caseId,
      now: NOW.toISOString(),
    });
    expect(await runtimeOf(caseId)).toBeNull();
    expect(await attemptOf(caseId)).toBeNull();
    expect((await caseOf(caseId))?.status).toBe("delivered");

    const after = await load();
    expect(after.cases.find((row) => row.caseId === caseId)).toMatchObject({
      temporaryRecords: "removed",
      cleanupDueAt: null,
    });
    expect(after.cleanupDue.map((item) => item.caseId)).not.toContain(caseId);

    await setStatus({ intent: "set-status", caseId, status: "in_production" });
    const reopened = await load();
    expect(reopened.cases.find((row) => row.caseId === caseId)).toMatchObject({
      status: "in_production",
      temporaryRecords: "kept",
    });
  });

  it("refuses unknown intents and bad case IDs", async () => {
    const { gateway, cleanupLedger } = okGateway();
    const intent = await cleanup(
      { intent: "cleanup", caseId: "x", ...CHECKLIST },
      gateway,
    );
    expect(intent.status).toBe(422);
    expect(intent.body.code).toBe("unknown_intent");
    const bad = await cleanup(
      { intent: "confirm-cleanup", caseId: "x", ...CHECKLIST },
      gateway,
    );
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("invalid_request");
    expect(cleanupLedger).not.toHaveBeenCalled();
  });
});

describe("appsScriptCleanupGateway", () => {
  it("posts one signed cleanup_ledger envelope to the Apps Script URL", async () => {
    const caseId = "KAM-20261001-W000000000";
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        ok: true,
        data: { operation: "cleanup_ledger", caseId },
      }),
    );
    const gateway = appsScriptCleanupGateway(
      {
        APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
        APPS_SCRIPT_HMAC_SECRET: "studio-commissions-hmac-secret-32-characters",
      },
      fetcher,
    );
    await gateway.cleanupLedger({ caseId, now: NOW.toISOString() });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://script.google.com/macros/s/test/exec");
    const envelope = JSON.parse(String(init?.body)) as {
      caseId: string;
      payloadBase64Url: string;
    };
    expect(envelope.caseId).toBe(caseId);
    const payload = JSON.parse(
      atob(envelope.payloadBase64Url.replaceAll("-", "+").replaceAll("_", "/")),
    );
    expect(payload).toEqual({ operation: "cleanup_ledger", caseId });
  });
});

describe("sidebar count", () => {
  it("grows by the pending-review cases this test adds", async () => {
    const before = await getStudioCounts(env.DB, NOW);
    await seedCase({ submittedAt: "2026-01-01T01:00:00.000Z" });
    await seedCase({ submittedAt: "2026-01-01T02:00:00.000Z" });
    await seedCase({
      submittedAt: "2026-01-01T03:00:00.000Z",
      status: "in_production",
    });
    const after = await getStudioCounts(env.DB, NOW);
    expect(after.pendingCommissions - before.pendingCommissions).toBe(2);
  });
});
