import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { MediaConsentGate } from "./media-consent-gate";

export function GoogleDrivePreview({
  item,
  embedUrl,
  locale,
}: {
  item: MediaItem;
  embedUrl: string;
  locale: Locale;
}) {
  return (
    <MediaConsentGate provider="Google Drive" locale={locale}>
      <iframe
        title={`Google Drive: ${item.title}`}
        src={embedUrl}
        allow="fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
    </MediaConsentGate>
  );
}
