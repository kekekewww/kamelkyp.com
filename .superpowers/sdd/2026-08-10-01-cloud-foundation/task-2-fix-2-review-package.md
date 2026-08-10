# Scoped re-review package — Plan 01 Task 2 fix round 2

Fix base: b6b5b62e95c846d18248bcfbc9ac964e8090d2b7
Head: 63491ea4528365c2ae65f37c1f6054447d3f933a
Temporary diff PR: https://github.com/kekekewww/kamelkyp.com/pull/3

~~~diff
diff --git a/.github/workflows/config-contract.yml b/.github/workflows/config-contract.yml
index adccf74..0a85152 100644
--- a/.github/workflows/config-contract.yml
+++ b/.github/workflows/config-contract.yml
@@ -25,3 +25,4 @@ jobs:
       - run: npm run test:unit -- tests/unit/config-contract.test.ts
       - run: npm run typecheck
       - run: npm run build
+      - run: npx wrangler deploy --dry-run --config build/server/wrangler.json
diff --git a/app/lib/cloudflare/context.ts b/app/lib/cloudflare/context.ts
new file mode 100644
index 0000000..216390f
--- /dev/null
+++ b/app/lib/cloudflare/context.ts
@@ -0,0 +1,21 @@
+import {
+  createContext,
+  RouterContextProvider,
+} from "react-router";
+import type { Env } from "../env.server";
+
+export interface CloudflareContextValue {
+  env: Env;
+  ctx: ExecutionContext;
+}
+
+export const cloudflareContext = createContext<CloudflareContextValue>();
+
+export function createCloudflareContextProvider(
+  env: Env,
+  ctx: ExecutionContext,
+) {
+  const provider = new RouterContextProvider();
+  provider.set(cloudflareContext, { env, ctx });
+  return provider;
+}
diff --git a/app/lib/env.server.ts b/app/lib/env.server.ts
index 098a896..dfa1145 100644
--- a/app/lib/env.server.ts
+++ b/app/lib/env.server.ts
@@ -1,5 +1,3 @@
-import { createContext } from "react-router";
-
 export interface Env {
   DB: D1Database;
   SUBMISSION_RATE_LIMITER: RateLimit;
@@ -14,17 +12,3 @@ export interface Env {
   FX_API_URL: string;
   APP_ORIGIN: string;
 }
-
-export const cloudflareContext = createContext<{
-  env: Env;
-  ctx: ExecutionContext;
-}>();
-
-declare module "react-router" {
-  interface AppLoadContext {
-    cloudflare: {
-      env: Env;
-      ctx: ExecutionContext;
-    };
-  }
-}
diff --git a/tests/unit/cloudflare-context.test.ts b/tests/unit/cloudflare-context.test.ts
new file mode 100644
index 0000000..c8a8b79
--- /dev/null
+++ b/tests/unit/cloudflare-context.test.ts
@@ -0,0 +1,17 @@
+import { describe, expect, it } from "vitest";
+import type { Env } from "../../app/lib/env.server";
+import {
+  cloudflareContext,
+  createCloudflareContextProvider,
+} from "../../app/lib/cloudflare/context";
+
+describe("Cloudflare request context", () => {
+  it("round-trips the Worker bindings and execution context", () => {
+    const env = {} as Env;
+    const ctx = {} as ExecutionContext;
+
+    const provider = createCloudflareContextProvider(env, ctx);
+
+    expect(provider.get(cloudflareContext)).toEqual({ env, ctx });
+  });
+});
diff --git a/vite.config.ts b/vite.config.ts
index a92ab90..f5693ef 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -2,11 +2,12 @@ import { cloudflare } from "@cloudflare/vite-plugin";
 import { reactRouter } from "@react-router/dev/vite";
 import { defineConfig } from "vite";
 
-export default defineConfig(({ command }) => ({
+export default defineConfig({
   plugins: [
+    cloudflare({
+      configPath: "./wrangler.base.jsonc",
+      viteEnvironment: { name: "ssr" },
+    }),
     reactRouter(),
-    ...(command === "serve"
-      ? [cloudflare({ configPath: "./wrangler.base.jsonc" })]
-      : []),
   ],
-}));
+});
diff --git a/workers/app.ts b/workers/app.ts
index 74f157a..35c0f25 100644
--- a/workers/app.ts
+++ b/workers/app.ts
@@ -1,8 +1,6 @@
-import {
-  createRequestHandler,
-  RouterContextProvider,
-} from "react-router";
-import { cloudflareContext, type Env } from "../app/lib/env.server";
+import { createRequestHandler } from "react-router";
+import { createCloudflareContextProvider } from "../app/lib/cloudflare/context";
+import type { Env } from "../app/lib/env.server";
 
 const requestHandler = createRequestHandler(
   async () => {
@@ -22,8 +20,9 @@ const requestHandler = createRequestHandler(
 
 export default {
   fetch(request, env, ctx) {
-    const context = new RouterContextProvider();
-    context.set(cloudflareContext, { env, ctx });
-    return requestHandler(request, context);
+    return requestHandler(
+      request,
+      createCloudflareContextProvider(env, ctx),
+    );
   },
 } satisfies ExportedHandler<Env>;

~~~
