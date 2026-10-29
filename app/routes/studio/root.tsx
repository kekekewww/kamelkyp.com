/**
 * `/studio` root (admin-architecture §2.1, §3.1). The owner middleware runs
 * before every Studio page and preview loader; the loader hands the client
 * its session (CSRF token), media config and sidebar counts. Studio styles
 * load only here, never on public pages.
 */
import { useEffect, useState } from "react";
import {
  isRouteErrorResponse,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { StudioErrorView } from "../../components/studio/error-view";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../components/studio/ui";
import { readMediaConfig } from "../../lib/cms/media/config.server";
import { MediaConfigProvider } from "../../lib/cms/media/media-config-context";
import { getStudioCounts } from "../../lib/cms/studio/attention.server";
import {
  createStudioSession,
  studioMiddleware,
  withOwner,
} from "../../lib/cms/studio/auth.server";
import { studioSessionExpired } from "../../lib/cms/studio/session.client";
import studioStyles from "../../styles/studio/base.css?url";

export const middleware = [studioMiddleware];

export const loader = withOwner(async ({ env, db, identity, now }) => {
  const [session, counts] = await Promise.all([
    createStudioSession(env, identity, now),
    getStudioCounts(db),
  ]);
  return {
    ...session,
    mediaConfig: readMediaConfig(env),
    attentionCount: counts.attention,
    pendingCommissions: counts.pendingCommissions,
  };
});

export type StudioRootData = Awaited<ReturnType<typeof loader>>;

export const links = () => [{ rel: "stylesheet", href: studioStyles }];

export default function StudioRoot() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  // Preview pages render the public shell; no Studio chrome or scope there.
  const preview =
    location.pathname === "/studio/preview" ||
    location.pathname.startsWith("/studio/preview/");
  const content = (
    <StudioSessionProvider initial={data}>
      <MediaConfigProvider value={data.mediaConfig}>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </MediaConfigProvider>
    </StudioSessionProvider>
  );
  return (
    <>
      <meta name="robots" content="noindex,nofollow" />
      {preview ? content : <div className="studio">{content}</div>}
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const routeStatus = isRouteErrorResponse(error) ? error.status : null;
  const [expired, setExpired] = useState(false);

  // A non-route error on a Studio navigation is usually Access's login
  // redirect failing under CORS (see `studioSessionExpired`). Check once, on
  // the client; until it answers the generic view stays up.
  useEffect(() => {
    if (routeStatus !== null) return;
    let cancelled = false;
    void studioSessionExpired().then((result) => {
      if (!cancelled) setExpired(result);
    });
    return () => {
      cancelled = true;
    };
  }, [routeStatus]);

  if (routeStatus === null && expired) {
    return (
      <StudioErrorView
        status={403}
        signInHref={`${location.pathname}${location.search}` || "/studio"}
      />
    );
  }
  return <StudioErrorView status={routeStatus ?? 500} />;
}
