import "@fontsource/barlow-condensed/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/noto-sans-tc/wght.css";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import type { Route } from "./+types/root";
import { PlaybackProvider } from "./components/media/playback-provider";
import componentStyles from "./styles/components.css?url";
import globalStyles from "./styles/global.css?url";
import layoutStyles from "./styles/layout.css?url";
import motionStyles from "./styles/motion.css?url";
import tokenStyles from "./styles/tokens.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: tokenStyles },
  { rel: "stylesheet", href: globalStyles },
  { rel: "stylesheet", href: layoutStyles },
  { rel: "stylesheet", href: componentStyles },
  { rel: "stylesheet", href: motionStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const documentLanguage = location.pathname.startsWith("/en")
    ? "en"
    : "zh-Hant";

  return (
    <html lang={documentLanguage}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#071724" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <PlaybackProvider>
      <Outlet />
    </PlaybackProvider>
  );
}
