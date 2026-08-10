import type { createRequestHandler } from "react-router";

declare module "virtual:react-router/server-build" {
  const build: Parameters<typeof createRequestHandler>[0];
  export default build;
}
