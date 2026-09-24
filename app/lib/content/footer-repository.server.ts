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

/**
 * Footer structure from code (content-schema §6.1): site navigation, service
 * areas and legal pages, plus the labels of the editable groups. The public
 * footer (`getPublicSiteContext`) fills "Contact" from `brand.contactEmail`,
 * "Find me" from enabled social links and "Work & Resources" from D1 link
 * groups; this default is also the fallback when D1 cannot be read. It holds
 * no personal address and no repository link (seeded disabled in D1).
 */
export function getDefaultFooterGroups(locale: Locale): FooterGroup[] {
  const label = (zh: string, en: string) => (locale === "zh" ? zh : en);

  return [
    {
      id: "navigate",
      label: groupLabel("navigate", locale),
      links: [
        {
          id: "works",
          label: label("作品", "Work"),
          url: localePath(locale, "/works"),
        },
        {
          id: "services-overview",
          label: label("服務", "Services"),
          url: localePath(locale, "/services"),
        },
        {
          id: "about",
          label: label("關於", "About"),
          url: localePath(locale, "/about"),
        },
        {
          id: "writing",
          label: label("文章", "Writing"),
          url: localePath(locale, "/writing"),
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
          id: "software",
          label: label("軟體與互動", "Software & Interactive"),
          url: localePath(locale, "/services/software"),
        },
        {
          id: "commission",
          label: label("開始合作", "Start a project"),
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
      ],
    },
    {
      id: "contact",
      label: groupLabel("contact", locale),
      links: [],
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
