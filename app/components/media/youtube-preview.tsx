import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { MediaConsentGate } from "./media-consent-gate";

export function YouTubePreview({
  item,
  embedUrl,
  locale,
}: {
  item: MediaItem;
  embedUrl: string;
  locale: Locale;
}) {
  return (
    <MediaConsentGate provider="YouTube" locale={locale}>
      <iframe
        title={`YouTube: ${item.title}`}
        src={embedUrl}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </MediaConsentGate>
  );
}
