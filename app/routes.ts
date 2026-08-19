import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  route("language/:locale", "routes/language-preference.ts"),
  index("routes/language-redirect.tsx"),
] satisfies RouteConfig;
