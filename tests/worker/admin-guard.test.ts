import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../../app/lib/auth/access-jwt.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "../../app/lib/auth/admin.server";
import { createCsrfToken } from "../../app/lib/auth/csrf.server";
import { createTestEnv } from "../helpers/test-env";

const verifier: JwtVerifier = async () => ({
  sub: "admin-subject",
  email: "admin@example.com",
  type: "app",
});

function accessRequest(method = "GET") {
  return new Request("https://kamelkyp.com/admin", {
    method,
    headers: {
      "Cf-Access-Jwt-Assertion": "test-token",
      Origin: "https://kamelkyp.com",
    },
  });
}

describe("admin guards", () => {
  it("requires Access for reads and Access plus CSRF for mutations", async () => {
    const env = createTestEnv();
    await expect(requireAdmin(accessRequest(), env, verifier)).resolves.toEqual(
      {
        subject: "admin-subject",
        email: "admin@example.com",
      },
    );

    const csrfToken = await createCsrfToken({
      subject: "admin-subject",
      secret: env.CSRF_SECRET,
      now: new Date(),
    });
    const formData = new FormData();
    formData.set("csrfToken", csrfToken);
    await expect(
      requireAdminMutation(accessRequest("POST"), env, formData, verifier),
    ).resolves.toEqual({
      subject: "admin-subject",
      email: "admin@example.com",
    });
  });

  it("rejects missing CSRF and unsafe methods without a valid origin", async () => {
    const env = createTestEnv();
    const formData = new FormData();
    await expect(
      requireAdminMutation(accessRequest("POST"), env, formData, verifier),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      requireAdminMutation(accessRequest("GET"), env, formData, verifier),
    ).rejects.toMatchObject({ status: 405 });
  });
});
