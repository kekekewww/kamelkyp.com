/**
 * Browser-side Studio session helpers (admin-architecture §3.4). Called only
 * from effects and event handlers (a `.client` module is empty on the server).
 *
 * - `fetchStudioSession()` refreshes the CSRF token (every 20 minutes while the
 *   tab is visible, and on focus — see `StudioSessionProvider`).
 * - `studioFetch()` sends JSON/uploads with the `X-Studio-CSRF` header and, on
 *   a 403, refreshes the token once and retries. A second 403 means the Access
 *   session ended: the caller shows "Session expired. Sign in again, then retry."
 */

export const STUDIO_CSRF_HEADER = "X-Studio-CSRF";
export const SESSION_REFRESH_MS = 20 * 60 * 1000;

export interface StudioSessionPayload {
  csrfToken: string;
  expiresAt: string;
  ownerEmail: string;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("session_expired");
    this.name = "SessionExpiredError";
  }
}

export async function fetchStudioSession(): Promise<StudioSessionPayload | null> {
  try {
    const response = await fetch("/api/studio/session", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      csrfToken?: string;
      csrfExpiresAt?: string;
      ownerEmail?: string;
    };
    if (!body.csrfToken) return null;
    return {
      csrfToken: body.csrfToken,
      expiresAt: body.csrfExpiresAt ?? "",
      ownerEmail: body.ownerEmail ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * fetch() with the CSRF header and one refresh-and-retry on 403.
 * `onToken` receives a refreshed token so the provider can store it.
 */
export async function studioFetch(
  input: string,
  init: RequestInit & { csrfToken: string; onToken?: (token: string) => void },
): Promise<Response> {
  const { csrfToken, onToken, ...rest } = init;
  const send = (token: string) =>
    fetch(input, {
      credentials: "same-origin",
      ...rest,
      headers: {
        Accept: "application/json",
        ...(rest.headers ?? {}),
        [STUDIO_CSRF_HEADER]: token,
      },
    });
  const first = await send(csrfToken);
  if (first.status !== 403) return first;
  const session = await fetchStudioSession();
  if (!session) throw new SessionExpiredError();
  onToken?.(session.csrfToken);
  const second = await send(session.csrfToken);
  if (second.status === 403) throw new SessionExpiredError();
  return second;
}
