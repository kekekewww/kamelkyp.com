import type { Env } from "../env.server";
import {
  type AdminIdentity,
  type JwtVerifier,
  verifyAccessRequest,
} from "./access-jwt.server";
import { verifyCsrfToken } from "./csrf.server";

export const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function requireAdmin(
  request: Request,
  env: Env,
  verifier?: JwtVerifier,
): Promise<AdminIdentity> {
  return verifyAccessRequest(request, env, verifier);
}

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

export async function requireAdminMutation(
  request: Request,
  env: Env,
  formData: FormData,
  verifier?: JwtVerifier,
): Promise<AdminIdentity> {
  assertMutationMethod(request);
  const identity = await requireAdmin(request, env, verifier);
  const token = formData.get("csrfToken");
  await verifyMutationToken(
    request,
    env,
    identity,
    typeof token === "string" ? token : null,
  );
  return identity;
}

/** Header-token variant (JSON and streamed-upload requests). */
export async function requireAdminMutationWithToken(
  request: Request,
  env: Env,
  token: string | null,
  verifier?: JwtVerifier,
): Promise<AdminIdentity> {
  assertMutationMethod(request);
  const identity = await requireAdmin(request, env, verifier);
  await verifyMutationToken(request, env, identity, token);
  return identity;
}
