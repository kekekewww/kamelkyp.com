import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepareSubmission } from "../../app/lib/commission/prepare-submission.server";

const activeTermIds = [
  "prepare-common-zh-v1",
  "prepare-full-zh-v1",
  "prepare-privacy-zh-v1",
];

const validFullMixDraft = {
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
  const versions = [
    ["prepare-common-zh-v1", "common"],
    ["prepare-full-zh-v1", "full-mix"],
    ["prepare-privacy-zh-v1", "privacy"],
    ["prepare-common-en-v1", "common"],
    ["prepare-full-en-v1", "full-mix"],
    ["prepare-privacy-en-v1", "privacy"],
  ] as const;
  for (const [versionId, documentId] of versions) {
    const locale = versionId.includes("-en-") ? "en" : "zh";
    await env.DB.prepare(
      "INSERT INTO term_versions " +
        "(id, document_id, locale, version_number, body_json, created_at, effective_from) " +
        "VALUES (?, ?, ?, 1, ?, ?, ?)",
    )
      .bind(
        versionId,
        documentId,
        locale,
        '[{"key":"test","title":"Test","text":"Test terms"}]',
        "2026-08-10T00:00:00Z",
        "2026-08-10T00:00:00Z",
      )
      .run();
    await env.DB.prepare(
      "INSERT INTO term_publications " +
        "(document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
    )
      .bind(documentId, locale, versionId, "2026-08-10T00:00:00Z")
      .run();
  }
});

function turnstileSuccess() {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      success: true,
      hostname: "localhost",
      action: "test",
    }),
  );
}

function validInput() {
  return {
    db: env.DB,
    locale: "zh" as const,
    rawDraft: validFullMixDraft,
    clientClaimedTotal: 1,
    termVersionIds: activeTermIds,
    termsAccepted: true,
    turnstileToken: "test-token",
    turnstileSecret: "test-secret",
    requestIp: "203.0.113.10",
    now: "2026-08-19T12:00:00Z",
    fetcher: turnstileSuccess(),
    allowedHostnames: new Set(["localhost"]),
    expectedAction: "test",
  };
}

describe("trusted commission preparation", () => {
  it("ignores client totals and recomputes the locked quote", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS total FROM cases").first<{
      total: number;
    }>();
    const result = await prepareSubmission(validInput());
    expect(result.quote.lockedInitialTwd).toBe(8000);
    expect(result.displayPrice).toEqual({
      locale: "zh",
      currency: "TWD",
      minor: 8000,
    });
    expect(result.termVersionIds).toEqual(activeTermIds);
    expect(result.normalizedDraft.email).toBe("artist@example.com");
    const after = await env.DB.prepare("SELECT COUNT(*) AS total FROM cases").first<{
      total: number;
    }>();
    expect(after?.total).toBe(before?.total);
  });

  it("rejects a term version that is no longer the active publication", async () => {
    await expect(
      prepareSubmission({ ...validInput(), termVersionIds: ["old-version"] }),
    ).rejects.toThrow("term_version_mismatch");
  });

  it("requires an explicit unified acceptance", async () => {
    await expect(
      prepareSubmission({ ...validInput(), termsAccepted: false }),
    ).rejects.toThrow("terms_not_accepted");
  });

  it("rejects stale English FX before Turnstile", async () => {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO fx_rates " +
        "(rate_date, base_currency, quote_currency, rate_scaled, scale, source, fetched_at) " +
        "VALUES (?, 'TWD', 'USD', ?, 100000000, 'Frankfurter', ?)",
    )
      .bind("2026-08-03", 3_250_000, "2026-08-03T01:15:00Z")
      .run();
    const fetcher = turnstileSuccess();
    await expect(
      prepareSubmission({
        ...validInput(),
        locale: "en",
        termVersionIds: [
          "prepare-common-en-v1",
          "prepare-full-en-v1",
          "prepare-privacy-en-v1",
        ],
        now: "2027-01-01T12:00:00Z",
        fetcher,
      }),
    ).rejects.toThrow("fx_rate_stale");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
