import { createRequestHandler } from "react-router";
import { deleteOrphanAttempts } from "../app/lib/cases/retention.server";
import { createCloudflareContextProvider } from "../app/lib/cloudflare/context";
import type { Env } from "../app/lib/env.server";
import { refreshFxRate } from "../app/lib/pricing/fx-repository.server";
import { createCspNonce } from "../app/lib/security/csp-nonce.server";
import {
  buildSecurityHeaders,
  requiresNoStore,
} from "../app/lib/security/headers.server";
import {
  publicErrorResponse,
  safeErrorLog,
} from "../app/lib/security/safe-error";

const requestHandler = createRequestHandler(
  async () => {
    const build = await import("virtual:react-router/server-build");

    if ("entry" in build) {
      return build;
    }

    const defaultBuild = build.default;
    return typeof defaultBuild === "function" ? defaultBuild() : defaultBuild;
  },
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const nonce = createCspNonce();
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    let response: Response;

    try {
      response = await requestHandler(
        request,
        createCloudflareContextProvider(env, ctx, { nonce, requestId }),
      );
    } catch {
      safeErrorLog({
        code: "request_failed",
        requestId,
        route: url.pathname,
      });
      response = publicErrorResponse({
        status: 500,
        code: "request_failed",
        locale: url.pathname.startsWith("/en") ? "en" : "zh",
        requestId,
      });
    }

    const headers = new Headers(response.headers);
    const mode =
      env.APP_ORIGIN === "https://kamelkyp.com" ? "production" : "preview";
    for (const [name, value] of buildSecurityHeaders({ nonce, mode })) {
      headers.set(name, value);
    }
    headers.set("X-Request-ID", requestId);
    if (requiresNoStore(url.pathname, response.status)) {
      headers.set("Cache-Control", "no-store");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        refreshFxRate(env.DB, env.FX_API_URL, fetch),
        deleteOrphanAttempts(env.DB, new Date().toISOString()),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;
