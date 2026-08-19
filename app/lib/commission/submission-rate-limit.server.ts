export interface SubmissionRateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export async function submissionRateLimitKey(
  requestIp: string | null,
): Promise<string> {
  if (!requestIp) throw new Error("request_ip_missing");
  const input = new TextEncoder().encode(`commission-submit:${requestIp}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function enforceSubmissionRateLimit(
  limiter: SubmissionRateLimiter,
  requestIp: string | null,
): Promise<void> {
  const key = await submissionRateLimitKey(requestIp);
  const outcome = await limiter.limit({ key });
  if (!outcome.success) throw new Error("submission_rate_limited");
}
