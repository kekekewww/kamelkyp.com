/**
 * Studio home (brief §26–27, admin-architecture §4.2): quick actions, then
 * a ledger of what needs attention (the one loud element), recent changes,
 * the content counts, the homepage as curated now and the commission queue.
 * Ruled lists and one table; no charts, no analytics, no card grid.
 */
import { Link } from "react-router";
import type {
  AttentionItem,
  StudioHomeModel,
} from "../../../lib/cms/repositories/studio-home.server";
import { SECTION_INFO } from "../homepage/sections-fields";
import { StudioPage } from "../shell/studio-page";
import { StatusBadge } from "../ui";
import { relativeTime } from "./format";

const QUICK_ACTIONS: ReadonlyArray<{
  label: string;
  to: string;
  external?: boolean;
  group: "create" | "site";
}> = [
  { label: "New Project", to: "/studio/projects/new", group: "create" },
  { label: "New Music Entry", to: "/studio/music/new", group: "create" },
  { label: "New Recognition", to: "/studio/recognition/new", group: "create" },
  { label: "New Writing", to: "/studio/writing/new", group: "create" },
  { label: "Upload Media", to: "/studio/media", group: "site" },
  { label: "Edit Homepage", to: "/studio/homepage", group: "site" },
  {
    label: "Preview Site",
    to: "/studio/preview/home?drafts=1",
    external: true,
    group: "site",
  },
];

const SEVERITY_WORD: Record<AttentionItem["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const KIND_WORD: Record<StudioHomeModel["recent"][number]["kind"], string> = {
  project: "Project",
  music: "Music",
  recognition: "Recognition",
  writing: "Writing",
  service: "Service",
  settings: "Settings",
  social: "Social link",
};

function QuickActions() {
  return (
    <nav className="studio-home__actions" aria-label="Quick actions">
      {(["create", "site"] as const).map((group) => (
        <ul className="studio-home__action-group" key={group}>
          {QUICK_ACTIONS.filter((action) => action.group === group).map(
            (action) => (
              <li key={action.to}>
                {action.external ? (
                  <a
                    className="studio-btn studio-btn--secondary studio-btn--compact"
                    href={action.to}
                    target="_blank"
                    rel="noopener"
                  >
                    {action.label}
                    <span className="visually-hidden"> (opens a new tab)</span>
                  </a>
                ) : (
                  <Link
                    className="studio-btn studio-btn--secondary studio-btn--compact"
                    to={action.to}
                  >
                    {action.label}
                  </Link>
                )}
              </li>
            ),
          )}
        </ul>
      ))}
    </nav>
  );
}

