# Task 2 brief

Plan: docs/superpowers/plans/2026-08-10-01-cloud-foundation.md
Implementation branch: codex/01-cloud-foundation

### Task 2: Add the Worker request context and deterministic health route

**Files:**
- Create: wrangler.base.jsonc
- Create: app/lib/env.server.ts
- Create: app/root.tsx
- Create: app/routes.ts
- Create: app/routes/health.ts
- Create: app/routes/language-redirect.tsx
- Create: app/styles/tokens.css
- Create: app/styles/global.css
- Create: workers/app.ts
- Create: tests/unit/config-contract.test.ts
- Create: tests/e2e/smoke.spec.ts
- Create: playwright.config.ts

**Interfaces:**
- Consumes: React Router package scripts from Task 1.
- Produces: Env, React Router AppLoadContext and GET /health.

- [ ] **Step 1: Commit a failing configuration contract test**

~~~ts
// tests/unit/config-contract.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("cloud project configuration", () => {
  it("keeps SSR enabled and the Worker entry explicit", async () => {
    const routerConfig = await readFile("react-router.config.ts", "utf8");
    const wranglerConfig = JSON.parse(
      await readFile("wrangler.base.jsonc", "utf8"),
    );

    expect(routerConfig).toContain("ssr: true");
    expect(wranglerConfig.main).toBe("./workers/app.ts");
    expect(wranglerConfig.compatibility_flags).toContain("nodejs_compat");
  });
});
~~~

Cloud commit message: test: require Worker SSR configuration.

- [ ] **Step 2: Run the config test and verify it fails**

~~~bash
npm run test:unit -- tests/unit/config-contract.test.ts
~~~

Expected result: FAIL because wrangler.base.jsonc does not exist.

- [ ] **Step 3: Create Worker, Env and health route**

~~~json
{
  "$schema": "https://unpkg.com/wrangler@4.114.0/config-schema.json",
  "name": "kamelkyp-com",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-08-10",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 0.1
  }
}
~~~

~~~ts
// app/lib/env.server.ts
export interface Env {
  DB: D1Database;
  SUBMISSION_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  CSRF_SECRET: string;
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ADMIN_EMAIL: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_HMAC_SECRET: string;
  FX_API_URL: string;
  APP_ORIGIN: string;
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
~~~

~~~ts
// workers/app.ts
import { createRequestHandler } from "react-router";
import type { Env } from "../app/lib/env.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
~~~

~~~ts
// app/routes/health.ts
export function loader() {
  return Response.json(
    { ok: true, data: { service: "kamelkyp-com", status: "healthy" } },
    { headers: { "cache-control": "no-store" } },
  );
}
~~~

~~~ts
// app/routes/language-redirect.tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return redirect(language.startsWith("zh") ? "/zh" : "/en");
}
~~~

~~~ts
// app/routes.ts
import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  index("routes/language-redirect.tsx"),
] satisfies RouteConfig;
~~~

~~~tsx
// app/root.tsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import globalStyles from "./styles/global.css?url";
import tokenStyles from "./styles/tokens.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: tokenStyles },
  { rel: "stylesheet", href: globalStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
~~~

~~~css
/* app/styles/tokens.css */
:root {
  --color-mineral: #071724;
  --color-console: #0b2030;
  --color-chalk: #f3f1ea;
  --color-cool-gray: #a9b3bc;
  --color-coral: #ff5c4d;
  --motion-fast: 140ms;
  --motion-normal: 220ms;
  --motion-panel: 320ms;
}
~~~

~~~css
/* app/styles/global.css */
* {
  box-sizing: border-box;
}

html {
  color-scheme: dark;
  background: var(--color-mineral);
}

body {
  min-width: 320px;
  margin: 0;
  color: var(--color-chalk);
  background: var(--color-mineral);
  font-family: "Noto Sans TC", system-ui, sans-serif;
}

:focus-visible {
  outline: 2px solid var(--color-coral);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
~~~

- [ ] **Step 4: Add Preview smoke coverage**

~~~ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
~~~

~~~ts
// tests/e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("health endpoint is deterministic", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    data: { service: "kamelkyp-com", status: "healthy" },
  });
});

test("root chooses Chinese for zh browser language", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "zh-TW,zh;q=0.9" });
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh$/);
});
~~~

- [ ] **Step 5: Run cloud checks and commit**

~~~bash
npm run test:unit -- tests/unit/config-contract.test.ts
npm run typecheck
npm run build
~~~

Expected result: PASS. The root E2E remains scheduled for the first Preview in Task 4.

Cloud commit message: feat: add Worker request context and health route.

---
