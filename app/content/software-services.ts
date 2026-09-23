import { CONTACT_EMAIL } from "../lib/i18n/copy";
import type { SoftwareServices } from "./schema";

/**
 * Software & Interactive offering (IA §4.6, §6.5). Never priced: every
 * engagement model shows 依專案報價 / Contact for quote.
 */
export const SOFTWARE_SERVICES: SoftwareServices = {
  offerings: [
    {
      id: "web",
      title: { zh: "網頁開發", en: "Web development" },
      description: {
        zh: "雙語網站、作品集與內容系統，從設計到上線。",
        en: "Bilingual sites, portfolios and content systems, from design to launch.",
      },
    },
    {
      id: "prototypes",
      title: { zh: "原型開發", en: "Prototypes" },
      description: {
        zh: "把想法快速做成可以操作、可以測試的版本。",
        en: "Turning an idea into something you can click through and test.",
      },
    },
    {
      id: "ai",
      title: { zh: "AI 整合", en: "AI integrations" },
      description: {
        zh: "把語言模型與其他模型接進既有流程或產品。",
        en: "Connecting language models and other models to existing workflows or products.",
      },
    },
    {
      id: "internal",
      title: { zh: "內部系統", en: "Internal systems" },
      description: {
        zh: "取代試算表與手動流程的管理工具。",
        en: "Management tools that replace spreadsheets and manual steps.",
      },
    },
    {
      id: "creative-tech",
      title: { zh: "創意科技", en: "Creative technology" },
      description: {
        zh: "結合聲音、畫面與程式的實驗與作品。",
        en: "Experiments and pieces that combine sound, image and code.",
      },
    },
    {
      id: "installations",
      title: { zh: "互動裝置", en: "Interactive installations" },
      description: {
        zh: "回應觀眾動作與聲音的展演與空間作品。",
        en: "Exhibition and space pieces that respond to movement and sound.",
      },
    },
    {
      id: "custom",
      title: { zh: "客製軟體", en: "Custom software" },
      description: {
        zh: "為特定需求打造、可以長期維護的軟體。",
        en: "Software built for a specific need and made to be maintained.",
      },
    },
  ],
  engagementModels: [
    {
      id: "project-based",
      label: "PROJECT BASED",
      title: { zh: "專案制", en: "Project based" },
      description: {
        zh: "範圍明確的案子，依需求與時程一次報價。",
        en: "Defined scope, quoted once against requirements and timeline.",
      },
      price: { zh: "依專案報價", en: "Contact for quote" },
    },
    {
      id: "custom-quote",
      label: "CUSTOM QUOTE",
      title: { zh: "客製報價", en: "Custom quote" },
      description: {
        zh: "範圍仍在探索的案子，先討論再估價。",
        en: "Scope still forming; we talk first, then estimate.",
      },
      price: { zh: "依專案報價", en: "Contact for quote" },
    },
  ],
  process: [
    { index: "01", title: { zh: "對話", en: "Conversation" } },
    { index: "02", title: { zh: "範圍與報價", en: "Scope & quote" } },
    { index: "03", title: { zh: "原型", en: "Prototype" } },
    { index: "04", title: { zh: "開發", en: "Build" } },
    { index: "05", title: { zh: "交付", en: "Handover" } },
  ],
  contact: {
    email: CONTACT_EMAIL,
    subject: {
      zh: "[軟體與互動] 專案洽詢",
      en: "[Software & Interactive] Project inquiry",
    },
    include: [
      { zh: "專案類型", en: "Project type" },
      { zh: "想解決的問題", en: "The problem to solve" },
      { zh: "期望時程", en: "Timeline" },
      { zh: "參考資料或連結", en: "References or links" },
      { zh: "預算範圍（可選）", en: "Budget range (optional)" },
    ],
  },
};
