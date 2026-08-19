import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../../app/lib/integrations/turnstile.server";

function verifierResponse(body: unknown, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status }));
}

const base = {
  token: "test-token",
  secret: "test-secret",
  remoteIp: "203.0.113.10",
  allowedHostnames: new Set(["localhost"]),
  expectedAction: "test",
};

describe("Turnstile verification", () => {
  it("accepts only a successful response with the expected host and action", async () => {
    const fetcher = verifierResponse({
      success: true,
      hostname: "localhost",
      action: "test",
    });
    await expect(
      verifyTurnstile({ ...base, fetcher }),
    ).resolves.toBeUndefined();
    const request = fetcher.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toMatchObject({
      secret: "test-secret",
      response: "test-token",
      remoteip: "203.0.113.10",
    });
    expect(payload.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    [{ success: true, action: "test" }, "turnstile_hostname_mismatch"],
    [
      { success: true, hostname: "evil.example", action: "test" },
      "turnstile_hostname_mismatch",
    ],
    [
      { success: true, hostname: "localhost", action: "wrong" },
      "turnstile_action_mismatch",
    ],
  ])("rejects an invalid trust claim", async (body, code) => {
    await expect(
      verifyTurnstile({ ...base, fetcher: verifierResponse(body) }),
    ).rejects.toThrow(code);
  });

  it("distinguishes expired tokens and upstream failures", async () => {
    await expect(
      verifyTurnstile({
        ...base,
        fetcher: verifierResponse({
          success: false,
          "error-codes": ["timeout-or-duplicate"],
        }),
      }),
    ).rejects.toThrow("turnstile_expired");
    await expect(
      verifyTurnstile({
        ...base,
        fetcher: verifierResponse({ success: false }),
      }),
    ).rejects.toThrow("turnstile_failed");
    await expect(
      verifyTurnstile({
        ...base,
        fetcher: verifierResponse({ error: "down" }, 503),
      }),
    ).rejects.toThrow("turnstile_unavailable");
  });
});
