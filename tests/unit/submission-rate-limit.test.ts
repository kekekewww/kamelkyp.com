import { describe, expect, it } from "vitest";
import {
  enforceSubmissionRateLimit,
  submissionRateLimitKey,
} from "../../app/lib/commission/submission-rate-limit.server";

describe("anonymous commission submission limits", () => {
  it("uses a route-scoped one-way key and fails closed without an address", async () => {
    const rawIp = "203.0.113.10";
    const key = await submissionRateLimitKey(rawIp);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(rawIp);
    await expect(submissionRateLimitKey(null)).rejects.toThrow(
      "request_ip_missing",
    );
  });

  it("allows ten attempts and rejects the eleventh", async () => {
    let attempts = 0;
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        attempts += 1;
        return { success: attempts <= 10 };
      },
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        enforceSubmissionRateLimit(limiter, "203.0.113.10"),
      ).resolves.toBeUndefined();
    }
    await expect(
      enforceSubmissionRateLimit(limiter, "203.0.113.10"),
    ).rejects.toThrow("submission_rate_limited");
  });
});
