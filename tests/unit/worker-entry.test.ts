/**
 * The Worker entry's own response headers (WP4 §4.3, K6). The router's
 * request handler is replaced by a fixed page, so these cases run
 * `workers/app.ts` itself: only the production deployment answering on its
 * own origin may be indexed; the same Worker reached on its workers.dev host,
 * every preview and every Studio response carry `X-Robots-Tag`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../app/lib/env.server";
import worker from "../../workers/app";

const page = vi.hoisted(() => ({ status: 200 }));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  createRequestHandler: () => async () =>
    new Response("<!doctype html><title>Kamel</title>", {
      status: page.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
}));

const PRODUCTION_ORIGIN = "https://kamelkyp.com";
const WORKERS_DEV = "https://kamelkyp-com.example.workers.dev";
const PREVIEW_ORIGIN = "https://kamelkyp-com-preview.example.workers.dev";

type Fetch = NonNullable<typeof worker.fetch>;
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as Parameters<Fetch>[2];

async function serve(appOrigin: string, url: string) {
  const env = { APP_ORIGIN: appOrigin } as unknown as Env;
  const request = new Request(url) as Parameters<Fetch>[0];
  return (worker.fetch as Fetch)(request, env, ctx);
}

afterEach(() => {
  page.status = 200;
});

describe("Worker response headers: indexing (WP4 K6)", () => {
  it("lets the production deployment be indexed on its own origin only", async () => {
    const response = await serve(PRODUCTION_ORIGIN, `${PRODUCTION_ORIGIN}/en`);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
  });

  it("keeps the production Worker on its workers.dev host out of search", async () => {
    const response = await serve(PRODUCTION_ORIGIN, `${WORKERS_DEV}/en`);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("marks every preview response noindex, whatever the host", async () => {
    for (const url of [`${PREVIEW_ORIGIN}/en`, `${PRODUCTION_ORIGIN}/en`]) {
      const response = await serve(PREVIEW_ORIGIN, url);
      expect(response.headers.get("X-Robots-Tag"), url).toBe(
        "noindex, nofollow",
      );
      expect(response.headers.has("Strict-Transport-Security"), url).toBe(
        false,
      );
    }
  });

  it("keeps the Studio out of search on the production origin", async () => {
    const response = await serve(
      PRODUCTION_ORIGIN,
      `${PRODUCTION_ORIGIN}/studio`,
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps an error page on the workers.dev host noindex too", async () => {
    page.status = 500;
    const response = await serve(
      PRODUCTION_ORIGIN,
      `${WORKERS_DEV}/en/works/x`,
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
