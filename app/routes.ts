import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  index("routes/language-redirect.tsx"),
] satisfies RouteConfig;
