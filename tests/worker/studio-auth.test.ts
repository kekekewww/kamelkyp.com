import { env } from "cloudflare:workers";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../../app/lib/auth/access-jwt.server";
import { createCsrfToken } from "../../app/lib/auth/csrf.server";
import { createCloudflareContextProvider } from "../../app/lib/cloudflare/context";
import {
  createStudioMiddleware,
  createStudioSession,
  ownerContext,
  requireOwner,
  requireOwnerMutation,
  STUDIO_CSRF_HEADER,
  withOwner,
  withOwnerMutation,
} from "../../app/lib/cms/studio/auth.server";
import type { Env } from "../../app/lib/env.server";
import { createTestEnv } from "../helpers/test-env";

const owner = { subject: "owner-subject", email: "admin@example.com" };
const verifier: JwtVerifier = async () => ({
  sub: owner.subject,
  email: owner.email,
  type: "app",
});
const stranger: JwtVerifier = async () => ({
  sub: "other",
  email: "someone@example.com",
  type: "app",
});

function studioRequest(
  method = "GET",
  headers: Record<string, string> = {},
  body?: BodyInit,
) {
  return new Request("https://kamelkyp.com/studio/projects", {
    method,
    headers: {
      "Cf-Access-Jwt-Assertion": "test-token",
      Origin: "https://kamelkyp.com",
      ...headers,
    },
    body,
  });
}

function contextFor(testEnv: Env, identity?: typeof owner) {
  const context = createCloudflareContextProvider(
    testEnv,
    {} as ExecutionContext,
    { nonce: "n", requestId: "r" },
  );
  if (identity) context.set(ownerContext, identity);
  return context;
}

async function token(testEnv: Env, now = new Date(), subject = owner.subject) {
  return createCsrfToken({ subject, secret: testEnv.CSRF_SECRET, now });
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof Response) return error.status;
    throw error;
  }
}

describe("owner guard", () => {
  it("accepts only the configured owner and fails closed", async () => {
    const testEnv = createTestEnv();
    await expect(
      requireOwner(studioRequest(), testEnv, verifier),
    ).resolves.toEqual(owner);
    expect(await status(requireOwner(studioRequest(), testEnv, stranger))).toBe(
      403,
    );
    const noHeader = new Request("https://kamelkyp.com/studio");
    expect(await status(requireOwner(noHeader, testEnv, verifier))).toBe(403);
    expect(
      await status(
        requireOwner(
          studioRequest(),
          createTestEnv({ ADMIN_EMAIL: "" }),
          verifier,
        ),
      ),
    ).toBe(403);
  });

  it("uses the dev owner only on the dev server and only for ADMIN_EMAIL", async () => {
    const devEnv = createTestEnv({
      STUDIO_DEV_OWNER_EMAIL: "admin@example.com",
    });
    const noHeader = new Request("https://kamelkyp.com/studio");
    if (import.meta.env.DEV) {
      await expect(requireOwner(noHeader, devEnv)).resolves.toEqual({
        subject: "dev-owner",
        email: "admin@example.com",
      });
    } else {
      expect(await status(requireOwner(noHeader, devEnv))).toBe(403);
    }
    const mismatch = createTestEnv({
      STUDIO_DEV_OWNER_EMAIL: "someone@example.com",
    });
    expect(await status(requireOwner(noHeader, mismatch))).toBe(403);
  });

  it("checks header CSRF tokens on mutations", async () => {
    const testEnv = createTestEnv();
    const valid = await token(testEnv);
    await expect(
      requireOwnerMutation(
        studioRequest("POST"),
        testEnv,
        { token: valid },
        { verifier },
      ),
    ).resolves.toEqual(owner);
    expect(
      await status(
        requireOwnerMutation(
          studioRequest("GET"),
          testEnv,
          { token: valid },
          { verifier },
        ),
      ),
    ).toBe(405);
    expect(
      await status(
        requireOwnerMutation(
          studioRequest("POST"),
          testEnv,
          { token: null },
          { verifier },
        ),
      ),
    ).toBe(403);
    const expired = await token(testEnv, new Date(Date.now() - 31 * 60 * 1000));
    expect(
      await status(
        requireOwnerMutation(
          studioRequest("POST"),
          testEnv,
          { token: expired },
          { verifier },
        ),
      ),
    ).toBe(403);
    const otherSubject = await token(testEnv, new Date(), "someone-else");
    expect(
      await status(
        requireOwnerMutation(
          studioRequest("POST"),
          testEnv,
          { token: otherSubject },
          { verifier },
        ),
      ),
    ).toBe(403);
    expect(
      await status(
        requireOwnerMutation(
          studioRequest("POST", { Origin: "https://evil.example" }),
          testEnv,
          { token: valid },
          { verifier },
        ),
      ),
    ).toBe(403);
  });

  it("issues a session with a verifiable CSRF token", async () => {
    const testEnv = createTestEnv();
    const now = new Date();
    const session = await createStudioSession(testEnv, owner, now);
    expect(session.ownerEmail).toBe(owner.email);
    expect(Date.parse(session.csrfExpiresAt)).toBe(
      now.getTime() + 30 * 60 * 1000,
    );
    await expect(
      requireOwnerMutation(
        studioRequest("POST"),
        testEnv,
        { token: session.csrfToken },
        { verifier },
      ),
    ).resolves.toEqual(owner);
  });
});

