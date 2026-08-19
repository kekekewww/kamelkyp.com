import type { Locale } from "../i18n/locale";
import { localePath } from "../i18n/path";

export interface FooterLink {
  id: string;
  label: string;
  url: string;
}

export interface FooterGroup {
  id: string;
  label: string;
  links: FooterLink[];
}

interface FooterRow {
  group_id: string;
  stable_key: string;
  link_id: string;
  label: string;
  url: string;
}

const GROUP_LABELS: Record<string, Record<Locale, string>> = {
  navigate: { zh: "導覽", en: "Navigate" },
  services: { zh: "服務", en: "Services" },
  find_me: { zh: "社群", en: "Find Me" },
  work_resources: { zh: "作品與資源", en: "Work & Resources" },
  contact: { zh: "聯絡", en: "Contact" },
  legal: { zh: "條款與網站", en: "Legal" },
};

function groupLabel(stableKey: string, locale: Locale): string {
  return GROUP_LABELS[stableKey]?.[locale] ?? stableKey.replaceAll("_", " ");
}

function isSafeFooterUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;

  try {
    return ["https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function getDefaultFooterGroups(locale: Locale): FooterGroup[] {
  const label = (zh: string, en: string) => (locale === "zh" ? zh : en);

  return [
    {
      id: "navigate",
      label: groupLabel("navigate", locale),
      links: [
        { id: "home", label: label("主頁", "Home"), url: localePath(locale) },
        {
          id: "works",
          label: label("作品", "Works"),
          url: localePath(locale, "/works"),
        },
        {
          id: "other",
          label: label("其他內容", "Other Work"),
          url: localePath(locale, "/other"),
        },
      ],
    },
    {
      id: "services",
      label: groupLabel("services", locale),
      links: [
        {
          id: "mixing",
          label: label("混音", "Mixing"),
          url: localePath(locale, "/mixing"),
        },
        {
          id: "transition",
          label: label("歌曲銜接", "Song Transition"),
          url: localePath(locale, "/song-transition"),
        },
        {
          id: "commission",
          label: label("開始委託", "Start a commission"),
          url: localePath(locale, "/commission"),
        },
      ],
    },
    {
      id: "work_resources",
      label: groupLabel("work_resources", locale),
      links: [
        {
          id: "github-profile",
          label: "GitHub",
          url: "https://github.com/kekekewww",
        },
        {
          id: "site-repository",
          label: label("網站專案", "Website repository"),
          url: "https://github.com/kekekewww/kamelkyp.com",
        },
      ],
    },
    {
      id: "contact",
      label: groupLabel("contact", locale),
      links: [
        {
          id: "email",
          label: "kevinyaungputra@gmail.com",
          url: "mailto:kevinyaungputra@gmail.com",
        },
      ],
    },
    {
      id: "legal",
      label: groupLabel("legal", locale),
      links: [
        {
          id: "terms",
          label: label("服務條款", "Terms"),
          url: localePath(locale, "/terms"),
        },
        {
          id: "privacy",
          label: label("隱私說明", "Privacy"),
          url: localePath(locale, "/privacy"),
        },
      ],
    },
  ];
}

export async function listFooterGroups(
  db: D1Database,
  locale: Locale,
): Promise<FooterGroup[]> {
  const result = await db
    .prepare(
      `SELECT
        g.id AS group_id,
        g.stable_key,
        l.id AS link_id,
        l.label,
        l.url
      FROM link_groups g
      JOIN links l ON l.group_id = g.id
      WHERE g.enabled = 1 AND l.enabled = 1 AND l.locale = ?
      ORDER BY g.sort_order, l.sort_order`,
    )
    .bind(locale)
    .all<FooterRow>();

  const groups = new Map<string, FooterGroup>();
  for (const row of result.results) {
    if (!isSafeFooterUrl(row.url)) continue;

    const group = groups.get(row.group_id) ?? {
      id: row.group_id,
      label: groupLabel(row.stable_key, locale),
      links: [],
    };
    group.links.push({ id: row.link_id, label: row.label, url: row.url });
    groups.set(row.group_id, group);
  }

  return groups.size > 0
    ? [...groups.values()]
    : getDefaultFooterGroups(locale);
}
