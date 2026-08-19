import { describe, expect, it } from "vitest";
import {
  type JwtVerifier,
  verifyAccessRequest,
} from "../../app/lib/auth/access-jwt.server";
import { createTestEnv } from "../helpers/test-env";

const nowSeconds = Math.floor(Date.now() / 1000);

function requestWithClaims(claims?: Record<string, unknown>) {
  return new Request("https://kamelkyp.com/admin", {
    headers: claims
      ? { "Cf-Access-Jwt-Assertion": JSON.stringify(claims) }
      : undefined,
  });
}

const verifier: JwtVerifier = async (token, config) => {
  const claims = JSON.parse(token) as Record<string, unknown>;
  if (claims.iss !== config.issuer || claims.aud !== config.audience) {
    throw new Error("claim_mismatch");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    throw new Error("expired");
  }
  return claims;
};

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://team.cloudflareaccess.com",
    aud: "test-audience",
    exp: nowSeconds + 60,
    sub: "admin-subject",
    email: " ADMIN@example.com ",
    type: "app",
    ...overrides,
  };
}

async function expectForbidden(request: Request) {
  let thrown: unknown;
  try {
    await verifyAccessRequest(request, createTestEnv(), verifier);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Response);
  const response = thrown as Response;
  expect(response.status).toBe(403);
  expect(await response.text()).toBe("Forbidden");
}

describe("Cloudflare Access JWT verification", () => {
  it("returns only normalized identity for a valid token", async () => {
    await expect(
      verifyAccessRequest(requestWithClaims(validClaims()), createTestEnv(), verifier),
    ).resolves.toEqual({
      subject: "admin-subject",
      email: "admin@example.com",
    });
  });

  it("rejects missing, mismatched, malformed and expired assertions", async () => {
    const rejected = [
      requestWithClaims(),
      requestWithClaims(validClaims({ aud: "other" })),
      requestWithClaims(validClaims({ iss: "https://other.example.com" })),
      requestWithClaims(validClaims({ email: "other@example.com" })),
      requestWithClaims(validClaims({ type: "user" })),
      requestWithClaims(validClaims({ sub: undefined })),
      requestWithClaims(validClaims({ exp: nowSeconds - 1 })),
    ];

    for (const request of rejected) await expectForbidden(request);
  });

  it("never echoes the assertion or rejected claims", async () => {
    const token = validClaims({ email: "secret-person@example.com" });
    let response: Response | undefined;
    try {
      await verifyAccessRequest(requestWithClaims(token), createTestEnv(), verifier);
    } catch (error) {
      response = error as Response;
    }
    const body = await response?.text();
    expect(body).toBe("Forbidden");
    expect(body).not.toContain("secret-person");
    expect(body).not.toContain("admin-subject");
  });
});
