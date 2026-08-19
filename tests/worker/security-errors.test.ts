import { describe, expect, it, vi } from "vitest";
import {
  publicErrorResponse,
  safeErrorLog,
} from "../../app/lib/security/safe-error";

describe("safe public errors", () => {
  it("never exposes secrets, email, form data or stack traces", async () => {
    const sensitive =
      "token-secret artist@example.com https://drive.google.com/private";
    const response = publicErrorResponse({
      status: 503,
      code: "submission_unavailable",
      locale: "zh",
      requestId: "ray-123",
      error: new Error(sensitive),
    });
    const body = await response.text();
    expect(body).toContain("submission_unavailable");
    expect(body).toContain("ray-123");
    expect(body).not.toContain(sensitive);
    expect(body).not.toContain("artist@example.com");
    expect(body).not.toContain("stack");
  });

  it("logs only stable diagnostic fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    safeErrorLog({
      code: "d1_failed",
      requestId: "ray-456",
      route: "/api/commission/submit",
    });
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({
        code: "d1_failed",
        requestId: "ray-456",
        route: "/api/commission/submit",
      }),
    );
    spy.mockRestore();
  });
});
