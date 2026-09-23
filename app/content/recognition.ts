import type { Recognition } from "./schema";

/** Recognition (IA §6.2). All PLACEHOLDERS: no real event names or results. */
export const RECOGNITION: readonly Recognition[] = [
  {
    id: "r-001",
    year: 2026,
    event: { zh: "示意：黑客松參賽", en: "Sample: Hackathon Entry" },
    result: {
      zh: "示意結果——開發工具組",
      en: "Placeholder result — developer tools track",
    },
    category: "software",
    url: null,
    placeholder: true,
  },
  {
    id: "r-002",
    year: 2025,
    event: {
      zh: "示意：音樂製作比賽",
      en: "Sample: Music Production Competition",
    },
    result: { zh: "示意結果", en: "Placeholder result" },
    category: "music",
    url: null,
    placeholder: true,
  },
  {
    id: "r-003",
    year: 2024,
    event: {
      zh: "示意：創意科技展演",
      en: "Sample: Creative Technology Showcase",
    },
    result: {
      zh: "示意結果——展出作品",
      en: "Placeholder result — exhibited work",
    },
    category: "interactive",
    url: null,
    placeholder: true,
  },
];
