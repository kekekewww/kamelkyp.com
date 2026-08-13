# Review package — Plan 01 Task 2

Base: d11cc154c45389c03568d8ba0b42bc1ef6ba852b
Head: d02f1553
PR: https://github.com/kekekewww/kamelkyp.com/pull/1

## 62a1313c — test: require Worker SSR configuration.

https://github.com/kekekewww/kamelkyp.com/commit/62a1313c5676e8e9d99f10801bb8df762634dc0c

~~~diff
@@ -0,0 +1,15 @@
+import { readFile } from "node:fs/promises";
+import { describe, expect, it } from "vitest";
+
+describe("cloud project configuration", () => {
+  it("keeps SSR enabled and the Worker entry explicit", async () => {
+    const routerConfig = await readFile("react-router.config.ts", "utf8");
+    const wranglerConfig = JSON.parse(
+      await readFile("wrangler.base.jsonc", "utf8"),
+    );
+
+    expect(routerConfig).toContain("ssr: true");
+    expect(wranglerConfig.main).toBe("./workers/app.ts");
+    expect(wranglerConfig.compatibility_flags).toContain("nodejs_compat");
+  });
+});
~~~

## c3675411 — ci: run cloud configuration contract test

https://github.com/kekekewww/kamelkyp.com/commit/c367541183bd032ad115977de09a5a1d68fdc679

~~~diff
@@ -0,0 +1,22 @@
+name: Cloud configuration contract
+
+on:
+  push:
+    branches:
+      - codex/01-cloud-foundation
+
+permissions:
+  contents: read
+
+jobs:
+  config-contract:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v6
+      - uses: actions/setup-node@v5
+        with:
+          node-version: 24
+          cache: npm
+          cache-dependency-path: package-lock.json
+      - run: npm ci
+      - run: npm run test:unit -- tests/unit/config-contract.test.ts
~~~

## 227f31fe — ci: run cloud configuration contract test

https://github.com/kekekewww/kamelkyp.com/commit/227f31fe320cc68600694675839bd2382d6b6ae4

~~~diff
@@ -1,6 +1,9 @@
 name: Cloud configuration contract
 
 on:
+  pull_request:
+    branches:
+      - main
   push:
     branches:
       - codex/01-cloud-foundation
~~~

## 459a9d4d — feat: add Worker request context and health route.

https://github.com/kekekewww/kamelkyp.com/commit/459a9d4d2e970decec36289ccdd4970d08659528

