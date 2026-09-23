import type { WritingEntry } from "./schema";

/**
 * File-based writing entries (IA §6.3). Always external links; these four are
 * PLACEHOLDERS with `url: null` (rendered as "Link pending").
 */
export const WRITING: readonly WritingEntry[] = [
  {
    id: "w-001",
    kind: "article",
    date: "2026-09-01",
    title: {
      zh: "示意：為什麼我自己做工具",
      en: "Sample: Why I Build Tools Instead of Just Using Them",
    },
    source: "kamelkyp.com",
    url: null,
    placeholder: true,
  },
  {
    id: "w-002",
    kind: "thread",
    date: "2026-08-18",
    title: {
      zh: "示意：為舞蹈演出混人聲的筆記",
      en: "Sample: Notes on Mixing Vocals for Dance Performances",
    },
    source: "Threads",
    url: null,
    placeholder: true,
  },
  {
    id: "w-003",
    kind: "post",
    date: "2026-07-30",
    title: {
      zh: "示意：工作室片段",
      en: "Sample: Studio Session Snapshot",
    },
    source: "Instagram",
    url: null,
    placeholder: true,
  },
  {
    id: "w-004",
    kind: "article",
    date: "2026-06-12",
    title: {
      zh: "示意：在邊緣網路上做雙語網站",
      en: "Sample: Building a Bilingual Site on the Edge",
    },
    source: "kamelkyp.com",
    url: null,
    placeholder: true,
  },
];
