import type { Env } from "../env.server";
import {
  type AdminIdentity,
  type JwtVerifier,
  verifyAccessRequest,
} from "./access-jwt.server";
import { verifyCsrfToken } from "./csrf.server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function requireAdmin(
  request: Request,
  env: Env,
  verifier?: JwtVerifier,
): Promise<AdminIdentity> {
  return verifyAccessRequest(request, env, verifier);
}

export async function requireAdminMutation(
  request: Request,
  env: Env,
  formData: FormData,
  verifier?: JwtVerifier,
): Promise<AdminIdentity> {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const identity = await requireAdmin(request, env, verifier);
  try {
    const token = formData.get("csrfToken");
    if (typeof token !== "string" || !token) throw new Error("csrf_missing");
    await verifyCsrfToken({
      token,
      subject: identity.subject,
      secret: env.CSRF_SECRET,
      origin: request.headers.get("Origin"),
      expectedOrigin: env.APP_ORIGIN,
      now: new Date(),
    });
    return identity;
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }
}
