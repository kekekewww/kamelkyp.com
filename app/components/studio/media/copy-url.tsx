/**
 * "Copy URL" for an asset's public address (brief §18). Uses the Clipboard
 * API; when it is unavailable the address stays selectable in the field
 * next to it and the toast says so.
 */
import { useToast } from "../ui/toast";

export function CopyUrlButton({
  url,
  label = "Copy URL",
  compact = true,
}: {
  url: string;
  label?: string;
  compact?: boolean;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={`studio-btn studio-btn--ghost${compact ? " studio-btn--compact" : ""}`}
      data-copy={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.show({ message: "URL copied" });
        } catch {
          toast.show({
            tone: "error",
            message: "Copying is blocked here. Select the address and copy it.",
          });
        }
      }}
    >
      {label}
    </button>
  );
}
