# Scoped re-review package — Plan 01 Task 2 fix round 1

Fix base: d02f15531a86e11497c0d545153c9f46765c4f33
Head: b6b5b62e95c846d18248bcfbc9ac964e8090d2b7
Temporary diff PR: https://github.com/kekekewww/kamelkyp.com/pull/2

~~~diff
diff --git a/app/lib/env.server.ts b/app/lib/env.server.ts
index 87d24c4..098a896 100644
--- a/app/lib/env.server.ts
+++ b/app/lib/env.server.ts
@@ -1,3 +1,5 @@
+import { createContext } from "react-router";
+
 export interface Env {
   DB: D1Database;
   SUBMISSION_RATE_LIMITER: RateLimit;
@@ -13,6 +15,11 @@ export interface Env {
   APP_ORIGIN: string;
 }
 
+export const cloudflareContext = createContext<{
+  env: Env;
+  ctx: ExecutionContext;
+}>();
+
 declare module "react-router" {
   interface AppLoadContext {
     cloudflare: {
diff --git a/app/types/node-fs-promises.d.ts b/app/types/node-fs-promises.d.ts
new file mode 100644
index 0000000..7a8cb21
--- /dev/null
+++ b/app/types/node-fs-promises.d.ts
@@ -0,0 +1,18 @@
+declare namespace NodeJS {
+  interface ProcessEnv {
+    [name: string]: string | undefined;
+  }
+
+  interface Process {
+    env: ProcessEnv;
+  }
+}
+
+declare const process: NodeJS.Process;
+
+declare module "node:fs/promises" {
+  export function readFile(
+    path: string | URL,
+    encoding: string,
+  ): Promise<string>;
+}
diff --git a/app/types/react-router-server-build.d.ts b/app/types/react-router-server-build.d.ts
new file mode 100644
index 0000000..5ef9f8c
--- /dev/null
+++ b/app/types/react-router-server-build.d.ts
@@ -0,0 +1,7 @@
+declare module "virtual:react-router/server-build" {
+  import type { createRequestHandler } from "react-router";
+
+  const build: Parameters<typeof createRequestHandler>[0];
+
+  export = build;
+}
diff --git a/package.json b/package.json
index cb4ed60..d85d30f 100644
--- a/package.json
+++ b/package.json
@@ -11,7 +11,7 @@
     "cf:typegen": "wrangler types --config wrangler.base.jsonc",
     "format": "biome check --write .",
     "format:check": "biome ci .",
-    "typegen": "react-router typegen",
+    "typegen": "npm run cf:typegen && react-router typegen",
     "typecheck": "npm run typegen && tsc -b",
     "test:unit": "vitest run --config vitest.config.ts tests/unit",
     "test:worker": "vitest run --config vitest.worker.config.ts tests/worker",
diff --git a/tsconfig.json b/tsconfig.json
index 4ef5f71..cc535cf 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -7,12 +7,17 @@
     "jsx": "react-jsx",
     "strict": true,
     "skipLibCheck": true,
-    "noEmit": true
+    "noEmit": true,
+    "rootDirs": [".", "./.react-router/types"],
+    "types": ["vite/client"]
   },
   "include": [
     "app/**/*.ts",
     "app/**/*.tsx",
     "tests/**/*.ts",
+    "workers/**/*.ts",
+    "playwright.config.ts",
+    "worker-configuration.d.ts",
     "react-router.config.ts",
     "vite.config.ts"
   ]
diff --git a/vite.config.ts b/vite.config.ts
index 56af6b2..a92ab90 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -2,6 +2,11 @@ import { cloudflare } from "@cloudflare/vite-plugin";
 import { reactRouter } from "@react-router/dev/vite";
 import { defineConfig } from "vite";
 
-export default defineConfig({
-  plugins: [cloudflare({ configPath: "./wrangler.base.jsonc" }), reactRouter()],
-});
+export default defineConfig(({ command }) => ({
+  plugins: [
+    reactRouter(),
+    ...(command === "serve"
+      ? [cloudflare({ configPath: "./wrangler.base.jsonc" })]
+      : []),
+  ],
+}));
diff --git a/workers/app.ts b/workers/app.ts
index 8a83274..74f157a 100644
--- a/workers/app.ts
+++ b/workers/app.ts
@@ -1,15 +1,29 @@
-import { createRequestHandler } from "react-router";
-import type { Env } from "../app/lib/env.server";
+import {
+  createRequestHandler,
+  RouterContextProvider,
+} from "react-router";
+import { cloudflareContext, type Env } from "../app/lib/env.server";
 
 const requestHandler = createRequestHandler(
-  () => import("virtual:react-router/server-build"),
+  async () => {
+    const build = await import("virtual:react-router/server-build");
+
+    if ("entry" in build) {
+      return build;
+    }
+
+    const defaultBuild = build.default;
+    return typeof defaultBuild === "function"
+      ? defaultBuild()
+      : defaultBuild;
+  },
   import.meta.env.MODE,
 );
 
 export default {
   fetch(request, env, ctx) {
-    return requestHandler(request, {
-      cloudflare: { env, ctx },
-    });
+    const context = new RouterContextProvider();
+    context.set(cloudflareContext, { env, ctx });
+    return requestHandler(request, context);
   },
 } satisfies ExportedHandler<Env>;

~~~
