import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

export function EmptyState({
  locale,
  title,
  description,
}: {
  locale: Locale;
  title: string;
  description: string;
}) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <p className="eyebrow">EMPTY / FOR NOW</p>
      <h2 id="empty-state-title">{title}</h2>
      <p>{description}</p>
      <Link to={localePath(locale)}>
        {locale === "zh" ? "返回主頁" : "Return home"} →
      </Link>
    </section>
  );
}
