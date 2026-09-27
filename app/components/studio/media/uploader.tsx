/**
 * Upload tab of the media picker.
 *
 * STUB owned by the foundation and handed to P2 (uploads): P2 replaces the
 * body with the streamed R2 upload (declare → PUT with `<progress>`,
 * client-side metadata, preview). The props contract stays:
 * `{ kind, onUploaded(summary) }`. Until then it explains the state and
 * points to "Register URL", which always works.
 */
import { useMediaConfig } from "../../../lib/cms/media/media-config-context";
import type { MediaSummary } from "../../../lib/cms/media/summary";
import type { MediaKind } from "../../../lib/cms/schemas/media-asset";

export interface MediaUploaderProps {
  kind?: MediaKind;
  onUploaded: (asset: MediaSummary) => void;
}

export function MediaUploader(_props: MediaUploaderProps) {
  const config = useMediaConfig();
  return (
    <div className="studio-uploader studio-uploader--off">
      <p className="studio-uploader__title">
        {config.uploadsEnabled
          ? "Uploading files is not available yet."
          : "Uploads are off: no media bucket is configured for this site."}
      </p>
      <p className="studio-hint">
        Use Register URL to add media hosted elsewhere (YouTube, Google Drive,
        GitHub, or any https:// file).
      </p>
    </div>
  );
}
