import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/noto-sans-tc/wght.css";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteError,
} from "react-router";
import type { Route } from "./+types/root";
import { PlaybackProvider } from "./components/media/playback-provider";
import { RevealRoot } from "./components/motion/reveal-root";
import { getSiteCopy } from "./lib/i18n/copy";
import { localePath } from "./lib/i18n/path";
import { MotionTierSync } from "./lib/motion/reduced-motion";
import adminStyles from "./styles/admin.css?url";
import commissionStyles from "./styles/commission.css?url";
import componentStyles from "./styles/components.css?url";
import globalStyles from "./styles/global.css?url";
import layoutStyles from "./styles/layout.css?url";
import legacyStyles from "./styles/legacy.css?url";
import mediaStyles from "./styles/media.css?url";
import motionStyles from "./styles/motion.css?url";
import aboutPageStyles from "./styles/pages/about.css?url";
import commissionPageStyles from "./styles/pages/commission.css?url";
import homePageStyles from "./styles/pages/home.css?url";
import legalPageStyles from "./styles/pages/legal.css?url";
import servicesPageStyles from "./styles/pages/services.css?url";
import workPageStyles from "./styles/pages/work.css?url";
import writingPageStyles from "./styles/pages/writing.css?url";
import tokenStyles from "./styles/tokens.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: tokenStyles },
  { rel: "stylesheet", href: globalStyles },
  { rel: "stylesheet", href: layoutStyles },
  { rel: "stylesheet", href: legacyStyles },
  { rel: "stylesheet", href: componentStyles },
  { rel: "stylesheet", href: homePageStyles },
  { rel: "stylesheet", href: workPageStyles },
  { rel: "stylesheet", href: servicesPageStyles },
  { rel: "stylesheet", href: aboutPageStyles },
  { rel: "stylesheet", href: writingPageStyles },
  { rel: "stylesheet", href: commissionPageStyles },
  { rel: "stylesheet", href: legalPageStyles },
  { rel: "stylesheet", href: commissionStyles },
  { rel: "stylesheet", href: mediaStyles },
  { rel: "stylesheet", href: motionStyles },
  { rel: "stylesheet", href: adminStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Studio chrome is English (content fields carry their own lang attributes);
  // preview pages render public content in the previewed locale (?locale).
  const studio =
    location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const preview =
    location.pathname === "/studio/preview" ||
    location.pathname.startsWith("/studio/preview/");
  const documentLanguage = preview
    ? new URLSearchParams(location.search).get("locale") === "en"
      ? "en"
      : "zh-Hant"
    : studio || location.pathname.startsWith("/en")
      ? "en"
      : "zh-Hant";

  return (
    <html lang={documentLanguage}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#090D12" />
        <Meta />
        <Links nonce="" />
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
      <MotionTierSync />
      <RevealRoot />
      <Outlet />
    </PlaybackProvider>
  );
}

/** Rendered outside the public shell, so it carries its own recovery links (IA §4.12). */
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const locale = location.pathname.startsWith("/en") ? "en" : "zh";
  const copy = getSiteCopy(locale);
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const title = notFound ? copy.error404Title : copy.errorGenericTitle;

  return (
    <main className="error-page" id="main-content" aria-live="polite">
      <title>{`${title} — Kamel`}</title>
      <div className="grid">
        <a className="error-page__brand" href={localePath(locale)}>
          Kamel
        </a>
        <p className="error-page__numeral" aria-hidden="true">
          {status}
        </p>
        <div className="error-page__content">
          <p className="eyebrow">
            {notFound ? "404 / NOT FOUND" : `${status} / ERROR`}
          </p>
          <h1>{title}</h1>
          <p className="error-page__body">
            {notFound ? copy.error404Body : copy.errorGenericBody}
          </p>
          <div className="error-page__links">
            <a className="text-link" href={localePath(locale)}>
              {copy.backHome}
            </a>
            {notFound ? (
              <>
                <a className="text-link" href={localePath(locale, "/works")}>
                  {copy.viewWork}
                </a>
                <a
                  className="button button--primary"
                  href={localePath(locale, "/commission")}
                >
                  {copy.cta}
                </a>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