~~~diff
@@ -0,0 +1,23 @@
+export interface Env {
+  DB: D1Database;
+  SUBMISSION_RATE_LIMITER: RateLimit;
+  TURNSTILE_SECRET: string;
+  TURNSTILE_SITE_KEY: string;
+  CSRF_SECRET: string;
+  ACCESS_AUD: string;
+  ACCESS_TEAM_DOMAIN: string;
+  ADMIN_EMAIL: string;
+  APPS_SCRIPT_URL: string;
+  APPS_SCRIPT_HMAC_SECRET: string;
+  FX_API_URL: string;
+  APP_ORIGIN: string;
+}
+
+declare module "react-router" {
+  interface AppLoadContext {
+    cloudflare: {
+      env: Env;
+      ctx: ExecutionContext;
+    };
+  }
+}
@@ -0,0 +1,37 @@
+import {
+  Links,
+  Meta,
+  Outlet,
+  Scripts,
+  ScrollRestoration,
+} from "react-router";
+import type { Route } from "./+types/root";
+import globalStyles from "./styles/global.css?url";
+import tokenStyles from "./styles/tokens.css?url";
+
+export const links: Route.LinksFunction = () => [
+  { rel: "stylesheet", href: tokenStyles },
+  { rel: "stylesheet", href: globalStyles },
+];
+
+export function Layout({ children }: { children: React.ReactNode }) {
+  return (
+    <html lang="zh-Hant">
+      <head>
+        <meta charSet="utf-8" />
+        <meta name="viewport" content="width=device-width, initial-scale=1" />
+        <Meta />
+        <Links />
+      </head>
+      <body>
+        {children}
+        <ScrollRestoration />
+        <Scripts />
+      </body>
+    </html>
+  );
+}
+
+export default function App() {
+  return <Outlet />;
+}
@@ -0,0 +1,6 @@
+import { index, route, type RouteConfig } from "@react-router/dev/routes";
+
+export default [
+  route("health", "routes/health.ts"),
+  index("routes/language-redirect.tsx"),
+] satisfies RouteConfig;
@@ -0,0 +1,6 @@
+export function loader() {
+  return Response.json(
+    { ok: true, data: { service: "kamelkyp-com", status: "healthy" } },
+    { headers: { "cache-control": "no-store" } },
+  );
+}
@@ -0,0 +1,6 @@
+import { redirect, type LoaderFunctionArgs } from "react-router";
+
+export function loader({ request }: LoaderFunctionArgs) {
+  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
+  return redirect(language.startsWith("zh") ? "/zh" : "/en");
+}
@@ -0,0 +1,32 @@
+* {
+  box-sizing: border-box;
+}
+
+html {
+  color-scheme: dark;
+  background: var(--color-mineral);
+}
+
+body {
+  min-width: 320px;
+  margin: 0;
+  color: var(--color-chalk);
+  background: var(--color-mineral);
+  font-family: "Noto Sans TC", system-ui, sans-serif;
+}
+
+:focus-visible {
+  outline: 2px solid var(--color-coral);
+  outline-offset: 3px;
+}
+
+@media (prefers-reduced-motion: reduce) {
+  *,
+  *::before,
+  *::after {
+    scroll-behavior: auto !important;
+    transition-duration: 1ms !important;
+    animation-duration: 1ms !important;
+    animation-iteration-count: 1 !important;
+  }
+}
@@ -0,0 +1,10 @@
+:root {
+  --color-mineral: #071724;
+  --color-console: #0b2030;
+  --color-chalk: #f3f1ea;
+  --color-cool-gray: #a9b3bc;
+  --color-coral: #ff5c4d;
+  --motion-fast: 140ms;
+  --motion-normal: 220ms;
+  --motion-panel: 320ms;
+}
@@ -0,0 +1,13 @@
+import { defineConfig, devices } from "@playwright/test";
+
+export default defineConfig({
+  testDir: "./tests/e2e",
+  use: {
+    baseURL: process.env.PREVIEW_URL,
+    trace: "retain-on-failure",
+  },
+  projects: [
+    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
+    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
+  ],
+});
@@ -0,0 +1,16 @@
+import { expect, test } from "@playwright/test";
+
+test("health endpoint is deterministic", async ({ request }) => {
+  const response = await request.get("/health");
+  expect(response.status()).toBe(200);
+  await expect(response.json()).resolves.toEqual({
+    ok: true,
+    data: { service: "kamelkyp-com", status: "healthy" },
+  });
+});
+
+test("root chooses Chinese for zh browser language", async ({ page }) => {
+  await page.setExtraHTTPHeaders({ "accept-language": "zh-TW,zh;q=0.9" });
+  await page.goto("/");
+  await expect(page).toHaveURL(/\/zh$/);
+});
@@ -0,0 +1,15 @@
+import { createRequestHandler } from "react-router";
+import type { Env } from "../app/lib/env.server";
+
+const requestHandler = createRequestHandler(
+  () => import("virtual:react-router/server-build"),
+  import.meta.env.MODE,
+);
+
+export default {
+  fetch(request, env, ctx) {
+    return requestHandler(request, {
+      cloudflare: { env, ctx },
+    });
+  },
+} satisfies ExportedHandler<Env>;
@@ -0,0 +1,11 @@
+{
+  "$schema": "https://unpkg.com/wrangler@4.114.0/config-schema.json",
+  "name": "kamelkyp-com",
+  "main": "./workers/app.ts",
+  "compatibility_date": "2026-08-10",
+  "compatibility_flags": ["nodejs_compat"],
+  "observability": {
+    "enabled": true,
+    "head_sampling_rate": 0.1
+  }
+}
~~~

## d02f1553 — ci: run cloud configuration contract test

https://github.com/kekekewww/kamelkyp.com/commit/d02f15531a86e11497c0d545153c9f46765c4f33

~~~diff
@@ -23,3 +23,5 @@ jobs:
           cache-dependency-path: package-lock.json
       - run: npm ci
       - run: npm run test:unit -- tests/unit/config-contract.test.ts
+      - run: npm run typecheck
+      - run: npm run build
~~~

