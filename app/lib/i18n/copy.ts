import type { Locale } from "./locale";

const COPY = {
  zh: {
    home: "主頁",
    mixing: "混音",
    transition: "歌曲銜接",
    works: "作品",
    other: "其他內容",
    commission: "開始委託",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    primaryNavigation: "主要導覽",
    expandMixing: "展開混音服務",
    collapseMixing: "收合混音服務",
    expandTransition: "展開歌曲銜接服務",
    collapseTransition: "收合歌曲銜接服務",
  },
  en: {
    home: "Home",
    mixing: "Mixing",
    transition: "Song Transition",
    works: "Works",
    other: "Other Work",
    commission: "Start a commission",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    primaryNavigation: "Primary navigation",
    expandMixing: "Expand mixing services",
    collapseMixing: "Collapse mixing services",
    expandTransition: "Expand song transition services",
    collapseTransition: "Collapse song transition services",
  },
} as const;

export function getSiteCopy(locale: Locale) {
  return COPY[locale];
}
