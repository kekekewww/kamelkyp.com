import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

export interface LegalTocEntry {
  id: string;
  label: string;
}

/** Fragment-safe id for a clause/document heading. */
export function legalAnchorId(...parts: string[]): string {
  return parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** `2026-09-01…` → `2026.09.01` (design-system §6.19 metadata date). */
export function formatLegalDate(value: string): string {
  return value.slice(0, 10).replaceAll("-", ".");
}

/** Latest effective date across the published documents, or null. */
export function latestEffectiveDate(values: string[]): string | null {
  return values.length ? ([...values].sort().at(-1) ?? null) : null;
}

/**
 * Table of contents for a legal document (design-system §6.19).
 * xl+: sticky rail list with the section in view marked `aria-current`.
 * < xl: a collapsed <details> above the document.
 */
export function LegalToc({
  locale,
  entries,
}: {
  locale: Locale;
  entries: LegalTocEntry[];
}) {
  const [activeId, setActiveId] = useState<string | undefined>(entries[0]?.id);
  const title = locale === "zh" ? "目錄" : "Contents";
  const idKey = entries.map((entry) => entry.id).join(" ");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !idKey) return;
    const targets = idKey
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((item) => item.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [idKey]);

  if (entries.length < 2) return null;

  const list = (
    <ol className="legal-toc__list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            className="legal-toc__link"
            href={`#${entry.id}`}
            aria-current={activeId === entry.id ? "location" : undefined}
          >
            {entry.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav className="legal-toc" aria-label={title}>
      <details className="legal-toc__disclosure">
        <summary>{title}</summary>
        {list}
      </details>
      <div className="legal-toc__rail">
        <p className="legal-toc__title">{title}</p>
        {list}
      </div>
    </nav>
  );
}

/** Closing text link (not a band) to the project entry (IA §4.11). */
export function LegalClosing({ locale }: { locale: Locale }) {
  return (
    <div className="grid legal-doc__closing">
      <p>
        <Link className="text-link" to={localePath(locale, "/commission")}>
          {getSiteCopy(locale).cta}
          <span className="text-link__arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </p>
    </div>
  );
}
