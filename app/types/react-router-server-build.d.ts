declare module "virtual:react-router/server-build" {
  import type { createRequestHandler } from "react-router";

  const build: Parameters<typeof createRequestHandler>[0];

  export = build;
}
