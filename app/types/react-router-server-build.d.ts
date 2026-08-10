declare module "virtual:react-router/server-build" {
  const build: Parameters<
    typeof import("react-router").createRequestHandler
  >[0];
  export default build;
}
