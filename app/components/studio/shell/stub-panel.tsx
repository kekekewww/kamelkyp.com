/**
 * Placeholder for Studio screens that are registered but not built yet.
 * Each points to the legacy admin screen that still does the job.
 */
import { StudioPage } from "./studio-page";

export function StubPanel({
  title,
  legacyHref,
  legacyLabel = "Open the legacy admin",
  description,
}: {
  title: string;
  legacyHref?: string;
  legacyLabel?: string;
  description?: string;
}) {
  return (
    <StudioPage title={title}>
      <section className="studio-stub" aria-labelledby="studio-stub-title">
        <span className="studio-stub__trace" aria-hidden="true" />
        <h2 className="studio-stub__title" id="studio-stub-title">
          Not built yet
        </h2>
        <p className="studio-stub__body">
          {description ??
            `${title} is part of the Studio but this screen is still being built.`}{" "}
          {legacyHref
            ? "Until it lands, the legacy admin keeps working."
            : "Nothing is lost: the content is already in the Studio database."}
        </p>
        {legacyHref ? (
          <a className="studio-link" href={legacyHref}>
            {legacyLabel}
          </a>
        ) : null}
      </section>
    </StudioPage>
  );
}

/** Stub for `/studio/preview/*` (rendered without the Studio chrome). */
export function PreviewStub({ title }: { title: string }) {
  return (
    <div className="studio">
      <title>{`Preview: ${title} — KAMEL STUDIO`}</title>
      <main className="studio-page studio-page--narrow" id="main-content">
        <section className="studio-stub">
          <span className="studio-stub__trace" aria-hidden="true" />
          <p className="studio-section-label">Preview · not published</p>
          <h1 className="studio-stub__title">Preview is not built yet</h1>
          <p className="studio-stub__body">
            {title} previews will render the real public page here, from the
            working copy, before anything is published.
          </p>
          <a className="studio-link" href="/studio">
            Back to the Studio
          </a>
        </section>
      </main>
    </div>
  );
}
