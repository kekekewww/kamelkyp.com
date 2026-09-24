/**
 * Studio owner guard (admin-architecture §3). Server decides: every Studio
 * loader, action, API and preview route verifies the Cloudflare Access JWT
 * (the existing `verifyAccessRequest`: jose + team JWKS, iss/aud, `type:
 * app`, email === ADMIN_EMAIL) and fails closed with 403. Owner is the only
 * role; no cookie or secret of the app reaches the browser besides the
 * short-lived CSRF token.
 *
 * - `studioMiddleware` runs on the `/studio` root route (shell and preview).
 * - `withOwner` / `withOwnerMutation` wrap every loader/action; they reuse the
 *   middleware's identity or verify again (resource routes under
 *   /api/studio/* are outside the root and rely on this).
 * - Mutations need POST/PUT/PATCH/DELETE and a CSRF token, from the `csrfToken`
 *   form field or the `X-Studio-CSRF` header.
 */
import {
  type ActionFunctionArgs,
  createContext,
  type LoaderFunctionArgs,
  type MiddlewareFunction,
} from "react-router";
import {
  type AdminIdentity,
  type JwtVerifier,
  verifyAccessRequest,
} from "../../auth/access-jwt.server";
import {
  assertMutationMethod,
  verifyMutationToken,
} from "../../auth/admin.server";
import { createCsrfToken } from "../../auth/csrf.server";
import { cloudflareContext } from "../../cloudflare/context";
import type { Env } from "../../env.server";
import { readIntent } from "../forms";

export type OwnerIdentity = AdminIdentity;

/** Set by the Studio middleware; `null` outside the `/studio` root. */
export const ownerContext = createContext<OwnerIdentity | null>(null);

export const STUDIO_CSRF_HEADER = "X-Studio-CSRF";
const CSRF_LIFETIME_MS = 30 * 60 * 1000;

const DRAIN_LIMIT_BYTES = 1024 * 1024;

/**
 * Runs a guard; when it refuses, the request body is discarded before the
 * refusal propagates. Answering while a body is still unread (or cancelled)
 * drops the local runtime's connection under `wrangler dev`, so small bodies
 * are drained; larger or unsized ones are cancelled (Access stops those
 * before the Worker in production). The discarded bytes are never parsed.
 */
async function refusing<T>(request: Request, guard: () => Promise<T>) {
  try {
    return await guard();
  } catch (error) {
    if (request.body && !request.bodyUsed) {
      const length = Number(request.headers.get("Content-Length") ?? NaN);
      try {
        if (Number.isFinite(length) && length <= DRAIN_LIMIT_BYTES) {
          await request.arrayBuffer();
        } else {
          await request.body.cancel();
        }
      } catch {
        // Already closed: nothing left to discard.
      }
    }
    throw error;
  }
}

/**
 * Access identity of the owner, or a thrown 403 Response.
 *
 * The dev-owner branch exists only under the Vite dev server:
 * `import.meta.env.DEV` is the literal `false` in every build, so the branch
 * (and the variable name) is removed from deployable bundles, and
 * `verify-production-config.mjs` fails the release if it ever survives.
 */
export async function requireOwner(
  request: Request,
  env: Env,
  verifier?: JwtVerifier,
): Promise<OwnerIdentity> {
  if (
    import.meta.env.DEV &&
    env.STUDIO_DEV_OWNER_EMAIL &&
    env.ADMIN_EMAIL &&
    env.STUDIO_DEV_OWNER_EMAIL.trim().toLowerCase() ===
      env.ADMIN_EMAIL.trim().toLowerCase()
  ) {
    return {
      subject: "dev-owner",
      email: env.ADMIN_EMAIL.trim().toLowerCase(),
    };
  }
  return refusing(request, () => verifyAccessRequest(request, env, verifier));
}

/** Mutation guard: method, owner, then the CSRF token (form field or header). */
export async function requireOwnerMutation(
  request: Request,
  env: Env,
  csrf: { token: string | null },
  options: { verifier?: JwtVerifier; identity?: OwnerIdentity } = {},
): Promise<OwnerIdentity> {
  return refusing(request, async () => {
    assertMutationMethod(request);
    const identity =
      options.identity ?? (await requireOwner(request, env, options.verifier));
    await verifyMutationToken(request, env, identity, csrf.token);
    return identity;
  });
}

export function createStudioMiddleware(
  verifier?: JwtVerifier,
): MiddlewareFunction<Response> {
  return async ({ request, context }, next) => {
    const { env } = context.get(cloudflareContext);
    const identity = await requireOwner(request, env, verifier);
    context.set(ownerContext, identity);
    return next();
  };
}

/** Root-route middleware for `/studio` (shell and preview branch). */
export const studioMiddleware = createStudioMiddleware();

export interface StudioSession {
  ownerEmail: string;
  csrfToken: string;
  csrfExpiresAt: string;
}

export async function createStudioSession(
  env: Env,
  identity: OwnerIdentity,
  now: Date = new Date(),
): Promise<StudioSession> {
  return {
    ownerEmail: identity.email,
    csrfToken: await createCsrfToken({
      subject: identity.subject,
      secret: env.CSRF_SECRET,
      now,
    }),
    csrfExpiresAt: new Date(now.getTime() + CSRF_LIFETIME_MS).toISOString(),
  };
}

type WithContext<A> = A & {
  db: D1Database;
  env: Env;
  identity: OwnerIdentity;
  now: Date;
};

export type StudioLoaderArgs = WithContext<LoaderFunctionArgs>;
export type StudioActionArgs = WithContext<ActionFunctionArgs> & {
  /** Parsed body for form posts (multipart / urlencoded); null for JSON or streams. */
  formData: FormData | null;
  /** The `intent` form field (actions are dispatched by it). */
  intent: string | null;
};

async function resolveOwner(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  env: Env,
): Promise<OwnerIdentity> {
  return args.context.get(ownerContext) ?? requireOwner(args.request, env);
}

/** Wraps a Studio loader: Access-verified owner or 403. */
export function withOwner<R>(
  handler: (args: StudioLoaderArgs) => R | Promise<R>,
) {
  return async (args: LoaderFunctionArgs): Promise<R> => {
    const { env } = args.context.get(cloudflareContext);
    const identity = await resolveOwner(args, env);
    return handler({ ...args, db: env.DB, env, identity, now: new Date() });
  };
}

function isFormRequest(request: Request): boolean {
  const type = request.headers.get("Content-Type") ?? "";
  return (
    type.includes("multipart/form-data") ||
    type.includes("application/x-www-form-urlencoded")
  );
}

/** Wraps a Studio action or mutation API: method, owner, CSRF → handler. */
export function withOwnerMutation<R>(
  handler: (args: StudioActionArgs) => R | Promise<R>,
) {
  return async (args: ActionFunctionArgs): Promise<R> => {
    const { env } = args.context.get(cloudflareContext);
    const identity = await refusing(args.request, async () => {
      assertMutationMethod(args.request);
      return resolveOwner(args, env);
    });
    let formData: FormData | null = null;
    let token = args.request.headers.get(STUDIO_CSRF_HEADER);
    if (isFormRequest(args.request)) {
      try {
        formData = await args.request.formData();
      } catch {
        throw new Response("Bad Request", { status: 400 });
      }
      const field = formData.get("csrfToken");
      token = token ?? (typeof field === "string" ? field : null);
    }
    await requireOwnerMutation(args.request, env, { token }, { identity });
    return handler({
      ...args,
      db: env.DB,
      env,
      identity,
      now: new Date(),
      formData,
      intent: formData ? readIntent(formData) : null,
    });
  };
}
