import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  route("language/:locale", "routes/language-preference.ts"),
  index("routes/language-redirect.tsx"),
  route(":lang", "routes/public/layout.tsx", [
    route("commission", "routes/public/commission-index.tsx"),
    route("mixing", "routes/public/mixing-index.tsx"),
    route("mixing/full", "routes/public/mixing-full.tsx"),
    route("mixing/vocal", "routes/public/mixing-vocal.tsx"),
    route("song-transition", "routes/public/transition-index.tsx"),
    route("song-transition/simple", "routes/public/transition-simple.tsx"),
    route("song-transition/edit", "routes/public/transition-edit.tsx"),
  ]),
] satisfies RouteConfig;
