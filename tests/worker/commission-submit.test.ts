import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { submitCommission } from "../../app/lib/commission/submit.server";

const termIds = ["submit-common-zh-v1", "submit-full-zh-v1", "submit-privacy-zh-v1"];
const caseIds = [
  "KAM-20260810-0000000001",
  "KAM-20260810-0000000002",
  "KAM-20260810-0000000003",
];

const draft = {
  serviceId: "full_mix",
  displayName: "Artist K",
  email: "artist@example.com",
  contacts: [{ platform: "Discord", account: "artist-k" }],
  projectLinks: ["https://drive.google.com/file/d/example/view"],
  usagePurpose: "Single release",
  desiredDate: "",
  adultStatus: "adult",
  guardianAuthorized: false,
  studentRequested: false,
  studentProofUrl: "",
  creditAccountId: "@artist-k",
  portfolioConsent: false,
  rush: false,
  sourcePrep: false,
  genre: "Pop",
  referenceUrls: ["https://youtu.be/example"],
  bpm: "unknown",
  key: "unknown",
  direction: "Clear vocal",
};

beforeAll(async () => {
  for (const [versionId, documentId] of [
    [termIds[0], "common"],
    [termIds[1], "full-mix"],
    [termIds[2], "privacy"],
  ] as const) {
    await env.DB.prepare(
      "INSERT INTO term_versions " +
        "(id, document_id, locale, version_number, body_json, created_at, effective_from) " +
        "VALUES (?, ?, 'zh', 1, '[]', ?, ?)",
    )
      .bind(versionId, "2026-08-10T00:00:00Z", "2026-08-10T00:00:00Z")
      .run();
    await env.DB.prepare(
      "INSERT INTO term_publications " +
        "(document_id, locale, version_id, effective_from) VALUES (?, 'zh', ?, ?)",
    )
      .bind(documentId, versionId, "2026-08-10T00:00:00Z")
      .run();
  }
});

function turnstileSuccess() {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({ success: true, hostname: "localhost", action: "test" }),
  );
}

function googleComplete() {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      ok: true,
      data: { state: "complete", googleResponseId: "google-1", notified: true },
    }),
  );
}

function input(caseId: string) {
  return {
    db: env.DB,
    locale: "zh" as const,
    rawDraft: draft,
    clientClaimedTotal: 1,
    termVersionIds: termIds,
    termsAccepted: true,
    turnstileToken: "test-token",
    turnstileSecret: "test-secret",
    requestIp: "203.0.113.10",
    now: "2026-08-19T12:00:00.000Z",
    turnstileFetcher: turnstileSuccess(),
    allowedHostnames: new Set(["localhost"]),
    expectedAction: "test",
    googleUrl: "https://script.google.com/macros/s/test/exec",
    googleSecret: "test-secret-with-at-least-32-characters",
    googleFetcher: googleComplete(),
    caseIdFactory: () => caseId,
  };
}

describe("commission submission without D1 PII", () => {
  it("stores only non-PII metadata when Google requires retry", async () => {
    const firstInput = input(caseIds[0]);
    firstInput.googleFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("down", { status: 503 }));
    const result = await submitCommission(firstInput);
    expect(result).toMatchObject({ state: "pending_retry", caseId: caseIds[0] });
    const columns = await env.DB.prepare("PRAGMA table_info(submission_attempts)")
      .all<{ name: string }>();
    expect(columns.results.map((row) => row.name)).not.toEqual(
      expect.arrayContaining(["email", "contact", "project_url", "payload"]),
    );
    const stored = await env.DB.prepare(
      "SELECT * FROM submission_attempts WHERE case_id = ?",
    )
      .bind(caseIds[0])
      .first<Record<string, unknown>>();
    expect(JSON.stringify(stored)).not.toContain("artist@example.com");
  });

  it("stores only temporary non-PII student price alternatives", async () => {
    const studentInput = input(caseIds[1]);
    studentInput.rawDraft = {
      ...draft,
      studentRequested: true,
      studentProofUrl: "https://drive.google.com/student-proof",
    };
    const result = await submitCommission(studentInput);
    const runtime = await env.DB.prepare(
      "SELECT * FROM case_runtime WHERE case_id = ?",
    )
      .bind(result.caseId)
      .first<Record<string, unknown>>();
    expect(runtime).toMatchObject({
      student_review_state: "pending",
      standard_price_minor: 8000,
      student_price_minor: 5600,
    });
    expect(JSON.stringify(runtime)).not.toContain("student-proof");
  });

  it("reuses a case only when the normalized payload hash matches", async () => {
    const firstInput = input(caseIds[2]);
    firstInput.googleFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ok: false, error: { code: "mail_failed" } }),
    );
    const first = await submitCommission(firstInput);
    expect(first.state).toBe("pending_retry");

    const retry = await submitCommission({
      ...input("unused"),
      existingCaseId: first.caseId,
    });
    expect(retry.state).toBe("complete");

    await expect(
      submitCommission({
        ...input("unused-2"),
        existingCaseId: first.caseId,
        rawDraft: { ...draft, direction: "Changed direction" },
      }),
    ).rejects.toThrow("case_payload_mismatch");
  });
});
