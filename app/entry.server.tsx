import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type {
  EntryContext,
  HandleErrorFunction,
  RouterContextProvider,
} from "react-router";
import { isRouteErrorResponse, ServerRouter } from "react-router";
import { cloudflareContext } from "./lib/cloudflare/context";
import { safeErrorLog } from "./lib/security/safe-error";

export const streamTimeout = 5_000;

export const handleError: HandleErrorFunction = (
  error,
  { request, context },
) => {
  let requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
  try {
    requestId = context.get(cloudflareContext).security.requestId;
  } catch {
    // Context creation failures still receive an opaque request ID.
  }
  safeErrorLog({
    code: isRouteErrorResponse(error) ? `route_${error.status}` : "route_error",
    requestId,
    route: new URL(request.url).pathname,
  });
};

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  const { security } = loadContext.get(cloudflareContext);
  let shellRendered = false;
  const body = await renderToReadableStream(
    <ServerRouter
      context={routerContext}
      nonce={security.nonce}
      url={request.url}
    />,
    {
      nonce: security.nonce,
      signal: AbortSignal.timeout(streamTimeout + 1_000),
      onError() {
        responseStatusCode = 500;
        if (shellRendered) {
          safeErrorLog({
            code: "ssr_stream_failed",
            requestId: security.requestId,
            route: new URL(request.url).pathname,
          });
        }
      },
    },
  );
  shellRendered = true;

  const userAgent = request.headers.get("user-agent");
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}
