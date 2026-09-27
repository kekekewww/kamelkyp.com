import { useR2Hosts } from "../../lib/cms/media/media-config-context";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { parseMediaUrl } from "../../lib/media/parse-media-url";
import { DirectAudioPreview } from "./direct-audio-preview";
import { ExternalMediaLink } from "./external-media-link";
import { GoogleDrivePreview } from "./google-drive-preview";
import { YouTubePreview } from "./youtube-preview";

/**
 * Stable props contract: `{ item, locale }`. `r2Hosts` is optional; by default
 * the approved R2 hosts come from `MediaConfigProvider` (never hard-coded).
 */
export function MediaPreview({
  item,
  locale,
  r2Hosts,
}: {
  item: MediaItem;
  locale: Locale;
  r2Hosts?: ReadonlySet<string>;
}) {
  const configuredHosts = useR2Hosts();
  const parsed = parseMediaUrl(item.url, {
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
    r2Hosts: r2Hosts ?? configuredHosts,
  });

  let preview: React.ReactNode;
  switch (parsed.kind) {
    case "youtube":
      preview = (
        <YouTubePreview
          item={item}
          embedUrl={String(parsed.embedUrl)}
          locale={locale}
        />
      );
      break;
    case "google_drive":
      preview = (
        <GoogleDrivePreview
          item={item}
          embedUrl={String(parsed.embedUrl)}
          locale={locale}
        />
      );
      break;
    case "direct_audio":
    case "github_raw_audio":
    case "cloudflare_r2_audio":
      preview = <DirectAudioPreview item={item} locale={locale} />;
      break;
    case "external_link":
      preview = <ExternalMediaLink url={parsed.canonicalUrl} locale={locale} />;
      break;
  }

  return (
    <section className="media-preview" aria-label={item.title}>
      <h3>{item.title}</h3>
      {preview}
    </section>
  );
}
