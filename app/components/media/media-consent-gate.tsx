import { type ReactNode, useState } from "react";
import type { Locale } from "../../lib/i18n/locale";

export function MediaConsentGate({
  provider,
  locale,
  children,
}: {
  provider: string;
  locale: Locale;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);

  if (enabled) return <>{children}</>;

  return (
    <div className="media-consent">
      <p>
        {locale === "zh"
          ? `啟用後會連線至 ${provider}。`
          : `Enabling this preview connects to ${provider}.`}
      </p>
      <button type="button" onClick={() => setEnabled(true)}>
        {locale === "zh" ? "載入預覽" : "Load preview"}
      </button>
    </div>
  );
}
