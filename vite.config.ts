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
}));
