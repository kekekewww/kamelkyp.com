import { describe, expect, it } from "vitest";
import {
  createCsrfToken,
  verifyCsrfToken,
} from "../../app/lib/auth/csrf.server";

const secret = "csrf-secret-that-is-at-least-32-characters";
const origin = "https://kamelkyp.com";
const subject = "admin-subject";
const issuedAt = new Date("2026-08-19T00:00:00.000Z");

describe("stateless admin CSRF token", () => {
  it("is reusable for the same subject and origin within thirty minutes", async () => {
    const token = await createCsrfToken({
      subject,
      secret,
      now: issuedAt,
      nonce: new Uint8Array(18).fill(7),
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        verifyCsrfToken({
          token,
          subject,
          secret,
          origin,
          expectedOrigin: origin,
          now: new Date("2026-08-19T00:29:59.000Z"),
        }),
      ).resolves.toBeUndefined();
    }

    const [payload] = token.split(".");
    const decoded = JSON.parse(
      atob((payload ?? "").replaceAll("-", "+").replaceAll("_", "/")),
    );
    expect(Object.keys(decoded).sort()).toEqual(["expiresAt", "nonce"]);
    expect(JSON.stringify(decoded)).not.toContain("admin@example.com");
  });

  it("rejects expiry, subject changes, tampering and invalid origins", async () => {
    const token = await createCsrfToken({ subject, secret, now: issuedAt });
    const attempts = [
      { token, subject, origin, now: new Date("2026-08-19T00:30:01.000Z") },
      { token, subject: "another-subject", origin, now: issuedAt },
      { token: `${token.slice(0, -1)}x`, subject, origin, now: issuedAt },
      { token, subject, origin: "https://evil.example", now: issuedAt },
      { token, subject, origin: null, now: issuedAt },
    ];

    for (const attempt of attempts) {
      await expect(
        verifyCsrfToken({
          ...attempt,
          secret,
          expectedOrigin: origin,
        }),
      ).rejects.toThrow("csrf_invalid");
    }
  });
});
