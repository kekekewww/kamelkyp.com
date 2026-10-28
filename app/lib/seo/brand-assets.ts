/**
 * Static brand assets in `public/` (WP4 §4.10), generated once by
 * `scripts/generate-brand-assets.mjs` and committed. The asset layer serves
 * them without invoking the Worker; head tags make them absolute with the
 * deployment origin.
 */
export const DEFAULT_OG_IMAGE = {
  path: "/og/kamel-default.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: {
    zh: "Kamel 字標，深色背景上一條直線向右轉為聲波。",
    en: "The Kamel wordmark on a dark background, above a line that turns into a waveform.",
  },
} as const;

export const SITE_ICON_PATHS = {
  icon32: "/icons/icon-32.png",
  appleTouch: "/apple-touch-icon.png",
  manifest: "/manifest.webmanifest",
} as const;
