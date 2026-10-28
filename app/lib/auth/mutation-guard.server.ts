import type { Env } from "../env.server";
import type { AdminIdentity } from "./access-jwt.server";
import { verifyCsrfToken } from "./csrf.server";

export const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertMutationMethod(request: Request): void {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
    throw new Response("Method Not Allowed", { status: 405 });
  }
}

/**
 * CSRF check shared by the FormData field (`csrfToken`) and the header
 * (`X-Studio-CSRF`, JSON and upload requests) variants: HMAC token bound to
 * the Access subject, 30-minute lifetime, Origin must equal APP_ORIGIN.
 * Any failure → 403.
 */
export async function verifyMutationToken(
  request: Request,
  env: Env,
  identity: AdminIdentity,
  token: string | null | undefined,
): Promise<void> {
  try {
    if (typeof token !== "string" || !token) throw new Error("csrf_missing");
    await verifyCsrfToken({
      token,
      subject: identity.subject,
      secret: env.CSRF_SECRET,
      origin: request.headers.get("Origin"),
      expectedOrigin: env.APP_ORIGIN,
      now: new Date(),
    });
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }
}
