import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  index("routes/language-redirect.tsx"),
] satisfies RouteConfig;
