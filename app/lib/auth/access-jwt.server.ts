import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { Env } from "../env.server";

export type AdminIdentity = {
  subject: string;
  email: string;
};

export type JwtVerifier = (
  token: string,
  config: { issuer: string; audience: string },
) => Promise<Record<string, unknown>>;

const AccessClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.email()),
  type: z.literal("app"),
});

const jwksByTeamDomain = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getRemoteJwks(teamDomain: string) {
  const cached = jwksByTeamDomain.get(teamDomain);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
  jwksByTeamDomain.set(teamDomain, jwks);
  return jwks;
}

const defaultVerifier: JwtVerifier = async (token, config) => {
  const result = await jwtVerify(token, getRemoteJwks(config.issuer), {
    issuer: config.issuer,
    audience: config.audience,
  });
  return result.payload;
};

export async function verifyAccessRequest(
  request: Request,
  env: Env,
  verifier: JwtVerifier = defaultVerifier,
): Promise<AdminIdentity> {
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
    if (!token) throw new Error("access_assertion_missing");

    const claims = AccessClaimsSchema.parse(
      await verifier(token, {
        issuer: env.ACCESS_TEAM_DOMAIN,
        audience: env.ACCESS_AUD,
      }),
    );
    const email = claims.email.trim().toLowerCase();
    if (email !== env.ADMIN_EMAIL.trim().toLowerCase()) {
      throw new Error("admin_email_mismatch");
    }

    return { subject: claims.sub, email };
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }
}
