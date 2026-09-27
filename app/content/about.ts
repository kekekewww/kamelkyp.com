import type { AboutContent } from "./schema";

/**
 * About copy (IA §4.7, §6.6). Not an autobiography: no real name, and no
 * heading contains "Kamel" (the landing-page identity tests depend on it).
 */
export const ABOUT: AboutContent = {
  lede: {
    zh: "我做系統，也做聲音。兩者對我來說是同一件事：把複雜的東西整理成可以被感受的結構。",
    en: "I build systems and I make sound. To me they are the same job: turning complexity into structure you can feel.",
  },
  teaser: {
    heading: { zh: "關於", en: "About" },
    body: {
      zh: "寫程式和混音用的是同一套耳朵：聽出哪裡多了、哪裡不穩，然後把它整理乾淨。",
      en: "Writing code and mixing use the same ears: hear what is extra or unstable, then make it clean.",
    },
  },
  sections: [
    {
      id: "what",
      heading: { zh: "我做的東西", en: "What I make" },
      body: [
        {
          zh: "軟體系統、AI 與創意科技、互動體驗，以及混音與歌曲銜接。形式不同，方法一樣。",
          en: "Software systems, AI and creative technology, interactive experiences, and mixing and song transitions. Different forms, one method.",
        },
      ],
    },
    {
      id: "think",
      heading: { zh: "我怎麼思考", en: "How I think" },
      body: [
        {
          zh: "先看整個系統，再決定細節。一個功能、一軌人聲，都要放回整體裡才知道該怎麼處理。",
          en: "I look at the whole system before the details. A feature or a vocal track only makes sense once it sits in the whole.",
        },
        {
          zh: "精準比花俏重要。能被量測、能被重現的決定，才能被信任。",
          en: "Precision matters more than flourish. Decisions that can be measured and repeated are the ones you can trust.",
        },
        {
          zh: "做一版、聽一次、改一次。迭代是方法，不是補救。",
          en: "Make a version, listen, revise. Iteration is the method, not the fix.",
        },
      ],
    },
    {
      id: "connect",
      heading: { zh: "軟體與聲音", en: "Software and sound" },
      body: [
        {
          zh: "混音教會我分層與取捨；寫程式教會我結構與可維護。兩邊互相校正，讓作品既好用也好聽。",
          en: "Mixing taught me layering and trade-offs; software taught me structure and maintainability. Each keeps the other honest, so the work both functions and sounds right.",
        },
      ],
    },
    {
      id: "work",
      heading: { zh: "工作方式", en: "How I work" },
      body: [],
      items: [
        {
          zh: "先把需求說清楚，再開始做。",
          en: "Get the brief clear before starting.",
        },
        {
          zh: "早點給看得到、聽得到的版本。",
          en: "Share something you can see or hear early.",
        },
        {
          zh: "每個決定都說得出理由。",
          en: "Every decision has a reason I can explain.",
        },
        {
          zh: "交付之後，東西要能被維護。",
          en: "What I hand over can be maintained.",
        },
      ],
    },
  ],
};
