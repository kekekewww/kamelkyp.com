import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import {
  getCommissionReadiness,
  loadCommissionWizard,
} from "../../app/lib/commission/availability.server";
import { listPublishedTerms } from "../../app/lib/content/public-content.server";
import type { Env } from "../../app/lib/env.server";
import { action as prepareAction } from "../../app/routes/api/commission-prepare";
import { action as submitAction } from "../../app/routes/api/commission-submit";
import { createTestEnv } from "../helpers/test-env";

const NOW = new Date("2026-10-13T00:00:00.000Z");
const BODY = '[{"key":"test","title":"Test","text":"Test terms"}]';

/** Publishes a term document version directly (pointer + version). */
async function publish(
  documentId: string,
  locale: "zh" | "en",
  effectiveFrom = "2026-08-10T00:00:00Z",
) {
  const id = `avail-${documentId}-${locale}`;
  await env.DB.prepare(
    "INSERT INTO term_versions (id, document_id, locale, version_number, body_json, created_at, effective_from) " +
      "VALUES (?, ?, ?, 1, ?, ?, ?)",
  )
    .bind(id, documentId, locale, BODY, effectiveFrom, effectiveFrom)
    .run();
  await env.DB.prepare(
    "INSERT INTO term_publications (document_id, locale, version_id, effective_from) VALUES (?, ?, ?, ?)",
  )
    .bind(documentId, locale, id, effectiveFrom)
    .run();
}

describe("commission availability", () => {
  it("is closed everywhere on a fresh database: prices active, terms missing", async () => {
    const readiness = await getCommissionReadiness(env.DB, NOW);
    expect(readiness.map((item) => item.serviceId)).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
    const fullMix = readiness[0];
    expect(fullMix?.price).toEqual({
      versionId: "full-2026-08-10",
      baseTwd: 8000,
    });
    expect(fullMix?.serviceStatus).toBe("published");
    expect(fullMix?.open).toEqual({ zh: false, en: false });
    expect(fullMix?.terms.zh).toEqual({
      ready: false,
      missing: ["common", "privacy", "full-mix"],
    });
    expect(readiness.every((item) => !item.open.zh && !item.open.en)).toBe(
      true,
    );
    expect(
      await loadCommissionWizard(env.DB, "zh", "full_mix", NOW),
    ).toBeNull();
  });

  it("is closed without an active price", async () => {
    const early = await getCommissionReadiness(
      env.DB,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(early.every((item) => item.price === null)).toBe(true);
  });

  it("opens a locale once common, privacy and the service document are effective", async () => {
    await publish("common", "zh");
    await publish("privacy", "zh");
    await publish("full-mix", "zh");
    const readiness = await getCommissionReadiness(env.DB, NOW);
    const open = Object.fromEntries(
      readiness.map((item) => [item.serviceId, item.open]),
    );
    expect(open).toEqual({
      full_mix: { zh: true, en: false },
      vocal_mix: { zh: false, en: false },
      simple_transition: { zh: false, en: false },
      edit_transition: { zh: false, en: false },
    });
    expect(readiness[1]?.terms.zh.missing).toEqual(["vocal-mix"]);

    const wizard = await loadCommissionWizard(env.DB, "zh", "full_mix", NOW);
    expect(wizard?.priceRule.versionId).toBe("full-2026-08-10");
    expect(wizard?.terms.map((term) => term.documentId)).toEqual([
      "common",
      "full-mix",
      "privacy",
    ]);
    expect(wizard?.serviceName).toBe("完整歌曲混音");
    expect(wizard?.fxSnapshot).toBeNull();
  });

  it("loads the English wizard without FX (USD unavailable, no throw)", async () => {
    await publish("common", "en");
    await publish("privacy", "en");
    await publish("full-mix", "en");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wizard = await loadCommissionWizard(env.DB, "en", "full_mix", NOW);
    expect(wizard?.serviceName).toBe("Full Song Mixing");
    expect(wizard?.fxSnapshot).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "commission_fx_unavailable",
      "fx_rate_missing",
    );
    warn.mockRestore();
  });

  it("does not count a future pointer until its time (wizard and /terms agree)", async () => {
    await publish("vocal-mix", "zh", "2026-12-01T00:00:00.000Z");
    const before = await getCommissionReadiness(env.DB, NOW);
    expect(before[1]?.open.zh).toBe(false);
    expect(before[1]?.terms.zh.missing).toEqual(["vocal-mix"]);
    const after = await getCommissionReadiness(
      env.DB,
      new Date("2026-12-02T00:00:00.000Z"),
    );
    expect(after[1]?.open.zh).toBe(true);

    const current = await listPublishedTerms(
      env.DB,
      "zh",
      "terms",
      NOW.toISOString(),
    );
    expect(current.map((term) => term.documentId)).toEqual([
      "common",
      "full-mix",
    ]);
    const later = await listPublishedTerms(
      env.DB,
      "zh",
      "terms",
      "2026-12-02T00:00:00.000Z",
    );
    expect(later.map((term) => term.documentId)).toEqual([
      "common",
      "full-mix",
      "vocal-mix",
    ]);
  });
});

