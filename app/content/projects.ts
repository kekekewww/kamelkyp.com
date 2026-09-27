import type { LocalizedText, Project } from "./schema";

/**
 * File-based projects (IA §6.1). All six are PLACEHOLDERS standing in for real
 * work: `placeholder: true`, `cover: null` (procedural cover), no links, no
 * credits, no numbers, clients or outcomes. Order here = file order used as a
 * tie-break by mergeWorks().
 */

const sample = (zh: string, en: string): LocalizedText => ({
  zh: `示意段落：${zh}`,
  en: `Sample paragraph: ${en}`,
});

export const PROJECTS: readonly Project[] = [
  {
    id: "p-001",
    slug: "sample-generative-audio-visual-tool",
    title: {
      zh: "示意：生成式影音工具",
      en: "Sample: Generative Audio-Visual Tool",
    },
    year: 2026,
    categories: ["ai", "software"],
    role: { zh: "設計與開發", en: "Design & development" },
    description: {
      zh: "示意內容：將音訊特徵轉為生成式畫面的工具。",
      en: "Placeholder for a tool that turns audio features into generative visuals.",
    },
    featured: true,
    services: [{ zh: "開發", en: "Development" }],
    technologies: ["TypeScript", "Web Audio API", "Canvas 2D"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "context",
        body: [
          sample(
            "這裡將說明專案背景。",
            "this will describe the project context.",
          ),
        ],
      },
      {
        kind: "approach",
        body: [
          sample(
            "這裡將說明從音訊特徵到畫面的對應方式。",
            "this will explain how audio features map to visuals.",
          ),
        ],
      },
      {
        kind: "system",
        body: [
          sample(
            "這裡將說明系統架構。",
            "this will outline the system architecture.",
          ),
        ],
        items: [
          { zh: "示意項目：音訊分析", en: "Sample item: audio analysis" },
          { zh: "示意項目：畫面生成", en: "Sample item: visual generation" },
        ],
      },
      {
        kind: "result",
        body: [sample("這裡將說明成果。", "this will describe the result.")],
      },
    ],
    placeholder: true,
  },
  {
    id: "p-002",
    slug: "sample-full-song-mix",
    title: {
      zh: "示意：完整歌曲混音——獨立單曲",
      en: "Sample: Full Song Mix — Indie Single",
    },
    year: 2025,
    categories: ["mixing", "music"],
    role: { zh: "混音與母帶", en: "Mixing & mastering" },
    description: {
      zh: "示意內容：一首獨立單曲的完整混音與母帶。",
      en: "Placeholder for a full mix and master of an independent single.",
    },
    featured: true,
    services: [
      { zh: "混音", en: "Mixing" },
      { zh: "母帶", en: "Mastering" },
    ],
    technologies: ["Pro Tools", "FabFilter"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "context",
        body: [
          sample(
            "這裡將說明歌曲與需求。",
            "this will describe the song and the brief.",
          ),
        ],
      },
      {
        kind: "process",
        body: [
          sample(
            "這裡將說明混音過程。",
            "this will walk through the mixing process.",
          ),
        ],
      },
      {
        kind: "result",
        body: [sample("這裡將說明成果。", "this will describe the result.")],
      },
    ],
    placeholder: true,
  },
  {
    id: "p-003",
    slug: "sample-interactive-projection-study",
    title: {
      zh: "示意：互動投影研究",
      en: "Sample: Interactive Projection Study",
    },
    year: 2025,
    categories: ["interactive"],
    role: { zh: "創意開發", en: "Creative development" },
    description: {
      zh: "示意內容：以肢體動作改變線條場的投影作品。",
      en: "Placeholder for a projection piece where movement shapes a line field.",
    },
    featured: true,
    services: [{ zh: "創意開發", en: "Creative development" }],
    technologies: ["TouchDesigner", "Depth camera"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "context",
        body: [
          sample("這裡將說明展演情境。", "this will describe the setting."),
        ],
      },
      {
        kind: "design",
        body: [
          sample(
            "這裡將說明動作與線條的互動設計。",
            "this will explain how movement shapes the lines.",
          ),
        ],
      },
      {
        kind: "reflection",
        body: [
          sample("這裡將記錄心得。", "this will record the lessons learned."),
        ],
      },
    ],
    placeholder: true,
  },
  {
    id: "p-004",
    slug: "sample-booking-management-system",
    title: {
      zh: "示意：預約管理系統",
      en: "Sample: Booking Management System",
    },
    year: 2024,
    categories: ["software"],
    role: { zh: "全端開發", en: "Full-stack development" },
    description: {
      zh: "示意內容：以網頁系統取代試算表的內部工具。",
      en: "Placeholder for an internal system that replaces spreadsheets with a web app.",
    },
    featured: false,
    services: [{ zh: "開發", en: "Development" }],
    technologies: ["React Router", "Cloudflare Workers", "D1"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "problem",
        body: [
          sample("這裡將說明要解決的問題。", "this will describe the problem."),
        ],
      },
      {
        kind: "system",
        body: [
          sample(
            "這裡將說明系統架構。",
            "this will outline the system architecture.",
          ),
        ],
      },
      {
        kind: "result",
        body: [sample("這裡將說明成果。", "this will describe the result.")],
      },
    ],
    placeholder: true,
  },
  {
    id: "p-005",
    slug: "sample-vocal-production-session",
    title: {
      zh: "示意：Vocal 製作紀錄",
      en: "Sample: Vocal Production Session",
    },
    year: 2024,
    categories: ["music"],
    role: { zh: "人聲製作", en: "Vocal production" },
    description: {
      zh: "示意內容：一次人聲錄製、編輯與修音的製作紀錄。",
      en: "Placeholder for a vocal recording, editing and tuning session.",
    },
    featured: false,
    services: [{ zh: "人聲製作", en: "Vocal production" }],
    technologies: ["Pro Tools", "Melodyne"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "context",
        body: [
          sample("這裡將說明錄音情境。", "this will describe the session."),
        ],
      },
      {
        kind: "process",
        body: [
          sample(
            "這裡將說明編輯與修音。",
            "this will explain editing and tuning.",
          ),
        ],
      },
    ],
    placeholder: true,
  },
  {
    id: "p-006",
    slug: "sample-realtime-audio-analysis-notes",
    title: {
      zh: "示意：即時音訊分析筆記",
      en: "Sample: Real-Time Audio Analysis Notes",
    },
    year: 2025,
    categories: ["research", "ai"],
    role: { zh: "研究", en: "Research" },
    description: {
      zh: "示意內容：關於瀏覽器即時頻譜分析的研究筆記。",
      en: "Placeholder for research notes on real-time spectral analysis in the browser.",
    },
    featured: true,
    services: [],
    technologies: ["Web Audio API", "TypeScript"],
    cover: null,
    media: [],
    links: [],
    credits: [],
    sections: [
      {
        kind: "context",
        body: [
          sample(
            "這裡將說明研究問題。",
            "this will describe the research question.",
          ),
        ],
      },
      {
        kind: "approach",
        body: [
          sample("這裡將說明研究方法。", "this will describe the method."),
        ],
      },
      {
        kind: "reflection",
        body: [
          sample("這裡將記錄心得。", "this will record the lessons learned."),
        ],
      },
    ],
    placeholder: true,
  },
];
