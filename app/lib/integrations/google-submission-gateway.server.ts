import { createSignedEnvelope } from "./hmac-envelope";

export interface GoogleSubmissionResult {
  state: "complete";
  googleResponseId: string;
  notified: true;
}

export function validateAppsScriptUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("apps_script_url_invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("apps_script_url_invalid");
  }
  return url.toString();
}

export async function sendToGoogle(input: {
  url: string;
  secret: string;
  caseId: string;
  payload: unknown;
  now: string;
  fetcher: typeof fetch;
}): Promise<GoogleSubmissionResult> {
  const envelope = await createSignedEnvelope({
    caseId: input.caseId,
    payload: input.payload,
    secret: input.secret,
    now: input.now,
    nonce: crypto.randomUUID(),
  });

  const destination = validateAppsScriptUrl(input.url);
  let response: Response;
  try {
    response = await input.fetcher(destination, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      redirect: "follow",
    });
  } catch {
    throw new Error("google_transport_failed");
  }
  if (!response.ok) throw new Error("google_transport_failed");

  let result: {
    ok: boolean;
    data?: GoogleSubmissionResult;
    error?: { code?: string };
  };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    throw new Error("google_sync_failed");
  }
  if (
    !result.ok ||
    result.data?.state !== "complete" ||
    result.data.notified !== true ||
    !result.data.googleResponseId
  ) {
    throw new Error(
      result.error?.code === "mail_failed"
        ? "google_mail_pending"
        : "google_sync_failed",
    );
  }
  return result.data;
}

export async function cleanupGoogleLedger(input: {
  url: string;
  secret: string;
  caseId: string;
  now: string;
  fetcher: typeof fetch;
}): Promise<void> {
  const envelope = await createSignedEnvelope({
    caseId: input.caseId,
    payload: { operation: "cleanup_ledger", caseId: input.caseId },
    secret: input.secret,
    now: input.now,
    nonce: crypto.randomUUID(),
  });
  const destination = validateAppsScriptUrl(input.url);
  let response: Response;
  try {
    response = await input.fetcher(destination, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      redirect: "follow",
    });
  } catch {
    throw new Error("google_transport_failed");
  }
  if (!response.ok) throw new Error("google_transport_failed");
  try {
    const result = (await response.json()) as {
      ok?: boolean;
      data?: { operation?: string; caseId?: string };
    };
    if (
      !result.ok ||
      result.data?.operation !== "cleanup_ledger" ||
      result.data.caseId !== input.caseId
    ) {
      throw new Error("google_cleanup_failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "google_cleanup_failed") {
      throw error;
    }
    throw new Error("google_cleanup_failed");
  }
}
