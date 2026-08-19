interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(input: {
  token: string;
  secret: string;
  remoteIp: string | null;
  allowedHostnames: ReadonlySet<string>;
  expectedAction: string;
  fetcher: typeof fetch;
}): Promise<void> {
  if (!input.token || !input.secret) throw new Error("turnstile_missing");

  let response: Response;
  try {
    response = await input.fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret: input.secret,
          response: input.token,
          remoteip: input.remoteIp,
          idempotency_key: crypto.randomUUID(),
        }),
      },
    );
  } catch {
    throw new Error("turnstile_unavailable");
  }

  if (!response.ok) throw new Error("turnstile_unavailable");
  let result: TurnstileResponse;
  try {
    result = (await response.json()) as TurnstileResponse;
  } catch {
    throw new Error("turnstile_unavailable");
  }
  if (!result.success) {
    const duplicate = result["error-codes"]?.includes("timeout-or-duplicate");
    throw new Error(duplicate ? "turnstile_expired" : "turnstile_failed");
  }
  if (!result.hostname || !input.allowedHostnames.has(result.hostname)) {
    throw new Error("turnstile_hostname_mismatch");
  }
  if (result.action !== input.expectedAction) {
    throw new Error("turnstile_action_mismatch");
  }
}
