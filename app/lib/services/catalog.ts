import type { ServiceId } from "./service-id";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  category: "mixing" | "song_transition";
  slug: string;
  name: LocalizedText;
  shortDescription: LocalizedText;
  basePriceTwd: number;
  standardDays: LocalizedText;
  deliverables: readonly LocalizedText[];
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  {
    id: "full_mix",
    category: "mixing",
    slug: "full",
    name: { zh: "完整歌曲混音", en: "Full Song Mixing" },
    shortDescription: {
      zh: "包含人聲、各式樂器、完整混音與母帶。",
      en: "Full vocal, instrument, mix and master production.",
    },
    basePriceTwd: 8000,
    standardDays: { zh: "7–14 個工作日", en: "7–14 business days" },
    deliverables: [
      {
        zh: "24-bit / 48 kHz WAV Final Master",
        en: "24-bit / 48 kHz WAV Final Master",
      },
      { zh: "Vocal Stem", en: "Vocal Stem" },
      { zh: "Instrumental Mix Stem", en: "Instrumental Mix Stem" },
    ],
  },
  {
    id: "vocal_mix",
    category: "mixing",
    slug: "vocal",
    name: { zh: "Vocal 混音", en: "Vocal Mixing" },
    shortDescription: {
      zh: "人聲、和音、修音、對拍、效果與母帶。",
      en: "Vocals, harmonies, tuning, timing, effects and mastering.",
    },
    basePriceTwd: 4000,
    standardDays: { zh: "5–7 個工作日", en: "5–7 business days" },
    deliverables: [
      {
        zh: "24-bit / 48 kHz WAV Final Master",
        en: "24-bit / 48 kHz WAV Final Master",
      },
      { zh: "Vocal Stem", en: "Vocal Stem" },
      { zh: "Instrumental Mix Stem", en: "Instrumental Mix Stem" },
    ],
  },
  {
    id: "simple_transition",
    category: "song_transition",
    slug: "simple",
    name: { zh: "單純歌曲銜接", en: "Simple Song Transition" },
    shortDescription: {
      zh: "1–5 首基本銜接，不包含歌曲結構編輯。",
      en: "Basic transitions for 1–5 songs without structural editing.",
    },
    basePriceTwd: 1000,
    standardDays: { zh: "3–5 個工作日", en: "3–5 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV", en: "24-bit / 48 kHz WAV" },
      { zh: "MP3 與 AAC", en: "MP3 and AAC" },
    ],
  },
  {
    id: "edit_transition",
    category: "song_transition",
    slug: "edit",
    name: { zh: "編輯／剪輯歌曲銜接", en: "Edited Song Transition" },
    shortDescription: {
      zh: "包含刪減、重排、速度／音高、音效、平衡與重新母帶。",
      en: "Cuts, restructuring, tempo or pitch, effects, balance and remastering.",
    },
    basePriceTwd: 4000,
    standardDays: { zh: "7–14 個工作日", en: "7–14 business days" },
    deliverables: [
      { zh: "24-bit / 48 kHz WAV", en: "24-bit / 48 kHz WAV" },
      { zh: "MP3 與 AAC", en: "MP3 and AAC" },
    ],
  },
] as const;

export function getCategoryServices(
  category: ServiceDefinition["category"],
): readonly ServiceDefinition[] {
  return SERVICE_CATALOG.filter((service) => service.category === category);
}

export function getService(id: ServiceId): ServiceDefinition {
  const service = SERVICE_CATALOG.find((item) => item.id === id);
  if (!service) throw new Error("service_not_found");
  return service;
}