function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <section className="studio-home__block" aria-labelledby="home-attention">
      <h2 className="studio-home__heading" id="home-attention">
        Needs attention
        <span className="studio-home__count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="studio-home__calm">
          Nothing needs attention. Everything live is complete and reviewed.
        </p>
      ) : (
        <ol className="studio-attention">
          {items.map((item) => (
            <li
              className="studio-attention__row"
              data-severity={item.severity}
              key={item.key}
            >
              <span className="studio-attention__severity">
                <span className="studio-attention__marker" aria-hidden="true" />
                {SEVERITY_WORD[item.severity]}
              </span>
              <span className="studio-attention__text">
                <span className="studio-attention__title">{item.title}</span>
                {item.detail ? (
                  <span className="studio-attention__detail">
                    {item.detail}
                  </span>
                ) : null}
              </span>
              <Link className="studio-attention__action" to={item.href}>
                {item.action}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Recent({
  items,
  now,
}: {
  items: StudioHomeModel["recent"];
  now: string;
}) {
  return (
    <section className="studio-home__block" aria-labelledby="home-recent">
      <h2 className="studio-home__heading" id="home-recent">
        Recent changes
      </h2>
      {items.length === 0 ? (
        <p className="studio-home__calm">Nothing edited yet.</p>
      ) : (
        <ol className="studio-recent">
          {items.map((item) => (
            <li className="studio-recent__row" key={`${item.kind}:${item.id}`}>
              <span className="studio-recent__kind">
                {KIND_WORD[item.kind]}
              </span>
              <Link className="studio-recent__title" to={item.href}>
                {item.label}
              </Link>
              <span className="studio-recent__status">
                {item.status ? <StatusBadge status={item.status} /> : null}
              </span>
              <time className="studio-recent__time" dateTime={item.updatedAt}>
                {relativeTime(item.updatedAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CountCell({ value, href }: { value: number; href: string }) {
  return (
    <td className="studio-counts__cell">
      {value > 0 ? (
        <Link className="studio-counts__link" to={href}>
          {value}
        </Link>
      ) : (
        <span className="studio-counts__zero">0</span>
      )}
    </td>
  );
}

function Counts({ rows }: { rows: StudioHomeModel["counts"] }) {
  return (
    <section className="studio-home__block" aria-labelledby="home-content">
      <h2 className="studio-home__heading" id="home-content">
        Content
      </h2>
      <table className="studio-counts">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Published</th>
            <th scope="col">Draft</th>
            <th scope="col">Archived</th>
            <th scope="col">TODO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type}>
              <th scope="row">
                <Link className="studio-counts__type" to={row.href}>
                  {row.label}
                </Link>
              </th>
              <CountCell
                value={row.published}
                href={`${row.href}?status=published`}
              />
              <CountCell value={row.draft} href={`${row.href}?status=draft`} />
              <CountCell
                value={row.archived}
                href={`${row.href}?status=archived`}
              />
              <CountCell value={row.todo} href={`${row.href}?status=draft`} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Homepage({ summary }: { summary: StudioHomeModel["homepage"] }) {
  const counts = summary.featuredCounts;
  return (
    <section className="studio-home__block" aria-labelledby="home-homepage">
      <h2 className="studio-home__heading" id="home-homepage">
        Homepage
      </h2>
      <dl className="studio-home__facts">
        <div className="studio-home__fact">
          <dt>Showreel</dt>
          <dd>
            {summary.showreel ? (
              <>
                <Link to={`/studio/music/${summary.showreel.id}`}>
                  {summary.showreel.label}
                </Link>{" "}
                <StatusBadge status={summary.showreel.status} />
              </>
            ) : (
              <span className="studio-home__none">None selected</span>
            )}
          </dd>
        </div>
        <div className="studio-home__fact">
          <dt>Selected work</dt>
          <dd>
            {summary.featuredProjects.length === 0 ? (
              <span className="studio-home__none">No featured projects</span>
            ) : (
              <ol className="studio-home__order">
                {summary.featuredProjects.map((project, index) => (
                  <li
                    key={project.id}
                    data-hidden={
                      index >= summary.featuredProjectLimit ? "" : undefined
                    }
                  >
                    <Link to={`/studio/projects/${project.id}`}>
                      {project.label}
                    </Link>
                    {project.status !== "published" ? (
                      <span className="studio-home__note">not live</span>
                    ) : index >= summary.featuredProjectLimit ? (
                      <span className="studio-home__note">
                        over the limit of {summary.featuredProjectLimit}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </dd>
        </div>
        <div className="studio-home__fact">
          <dt>Also featured</dt>
          <dd>
            <ul className="studio-home__tally">
              <li>
                <span className="studio-home__figure">{counts.music}</span>{" "}
                music
              </li>
              <li>
                <span className="studio-home__figure">
                  {counts.recognition}
                </span>{" "}
                recognition
              </li>
              <li>
                <span className="studio-home__figure">{counts.writing}</span>{" "}
                writing
              </li>
              <li>
                <span className="studio-home__figure">{counts.service}</span>{" "}
                {counts.service === 1 ? "service" : "services"}
              </li>
            </ul>
          </dd>
        </div>
        {summary.sections.hidden.length > 0 ? (
          <div className="studio-home__fact">
            <dt>Hidden sections</dt>
            <dd>
              {summary.sections.hidden
                .map((key) => SECTION_INFO[key].label)
                .join(", ")}
            </dd>
          </div>
        ) : null}
      </dl>
      <Link className="studio-link" to="/studio/homepage">
        Edit homepage
      </Link>
    </section>
  );
}

function Commissions({ queue }: { queue: StudioHomeModel["commissions"] }) {
  const figures = [
    { label: "Pending review", value: queue.pendingReview },
    { label: "Awaiting deposit", value: queue.awaitingDeposit },
    { label: "In production", value: queue.inProduction },
  ];
  return (
    <section className="studio-home__block" aria-labelledby="home-commissions">
      <h2 className="studio-home__heading" id="home-commissions">
        Commissions
      </h2>
      <dl className="studio-home__queue">
        {figures.map((figure) => (
          <div className="studio-home__queue-item" key={figure.label}>
            <dt>{figure.label}</dt>
            <dd>{figure.value}</dd>
          </div>
        ))}
      </dl>
      <Link className="studio-link" to="/studio/commissions">
        Open commissions
      </Link>
    </section>
  );
}

export function StudioHome({ model }: { model: StudioHomeModel }) {
  return (
    <StudioPage title="Home">
      <QuickActions />
      <div className="studio-home">
        <div className="studio-home__main">
          <Attention items={model.attention} />
          <Recent items={model.recent} now={model.now} />
        </div>
        <div className="studio-home__side">
          <Counts rows={model.counts} />
          <Homepage summary={model.homepage} />
          <Commissions queue={model.commissions} />
        </div>
      </div>
    </StudioPage>
  );
}
