import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [
    reactRouter(),
    ...(command === "serve"
      ? [cloudflare({ configPath: "./wrangler.base.jsonc" })]
      : []),
  ],
}));
