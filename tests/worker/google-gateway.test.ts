import { describe, expect, it, vi } from "vitest";
import { sendToGoogle } from "../../app/lib/integrations/google-submission-gateway.server";
import { verifySignedEnvelopeForTest } from "../../app/lib/integrations/hmac-envelope";

const secret = "test-secret-with-at-least-32-characters";

describe("Google submission gateway", () => {
  it("posts a signed JSON envelope and accepts only complete results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        data: {
          state: "complete",
          googleResponseId: "response-1",
          notified: true,
        },
      }),
    );
    await expect(
      sendToGoogle({
        url: "https://script.google.com/macros/s/test/exec",
        secret,
        caseId: "KAM-20260810-01HZX8J4AB",
        payload: { caseId: "KAM-20260810-01HZX8J4AB", displayName: "藝名 K" },
        now: "2026-08-10T12:00:00.000Z",
        fetcher,
      }),
    ).resolves.toMatchObject({ state: "complete", notified: true });
    const request = fetcher.mock.calls[0]?.[1];
    const envelope = JSON.parse(String(request?.body));
    await expect(verifySignedEnvelopeForTest(envelope, secret)).resolves.toEqual(
      { caseId: "KAM-20260810-01HZX8J4AB", displayName: "藝名 K" },
    );
  });

  it("distinguishes Gmail-pending and transport failures", async () => {
    const base = {
      url: "https://script.google.com/macros/s/test/exec",
      secret,
      caseId: "KAM-20260810-01HZX8J4AB",
      payload: { caseId: "KAM-20260810-01HZX8J4AB" },
      now: "2026-08-10T12:00:00.000Z",
    };
    await expect(
      sendToGoogle({
        ...base,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          Response.json({ ok: false, error: { code: "mail_failed" } }),
        ),
      }),
    ).rejects.toThrow("google_mail_pending");
    await expect(
      sendToGoogle({
        ...base,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("down", { status: 503 })),
      }),
    ).rejects.toThrow("google_transport_failed");
  });
});
