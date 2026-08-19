import { describe, expect, it } from "vitest";
import {
  createSignedEnvelope,
  verifySignedEnvelopeForTest,
} from "../../app/lib/integrations/hmac-envelope";

const secret = "test-secret-with-at-least-32-characters";

describe("HMAC envelope", () => {
  it("round-trips a Unicode payload with a canonical outer message", async () => {
    const envelope = await createSignedEnvelope({
      caseId: "KAM-20260810-01HZX8J4AB",
      payload: { displayName: "藝名 K", serviceId: "full_mix" },
      secret,
      now: "2026-08-10T12:00:00.000Z",
      nonce: "f5dc165c-6f50-40d5-aee3-cc03128cbf58",
    });

    await expect(verifySignedEnvelopeForTest(envelope, secret)).resolves.toEqual(
      { displayName: "藝名 K", serviceId: "full_mix" },
    );
  });

  it("rejects any payload change", async () => {
    const envelope = await createSignedEnvelope({
      caseId: "KAM-20260810-01HZX8J4AB",
      payload: { amount: 8000 },
      secret,
      now: "2026-08-10T12:00:00.000Z",
      nonce: "f5dc165c-6f50-40d5-aee3-cc03128cbf58",
    });
    envelope.payloadBase64Url += "A";
    await expect(verifySignedEnvelopeForTest(envelope, secret)).rejects.toThrow(
      "invalid_signature",
    );
  });
});