describe("closed-service safe codes", () => {
  // vocal_mix has no English terms in this file, so the service is closed.
  const draft = {
    serviceId: "vocal_mix",
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

  function args(
    path: string,
    payload: { draft: Record<string, unknown>; termVersionIds: string[] } = {
      draft,
      termVersionIds: ["stale"],
    },
  ): ActionFunctionArgs {
    const testEnv = {
      ...createTestEnv({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
      DB: env.DB,
      SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as Env;
    return {
      request: new Request(`https://kamelkyp.com${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.7",
        },
        body: JSON.stringify({
          locale: "en",
          draft: payload.draft,
          termVersionIds: payload.termVersionIds,
          termsAccepted: true,
          turnstileToken: "token",
        }),
      }),
      context: createCloudflareContextProvider(
        testEnv,
        {} as ExecutionContext,
        { nonce: "n", requestId: "r" },
      ),
      params: {},
    } as unknown as ActionFunctionArgs;
  }

  it("logs the real cause and keeps the public submit code service_unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const submit = (await submitAction(
      args("/api/commission/submit"),
    )) as Response;
    expect(submit.status).toBe(400);
    expect(
      ((await submit.json()) as { error: { code: string } }).error.code,
    ).toBe("service_unavailable");
    expect(String(error.mock.calls.at(-1)?.[0])).toContain(
      '"code":"active_terms_unavailable"',
    );

    const prepare = (await prepareAction(
      args("/api/commission/prepare"),
    )) as Response;
    expect(
      ((await prepare.json()) as { error: { code: string } }).error.code,
    ).toBe("active_terms_unavailable");
    error.mockRestore();
  });

  it("tells an English visitor that the USD price cannot be locked without FX", async () => {
    // full_mix is open in English (terms published above); no FX rate exists.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = {
      draft: { ...draft, serviceId: "full_mix" },
      termVersionIds: [
        "avail-common-en",
        "avail-full-mix-en",
        "avail-privacy-en",
      ],
    };
    const submit = (await submitAction(
      args("/api/commission/submit", payload),
    )) as Response;
    expect(submit.status).toBe(400);
    expect(
      ((await submit.json()) as { error: { code: string; message: string } })
        .error,
    ).toEqual({
      code: "service_unavailable",
      message: "The USD price cannot be locked right now. Try again later.",
    });
    expect(String(error.mock.calls.at(-1)?.[0])).toContain(
      '"code":"fx_rate_missing"',
    );

    const prepare = (await prepareAction(
      args("/api/commission/prepare", payload),
    )) as Response;
    expect(
      ((await prepare.json()) as { error: { code: string; message: string } })
        .error,
    ).toEqual({
      code: "fx_rate_missing",
      message: "The USD price cannot be locked right now. Try again later.",
    });
    error.mockRestore();
  });
});
