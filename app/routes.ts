import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("health", "routes/health.ts"),
  route("language/:locale", "routes/language-preference.ts"),
  index("routes/language-redirect.tsx"),
  route(":lang", "routes/public/layout.tsx", [
    index("routes/public/home.tsx"),
    route("commission", "routes/public/commission-index.tsx"),
    route("commission/:category", "routes/public/commission-category.tsx"),
    route(
      "commission/:category/:service",
      "routes/public/commission-service.tsx",
    ),
    route("mixing", "routes/public/mixing-index.tsx"),
    route("mixing/full", "routes/public/mixing-full.tsx"),
    route("mixing/vocal", "routes/public/mixing-vocal.tsx"),
    route("song-transition", "routes/public/transition-index.tsx"),
    route("song-transition/simple", "routes/public/transition-simple.tsx"),
    route("song-transition/edit", "routes/public/transition-edit.tsx"),
    route("works", "routes/public/works-index.tsx"),
    route("works/:slug", "routes/public/work-detail.tsx"),
    route("other", "routes/public/other-index.tsx"),
    route("other/:slug", "routes/public/other-detail.tsx"),
    route("terms", "routes/public/terms.tsx"),
    route("privacy", "routes/public/privacy.tsx"),
  ]),
] satisfies RouteConfig;
