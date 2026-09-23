import type { Locale } from "./locale";

/**
 * Shell and shared strings (docs/information-architecture.md §2.2, §3.2, §7.1).
 * Page-specific copy lives with each page (or its content file), authored in
 * both locales; nothing here is machine-translated.
 */
const COPY = {
  zh: {
    skipToContent: "跳至主要內容",
    brandLabel: "Kamel 主頁",
    work: "作品",
    services: "服務",
    about: "關於",
    writing: "文章",
    cta: "開始合作",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    primaryNavigation: "主要導覽",
    footerNavigation: "頁尾連結",
    footerLead: "混音、歌曲銜接、軟體與互動專案——先說說你想做的東西。",
    footerSoftware: "軟體與互動",
    footerCta: "開始合作",
    footerBase: "臺灣 / 遠端合作",
    breadcrumbServices: "服務",
    badgePlaceholder: "PLACEHOLDER",
    noticePlaceholder: "此為示意內容，將由實際作品取代。",
    ctaBandDefault: "有想做的作品嗎？",
    ctaBandProject: "想做類似的東西？",
    ctaBandWork: "沒看到類似的案子？直接聊聊。",
    metaTitleHome: "Kamel — 聲音、軟體與互動創作",
    metaDescription: "Kamel 的作品與服務：混音、歌曲銜接、軟體開發與互動體驗。",
    backHome: "返回主頁",
    viewWork: "查看作品",
    error404Title: "找不到這個頁面",
    error404Body: "這個網址可能已經移動或不存在。",
    errorGenericTitle: "目前無法顯示這個頁面",
    errorGenericBody: "請稍後再試，或返回主頁。",
  },
  en: {
    skipToContent: "Skip to main content",
    brandLabel: "Kamel home",
    work: "Work",
    services: "Services",
    about: "About",
    writing: "Writing",
    cta: "Start a project",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    primaryNavigation: "Primary navigation",
    footerNavigation: "Footer links",
    footerLead:
      "Mixing, song transitions, software and interactive work — tell me what you want to make.",
    footerSoftware: "Software & Interactive",
    footerCta: "Start a project",
    footerBase: "Taiwan / Remote",
    breadcrumbServices: "Services",
    badgePlaceholder: "PLACEHOLDER",
    noticePlaceholder: "Sample content — to be replaced with real work.",
    ctaBandDefault: "Have a project in mind?",
    ctaBandProject: "Want something like this?",
    ctaBandWork: "Don't see something similar? Let's talk.",
    metaTitleHome: "Kamel — Sound, Software & Interactive Work",
    metaDescription:
      "Kamel's work and services: mixing, song transitions, software development and interactive experiences.",
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

export const CONTACT_EMAIL = "kevinyaungputra@gmail.com";
