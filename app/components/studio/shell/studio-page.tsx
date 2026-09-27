/**
 * One Studio page: sticky top bar (breadcrumb/title, status slot, actions
 * slot) and the page body. Sets `<title>` as "<Page> — KAMEL STUDIO".
 */

export function StudioPage({
  title,
  breadcrumb,
  status,
  actions,
  width = "wide",
  children,
}: {
  title: string;
  /** e.g. "Projects" when the title is an entry name. */
  breadcrumb?: React.ReactNode;
  /** Save state, status badge. */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** `wide` for lists and editors, `narrow` for settings forms. */
  width?: "wide" | "narrow";
  children: React.ReactNode;
}) {
  return (
    <>
      <title>{`${title} — KAMEL STUDIO`}</title>
      <header className="studio-topbar">
        <div className="studio-topbar__title">
          {breadcrumb ? (
            <span className="studio-topbar__crumb">
              {breadcrumb}
              <span aria-hidden="true"> / </span>
            </span>
          ) : null}
          <h1 className="studio-topbar__heading">{title}</h1>
        </div>
        {status ? <div className="studio-topbar__status">{status}</div> : null}
        {actions ? (
          <div className="studio-topbar__actions">{actions}</div>
        ) : null}
      </header>
      <div className={`studio-page studio-page--${width}`}>{children}</div>
    </>
  );
}
