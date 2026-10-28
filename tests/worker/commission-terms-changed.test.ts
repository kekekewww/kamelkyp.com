/**
 * The public wizard's "terms changed" answer (plan §9 C3 g): a submission
 * that accepted term versions which are no longer in effect gets its own
 * 409 code and message, and the log keeps the real cause.
 */
import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import type { Env } from "../../app/lib/env.server";
import { action as submitAction } from "../../app/routes/api/commission-submit";
import { createTestEnv } from "../helpers/test-env";

const BODY = '[{"key":"test","title":"Test","text":"Test terms"}]';
const EFFECTIVE = "2026-08-10T00:00:00Z";

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
  for (const locale of ["zh", "en"] as const) {
    for (const documentId of ["common", "privacy", "full-mix"]) {
      const id = `changed-${documentId}-${locale}-v2`;
      await env.DB.prepare(
        "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) " +
          "VALUES (?, ?, ?, 2, ?, ?, ?)",
      )
        .bind(id, documentId, locale, BODY, EFFECTIVE, EFFECTIVE)
        .run();
      await env.DB.prepare(
        "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
      )
        .bind(documentId, locale, id, EFFECTIVE)
        .run();
    }
  }
});

/** A submission that accepted the previous versions (the page was open). */
function staleSubmit(locale: "zh" | "en"): ActionFunctionArgs {
  const testEnv = {
    ...createTestEnv({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
    DB: env.DB,
    SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
  } as unknown as Env;
  return {
    request: new Request("https://kamelkyp.com/api/commission/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.9",
        "CF-Ray": "ray-terms-changed",
      },
      body: JSON.stringify({
        locale,
        draft,
        termVersionIds: [
          `changed-common-${locale}-v1`,
          `changed-full-mix-${locale}-v1`,
          `changed-privacy-${locale}-v1`,
        ],
        termsAccepted: true,
        turnstileToken: "token",
      }),
    }),
    context: createCloudflareContextProvider(testEnv, {} as ExecutionContext, {
      nonce: "n",
      requestId: "r",
    }),
    params: {},
  } as unknown as ActionFunctionArgs;
}

describe("commission submit: terms changed", () => {
  it.each([
    ["zh", "條款已更新。請重新整理頁面，閱讀並同意新版條款後再送出。"],
    [
      "en",
      "The terms were updated. Reload the page, read and accept the new version, then submit again.",
    ],
  ] as const)(
    "answers 409 terms_changed in %s and logs the real code",
    async (locale, message) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = (await submitAction(staleSubmit(locale))) as Response;
        expect(response.status).toBe(409);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
          ok: false,
          error: { code: "terms_changed", message },
        });
        const logged = JSON.parse(String(error.mock.calls.at(-1)?.[0]));
        expect(logged).toEqual({
          code: "term_version_mismatch",
          serviceId: "full_mix",
          rayId: "ray-terms-changed",
        });
      } finally {
        error.mockRestore();
      }
    },
  );

  it("stores nothing for the refused submission", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const before = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submission_attempts",
      ).first<{ n: number }>();
      await submitAction(staleSubmit("zh"));
      const after = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submission_attempts",
      ).first<{ n: number }>();
      expect(after?.n).toBe(before?.n);
    } finally {
      error.mockRestore();
    }
  });
});
