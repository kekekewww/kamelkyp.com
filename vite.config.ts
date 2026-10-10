import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [
    cloudflare({
      configPath: "./wrangler.base.jsonc",
      config:
        command === "serve" ? { compatibility_date: "2026-06-30" } : undefined,
      viteEnvironment: { name: "ssr" },
    }),
    reactRouter(),
  ],
  // The dev server has no optimizeDeps entries to crawl, so client deps are
  // found on first import. zod (Studio editor forms) would otherwise be found
  // mid-session and force a full page reload (`optimized dependencies changed`)
  // that drops in-flight navigations on a cold cache.
  optimizeDeps: { include: ["zod"] },
  build: {
    // CSP is `font-src 'self'`: never inline small font subsets as data: URIs.
    assetsInlineLimit: (file: string) =>
      /\.(woff2?|ttf|otf)$/.test(file) ? false : undefined,
  },
}));
