import { createRequestHandler } from "react-router";
import { createCloudflareContextProvider } from "../app/lib/cloudflare/context";
import type { Env } from "../app/lib/env.server";

const requestHandler = createRequestHandler(
  async () => {
    const build = await import("virtual:react-router/server-build");

    if ("entry" in build) {
      return build;
    }

    const defaultBuild = build.default;
    return typeof defaultBuild === "function"
      ? defaultBuild()
      : defaultBuild;
  },
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(
      request,
      createCloudflareContextProvider(env, ctx),
    );
  },
} satisfies ExportedHandler<Env>;
