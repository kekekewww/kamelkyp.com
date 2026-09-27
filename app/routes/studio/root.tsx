/**
 * `/studio` root (admin-architecture §2.1, §3.1). The owner middleware runs
 * before every Studio page and preview loader; the loader hands the client
 * its session (CSRF token), media config and sidebar counts. Studio styles
 * load only here, never on public pages.
 */
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
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
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const title =
    status === 403
      ? "Sign in to open the Studio"
      : status === 404
        ? "This Studio page does not exist"
        : "Something went wrong";
  const body =
    status === 403
      ? "The Studio is protected by Cloudflare Access. Sign in with the owner account, then reload this page."
      : status === 404
        ? "Check the address, or go back to the Studio home."
        : "Reload the page to try again. Unsaved edits are kept in this tab.";
  return (
    <div className="studio">
      <title>{`${status} — KAMEL STUDIO`}</title>
      <meta name="robots" content="noindex,nofollow" />
      <main className="studio-page studio-page--narrow" id="studio-main">
        <section className="studio-stub">
          <span className="studio-stub__trace" aria-hidden="true" />
          <p className="studio-section-label">{status} / KAMEL STUDIO</p>
          <h1 className="studio-stub__title">{title}</h1>
          <p className="studio-stub__body">{body}</p>
          {status === 403 ? (
            <a className="studio-link" href="/studio">
              Sign in again
            </a>
          ) : (
            <Link className="studio-link" to="/studio">
              Back to Studio home
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
