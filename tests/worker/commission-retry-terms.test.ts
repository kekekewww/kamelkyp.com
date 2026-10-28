/**
 * A notification retry after the terms were republished (plan §9 C3 g,
 * review of wp7). The case was stored, and possibly written to the Google
 * Form, at the first submit, under the term versions in effect then. A
 * later publication must not refuse its retry: answering `terms_changed`
 * there made the wizard start a second case for the same request, while
 * the first one's Google Form response outlived its D1 row.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { submitCommission } from "../../app/lib/commission/submit.server";

const BODY = '[{"key":"test","title":"Test","text":"Test terms"}]';
const DOCUMENTS = ["common", "full-mix", "privacy"] as const;
const v1 = DOCUMENTS.map((document) => `retry-${document}-zh-v1`);
const v2 = DOCUMENTS.map((document) => `retry-${document}-zh-v2`);
const CASE_ID = "KAM-20260819-0000000001";
const FIRST_SUBMIT = "2026-08-19T12:00:00.000Z";
const REPUBLISHED = "2026-08-19T13:00:00.000Z";
const RETRY = "2026-08-19T14:00:00.000Z";

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

async function insertVersions(ids: string[], versionNumber: number) {
  for (const [index, document] of DOCUMENTS.entries()) {
    await env.DB.prepare(
      "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) " +
        "VALUES (?, ?, 'zh', ?, ?, ?, ?)",
    )
      .bind(ids[index], document, versionNumber, BODY, FIRST_SUBMIT, null)
      .run();
  }
}

/** Publishes `ids` (one per document), effective from `at`. */
async function publish(ids: string[], at: string) {
  for (const [index, document] of DOCUMENTS.entries()) {
    await env.DB.prepare(
      "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES (?, 'zh', ?, ?) " +
        "ON CONFLICT (document_id, locale) DO UPDATE SET version_id = excluded.version_id, effective_from = excluded.effective_from",
    )
      .bind(document, ids[index], at)
      .run();
  }
}

beforeAll(async () => {
  await insertVersions(v1, 1);
  await insertVersions(v2, 2);
  await publish(v1, "2026-08-10T00:00:00Z");
});

function turnstileSuccess() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ success: true, hostname: "localhost", action: "test" }),
    );
}

function google(result: "complete" | "mail_failed") {
  return vi.fn<typeof fetch>().mockImplementation(async () =>
    result === "complete"
      ? Response.json({
          ok: true,
          data: {
            state: "complete",
            googleResponseId: "google-retry-1",
            notified: true,
          },
        })
      : Response.json({ ok: false, error: { code: "mail_failed" } }),
  );
}

function submit({
  caseId = CASE_ID,
  ...overrides
}: {
  now: string;
  termVersionIds: string[];
  existingCaseId?: string;
  googleFetcher: typeof fetch;
  rawDraft?: unknown;
  /** The id a new case gets. */
  caseId?: string;
}) {
  return submitCommission({
    db: env.DB,
    locale: "zh",
    rawDraft: draft,
    caseIdFactory: () => caseId,
    clientClaimedTotal: 1,
    termsAccepted: true,
    turnstileToken: "test-token",
    turnstileSecret: "test-secret",
    requestIp: "203.0.113.10",
    turnstileFetcher: turnstileSuccess(),
    allowedHostnames: new Set(["localhost"]),
    expectedAction: "test",
    googleUrl: "https://script.google.com/macros/s/test/exec",
    googleSecret: "test-secret-with-at-least-32-characters",
    ...overrides,
  });
}

/** The payload a Google call carried (the signed envelope's JSON). */
function sentPayload(fetcher: ReturnType<typeof google>, call = 0) {
  const init = fetcher.mock.calls[call]?.[1];
  const envelope = JSON.parse(String(init?.body)) as {
    payloadBase64Url: string;
  };
  const base64 = envelope.payloadBase64Url
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const bytes = Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as {
    caseId: string;
    terms: { versionIds: string[]; acceptedAt: string };
  };
}

async function count(table: "cases" | "submission_attempts") {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

describe("a notification retry after the terms were republished", () => {
  it("finishes the stored case under the terms accepted at the first submit", async () => {
    // First submit: the form is written, the notification mail fails.
    const first = await submit({
      now: FIRST_SUBMIT,
      termVersionIds: v1,
      googleFetcher: google("mail_failed"),
    });
    expect(first).toMatchObject({ state: "pending_retry", caseId: CASE_ID });
    const casesBefore = await count("cases");
    const attempt = await env.DB.prepare(
      "SELECT state FROM submission_attempts WHERE case_id = ?",
    )
      .bind(CASE_ID)
      .first<{ state: string }>();
    expect(attempt?.state).toBe("form_written");

    // The owner publishes new terms while the visitor's page is open.
    await publish(v2, REPUBLISHED);

    // A new submission with the old versions is refused, as before.
    await expect(
      submit({
        now: RETRY,
        termVersionIds: v1,
        googleFetcher: google("complete"),
      }),
    ).rejects.toThrow("term_version_mismatch");

    // The retry (the same request, the versions accepted then) completes
    // the stored case: no second case, no second Google Form response.
    const googleFetcher = google("complete");
    const retry = await submit({
      now: RETRY,
      termVersionIds: v1,
      existingCaseId: CASE_ID,
      googleFetcher,
    });
    expect(retry).toMatchObject({
      state: "complete",
      caseId: CASE_ID,
      submittedAt: FIRST_SUBMIT,
    });
    expect(await count("cases")).toBe(casesBefore);
    const stored = await env.DB.prepare(
      "SELECT state, terms_versions_json, terms_accepted_at FROM submission_attempts WHERE case_id = ?",
    )
      .bind(CASE_ID)
      .first<{
        state: string;
        terms_versions_json: string;
        terms_accepted_at: string;
      }>();
    expect(stored).toEqual({
      state: "complete",
      terms_versions_json: JSON.stringify(v1),
      terms_accepted_at: FIRST_SUBMIT,
    });
    expect(sentPayload(googleFetcher)).toMatchObject({
      caseId: CASE_ID,
      terms: { versionIds: v1, acceptedAt: FIRST_SUBMIT },
    });
  });

  it("still refuses a retry that does not carry the case's accepted versions", async () => {
    const id = "KAM-20260819-0000000002";
    await publish(v1, "2026-08-10T00:00:00Z");
    const first = await submit({
      now: FIRST_SUBMIT,
      termVersionIds: v1,
      googleFetcher: google("mail_failed"),
      caseId: id,
    });
    expect(first.state).toBe("pending_retry");
    await publish(v2, REPUBLISHED);
    const attempts = await count("submission_attempts");

    // The new versions (accepted after a reload) are not what the case was
    // stored with, and a payload change is refused as before.
    await expect(
      submit({
        now: RETRY,
        termVersionIds: v2,
        existingCaseId: id,
        googleFetcher: google("complete"),
      }),
    ).rejects.toThrow("case_payload_mismatch");
    await expect(
      submit({
        now: RETRY,
        termVersionIds: v1,
        rawDraft: { ...draft, direction: "Changed direction" },
        existingCaseId: id,
        googleFetcher: google("complete"),
      }),
    ).rejects.toThrow("case_payload_mismatch");
    // An unknown case is still not found, whatever versions it carries.
    await expect(
      submit({
        now: RETRY,
        termVersionIds: v1,
        existingCaseId: "KAM-20260819-0000000009",
        googleFetcher: google("complete"),
      }),
    ).rejects.toThrow("case_not_found");
    expect(await count("submission_attempts")).toBe(attempts);
  });
});
