import type { ReactNode } from "react";
import {
  type CategoryFilter,
  categoryLabel,
  type ProjectCategory,
  type ProjectSectionKind,
} from "../../content";
import type { Locale } from "../../lib/i18n/locale";

/** Work copy (IA §7.3). zh and en are authored separately. */
const WORK_COPY = {
  zh: {
    h1: "作品",
    intro: "軟體、AI、互動、音樂與混音——同一套方法，不同的媒材。",
    filterLabel: "作品分類",
    count: (n: number) => `共 ${n} 件作品`,
    emptyTitle: "此分類尚無作品",
    emptyBody: "可以先看看其他分類，或直接聊聊你的案子。",
    emptyLink: "查看全部作品",
    back: "返回作品",
    viewProject: "查看作品",
    untitled: "未命名作品",
    metaTitle: "作品 — Kamel",
    metaDescription: "Kamel 的作品：軟體、AI、互動、音樂與混音。",
    meta: {
      year: "年份",
      category: "類別",
      role: "角色",
      tech: "技術與工具",
      services: "服務",
    },
    section: {
      context: "背景",
      problem: "問題",
      approach: "方法",
      process: "過程",
      system: "系統與架構",
      design: "設計",
      result: "成果",
      media: "媒體",
      reflection: "心得",
    } satisfies Record<ProjectSectionKind | "media", string>,
    links: "連結",
    credits: "參與人員",
    next: "下一個作品",
    contents: "目錄",
    track: {
      label: "音訊",
      track: "曲目",
      artist: "藝人",
      role: "角色",
      year: "年份",
      credits: "製作名單",
      pending: "音訊待補",
    },
  },
  en: {
    h1: "Work",
    intro:
      "Software, AI, interaction, music and mixing — one way of working, different materials.",
    filterLabel: "Work categories",
    count: (n: number) => (n === 1 ? "1 project" : `${n} projects`),
    emptyTitle: "Nothing in this category yet",
    emptyBody: "Try another category, or tell me about your project.",
    emptyLink: "View all work",
    back: "Back to work",
    viewProject: "View project",
    untitled: "Untitled",
    metaTitle: "Work — Kamel",
    metaDescription:
      "Kamel's work: software, AI, interaction, music and mixing.",
    meta: {
      year: "Year",
      category: "Category",
      role: "Role",
      tech: "Technology & tools",
      services: "Services",
    },
    section: {
      context: "Context",
      problem: "Problem",
      approach: "Approach",
      process: "Process",
      system: "System & architecture",
      design: "Design",
      result: "Result",
      media: "Media",
      reflection: "Lessons & reflection",
    } satisfies Record<ProjectSectionKind | "media", string>,
    links: "Links",
    credits: "Credits",
    next: "Next project",
    contents: "Contents",
    track: {
      label: "Audio",
      track: "Track",
      artist: "Artist",
      role: "Role",
      year: "Year",
      credits: "Credits",
      pending: "Audio pending",
    },
  },
} as const;

export function getWorkCopy(locale: Locale) {
  return WORK_COPY[locale];
}

/** `3` → `03` (metadata indexes are zero-padded to two digits). */
export function formatIndex(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Metadata row (design-system §6.6): `01 / TITLE / AI / SOFTWARE / 2026`.
 * Separators are drawn by CSS (`.meta-row > * + *::before`) so they travel
 * with the next segment when the row wraps.
 */
export function MetaRow({
  index,
  title,
  categories = [],
  year,
  locale,
  className,
  leading,
}: {
  index?: number;
  title?: string;
  categories?: readonly CategoryFilter[];
  year?: number | null;
  locale: Locale;
  className?: string;
  /** Extra Latin-code segments placed first, e.g. `WORK`. */
  leading?: readonly string[];
}) {
  const parts: ReactNode[] = [];
  for (const code of leading ?? []) {
    parts.push(<span key={`lead-${code}`}>{code}</span>);
  }
  if (index !== undefined) {
    parts.push(<span key="index">{formatIndex(index)}</span>);
  }
  if (title) {
    parts.push(
      <span key="title" className="meta-row__title">
        {title}
      </span>,
    );
  }
  for (const category of categories) {
    parts.push(
      <span key={category} data-localized>
        {categoryLabel(category, locale)}
      </span>,
    );
  }
  if (year) parts.push(<span key="year">{year}</span>);

  return (
    <p className={["meta-row", className].filter(Boolean).join(" ")}>{parts}</p>
  );
}

/** Localized category labels joined for running text (`AI / Software`). */
export function categoryText(
  categories: readonly ProjectCategory[],
  locale: Locale,
): string {
  return categories.map((value) => categoryLabel(value, locale)).join(" / ");
}

export interface ProjectFact {
  term: string;
  value: ReactNode;
}

/**
 * Metadata grid on the project detail page (IA §4.3 item 3): a <dl> of
 * year / category / role / technology / services. Empty values are skipped.
 */
export function ProjectFacts({
  facts,
  className,
}: {
  facts: readonly ProjectFact[];
  className?: string;
}) {
  const present = facts.filter(
    (fact) => fact.value !== null && fact.value !== "",
  );
  if (present.length === 0) return null;
  return (
    <dl
      className={["project-facts", className].filter(Boolean).join(" ")}
      data-reveal-group
    >
      {present.map((fact) => (
        <div className="project-facts__item" key={fact.term} data-reveal-item>
          <dt>{fact.term}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
