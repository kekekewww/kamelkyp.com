/**
 * Studio error screen shared by the `/studio` ErrorBoundary. The 403 variant
 * is the "sign in again" prompt: it is shown for a real route 403 and for an
 * expired Access session (see `studioSessionExpired`).
 */
import { Link } from "react-router";

export function studioErrorCopy(status: number): {
  title: string;
  body: string;
} {
  if (status === 403) {
    return {
      title: "Sign in to open the Studio",
      body: "The Studio is protected by Cloudflare Access. Sign in with the owner account, then reload this page.",
    };
  }
  if (status === 404) {
    return {
      title: "This Studio page does not exist",
      body: "Check the address, or go back to the Studio home.",
    };
  }
  return {
    title: "Something went wrong",
    body: "Reload the page to try again. Unsaved edits are kept in this tab.",
  };
}

export function StudioErrorView({
  status,
  signInHref = "/studio",
}: {
  status: number;
  /** Where the sign-in link leads; a full-page load so Access can intercept. */
  signInHref?: string;
}) {
  const { title, body } = studioErrorCopy(status);
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
            <a className="studio-link" href={signInHref}>
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