describe("route wrappers", () => {
  it("runs the Studio middleware before any loader", async () => {
    const testEnv = createTestEnv({ DB: env.DB });
    const context = contextFor(testEnv);
    const middleware = createStudioMiddleware(verifier);
    const next = async () => new Response("ok");
    const response = await middleware(
      { request: studioRequest(), params: {}, context } as never,
      next,
    );
    expect((response as Response).status).toBe(200);
    expect(context.get(ownerContext)).toEqual(owner);

    const denied = createStudioMiddleware(stranger);
    expect(
      await status(
        Promise.resolve(
          denied(
            {
              request: studioRequest(),
              params: {},
              context: contextFor(testEnv),
            } as never,
            next,
          ),
        ),
      ),
    ).toBe(403);
  });

  it("gives loaders the identity, database and clock", async () => {
    const testEnv = createTestEnv({ DB: env.DB });
    const loader = withOwner(({ identity, db, env: loaderEnv, now }) => ({
      email: identity.email,
      hasDb: db === testEnv.DB,
      origin: loaderEnv.APP_ORIGIN,
      isDate: now instanceof Date,
    }));
    await expect(
      loader({
        request: studioRequest(),
        params: {},
        context: contextFor(testEnv, owner),
      } as unknown as LoaderFunctionArgs),
    ).resolves.toEqual({
      email: owner.email,
      hasDb: true,
      origin: "https://kamelkyp.com",
      isDate: true,
    });
    expect(
      await status(
        loader({
          request: new Request("https://kamelkyp.com/api/studio/session"),
          params: {},
          context: contextFor(testEnv),
        } as unknown as LoaderFunctionArgs),
      ),
    ).toBe(403);
  });

  it("guards actions with method, CSRF and intent", async () => {
    const testEnv = createTestEnv({ DB: env.DB });
    const action = withOwnerMutation(({ formData, intent, identity }) => ({
      intent,
      title: formData?.get("title") ?? null,
      email: identity.email,
    }));
    const args = (request: Request) =>
      ({
        request,
        params: {},
        context: contextFor(testEnv, owner),
      }) as unknown as ActionFunctionArgs;

    const form = new FormData();
    form.set("intent", "save");
    form.set("title", "Hello");
    form.set("csrfToken", await token(testEnv));
    await expect(
      action(args(studioRequest("POST", {}, form))),
    ).resolves.toEqual({
      intent: "save",
      title: "Hello",
      email: owner.email,
    });

    const noToken = new FormData();
    noToken.set("intent", "save");
    expect(await status(action(args(studioRequest("POST", {}, noToken))))).toBe(
      403,
    );
    expect(await status(action(args(studioRequest("GET"))))).toBe(405);

    const json = studioRequest(
      "POST",
      {
        "Content-Type": "application/json",
        [STUDIO_CSRF_HEADER]: await token(testEnv),
      },
      JSON.stringify({ url: "https://x.example" }),
    );
    await expect(action(args(json))).resolves.toEqual({
      intent: null,
      title: null,
      email: owner.email,
    });
  });

  it("discards the body of every refused request", async () => {
    // Answering 403 while an upload body is still unread breaks the local
    // runtime's connection; a refusal never leaves the body pending.
    const testEnv = createTestEnv({ DB: env.DB });
    const action = withOwnerMutation(() => "unreachable");
    const refusedUpload = new Request(
      "https://kamelkyp.com/api/studio/media/x/content",
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: "not a file",
      },
    );
    expect(
      await status(
        action({
          request: refusedUpload,
          params: {},
          context: contextFor(testEnv),
        } as unknown as ActionFunctionArgs),
      ),
    ).toBe(403);
    expect(refusedUpload.bodyUsed).toBe(true);

    const missingToken = studioRequest(
      "POST",
      { "Content-Type": "application/json" },
      JSON.stringify({ url: "https://x.example" }),
    );
    expect(
      await status(
        action({
          request: missingToken,
          params: {},
          context: contextFor(testEnv, owner),
        } as unknown as ActionFunctionArgs),
      ),
    ).toBe(403);
    expect(missingToken.bodyUsed).toBe(true);

    const refusedPost = studioRequest(
      "POST",
      { "Content-Type": "application/x-www-form-urlencoded" },
      "caseId=x",
    );
    const middleware = createStudioMiddleware(stranger);
    expect(
      await status(
        Promise.resolve(
          middleware(
            {
              request: refusedPost,
              params: {},
              context: contextFor(testEnv),
            } as never,
            async () => new Response("ok"),
          ),
        ),
      ),
    ).toBe(403);
    expect(refusedPost.bodyUsed).toBe(true);
  });
});
