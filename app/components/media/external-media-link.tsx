import type { Locale } from "../../lib/i18n/locale";

export function ExternalMediaLink({
  url,
  locale,
}: {
  url: string;
  locale: Locale;
}) {
  return (
    <a href={url} rel="noreferrer noopener" target="_blank">
      {locale === "zh" ? "開啟外部媒體" : "Open external media"}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
