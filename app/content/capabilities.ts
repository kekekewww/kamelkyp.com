import type { Capability } from "./schema";

/** The four capability groups (IA §6.4). Kamel's own description of practice. */
export const CAPABILITIES: readonly Capability[] = [
  {
    id: "software",
    index: "01",
    title: { zh: "軟體系統", en: "Software Systems" },
    description: {
      zh: "網站、內部工具與可維護的系統。",
      en: "Websites, internal tools and maintainable systems.",
    },
    items: [
      { zh: "網頁開發", en: "Web development" },
      { zh: "內部系統", en: "Internal systems" },
      { zh: "客製軟體", en: "Custom software" },
    ],
    categories: ["software"],
  },
  {
    id: "ai-creative",
    index: "02",
    title: { zh: "AI 與創意科技", en: "AI & Creative Technology" },
    description: {
      zh: "把模型與演算法變成可以使用的工具。",
      en: "Turning models and algorithms into usable tools.",
    },
    items: [
      { zh: "AI 整合", en: "AI integrations" },
      { zh: "生成式系統", en: "Generative systems" },
      { zh: "研究原型", en: "Research prototypes" },
    ],
    categories: ["ai", "research"],
  },
  {
    id: "interactive",
    index: "03",
    title: { zh: "互動體驗", en: "Interactive Experiences" },
    description: {
      zh: "回應人、聲音與空間的作品。",
      en: "Work that responds to people, sound and space.",
    },
    items: [
      { zh: "互動裝置", en: "Interactive installations" },
      { zh: "原型", en: "Prototypes" },
      { zh: "創意開發", en: "Creative development" },
    ],
    categories: ["interactive"],
  },
  {
    id: "sound",
    index: "04",
    title: { zh: "聲音", en: "Sound" },
    description: {
      zh: "混音、製作與歌曲銜接。",
      en: "Mixing, production and song transitions.",
    },
    items: [
      { zh: "混音與母帶", en: "Mixing & mastering" },
      { zh: "人聲製作", en: "Vocal production" },
      { zh: "歌曲銜接", en: "Song transitions" },
    ],
    categories: ["music", "mixing"],
  },
];
