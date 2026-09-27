import type { ReactNode } from "react";
import type { FormattedBlock } from "../../lib/cms/text-format";

/**
 * Case-study document parts (IA §4.3, design-system §6.19 document layout):
 * a contents list (sticky rail on xl+, a <details> below), and sections set
 * as running text in the document column. Nothing is boxed.
 */

export interface CaseStudyTocEntry {
  id: string;
  label: string;
}

export function CaseStudyToc({
  entries,
  label,
}: {
  entries: readonly CaseStudyTocEntry[];
  label: string;
}) {
  if (entries.length < 2) return null;
  const links = (
    <ol className="case-toc__list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <a className="case-toc__link" href={`#${entry.id}`}>
            {entry.label}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className="case-toc case-toc--rail" aria-label={label}>
        {links}
      </nav>
      <details className="case-toc case-toc--inline">
        <summary className="case-toc__summary">{label}</summary>
        <nav aria-label={label}>{links}</nav>
      </details>
    </>
  );
}

/** Formatted text (paragraphs and `- ` lists) from a Studio text field. */
export function FormattedText({
  blocks,
  listClassName = "case-section__items",
}: {
  blocks: readonly FormattedBlock[];
  listClassName?: string;
}) {
  return (
    <>
      {blocks.map((block, position) =>
        block.type === "paragraph" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
          <p key={position}>{block.text}</p>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
          <ul className={listClassName} key={position}>
            {block.items.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items may repeat
              <li key={index}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function CaseStudySection({
  id,
  heading,
  paragraphs = [],
  items,
  children,
}: {
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  children?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      className="case-section"
      id={id}
      aria-labelledby={headingId}
      data-reveal="up"
    >
      <h2 className="case-section__heading" id={headingId}>
        {heading}
      </h2>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {items && items.length > 0 ? (
        <ul className="case-section__items">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Track sheet for a project's published music (brief §15, design-system
 * §6.22): Track / Artist / Role / Year / Credits, with the existing
 * click-to-play player in the signal slot. A track without a playable source
 * shows the empty state (the flat line) and a plain "audio pending" note
 * instead of a control that cannot play. Empty rows are skipped.
 */
export function TrackSheet({
  label,
  rows,
  pending,
  player,
}: {
  label: string;
  rows: readonly { term: string; value: string }[];
  pending: string;
  player?: ReactNode;
}) {
  const present = rows.filter((row) => row.value.trim());
  return (
    <section className="track-sheet" aria-label={label}>
      <div className="track-sheet__signal">
        {player ?? (
          <>
            <span className="flat-line" aria-hidden="true" />
            <p className="track-sheet__pending">{pending}</p>
          </>
        )}
      </div>
      {present.length > 0 ? (
        <dl className="track-sheet__meta">
          {present.map((row) => (
            <div key={row.term}>
              <dt>{row.term}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
