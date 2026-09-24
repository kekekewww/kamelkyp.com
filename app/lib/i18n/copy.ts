import type { Locale } from "./locale";

/**
 * Shell and shared UI strings (docs/information-architecture.md §2.2, §3.2,
 * §7.1): navigation, buttons, labels and error copy, authored in both
 * locales; nothing here is machine-translated. Site identity and editorial
 * copy (titles, descriptions, footer message, location line, contact-band
 * lines, contact email) live in brand and site settings (Content Studio).
 */
const COPY = {
  zh: {
    skipToContent: "跳至主要內容",
    home: "主頁",
    work: "作品",
    services: "服務",
    about: "關於",
    writing: "文章",
    cta: "開始合作",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    primaryNavigation: "主要導覽",
    footerNavigation: "頁尾連結",
    breadcrumbServices: "服務",
    badgePlaceholder: "PLACEHOLDER",
    noticePlaceholder: "此為示意內容，將由實際作品取代。",
    backHome: "返回主頁",
    viewWork: "查看作品",
    error404Title: "找不到這個頁面",
    error404Body: "這個網址可能已經移動或不存在。",
    errorGenericTitle: "目前無法顯示這個頁面",
    errorGenericBody: "請稍後再試，或返回主頁。",
  },
  en: {
    skipToContent: "Skip to main content",
    home: "home",
    work: "Work",
    services: "Services",
    about: "About",
    writing: "Writing",
    cta: "Start a project",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    primaryNavigation: "Primary navigation",
    footerNavigation: "Footer links",
    breadcrumbServices: "Services",
    badgePlaceholder: "PLACEHOLDER",
    noticePlaceholder: "Sample content — to be replaced with real work.",
    backHome: "Back to home",
    viewWork: "View work",
    error404Title: "Page not found",
    error404Body: "This address may have moved or never existed.",
    errorGenericTitle: "Something went wrong",
    errorGenericBody: "Please try again later or return to the home page.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type SiteCopy = (typeof COPY)[Locale];

export function getSiteCopy(locale: Locale): SiteCopy {
  return COPY[locale];
}

/** Accessible name of the header wordmark link: "Kamel 主頁" / "Kamel home". */
export function brandHomeLabel(locale: Locale, brandName: string): string {
  return `${brandName} ${COPY[locale].home}`;
}
