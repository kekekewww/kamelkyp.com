import { Link } from "react-router";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

const GROUPS = [
  {
    id: "mixing",
    index: "01",
    path: "/mixing",
    name: { zh: "混音", en: "Mixing" },
    body: {
      zh: "完整歌曲或 Vocal 混音，含母帶。",
      en: "Full-song or vocal mixing, mastering included.",
    },
    link: { zh: "查看混音服務", en: "View mixing" },
  },
  {
    id: "transition",
    index: "02",
    path: "/song-transition",
    name: { zh: "歌曲銜接", en: "Song Transition" },
    body: {
      zh: "舞蹈、活動與表演用的歌曲銜接與剪輯。",
      en: "Transitions and edits for dance, events and performance.",
    },
    link: { zh: "查看歌曲銜接服務", en: "View song transition" },
  },
  {
    id: "software",
    index: "03",
    path: "/services/software",
    name: { zh: "軟體與互動", en: "Software & Interactive" },
    body: {
      zh: "網站、原型、AI 整合、互動裝置。",
      en: "Websites, prototypes, AI integrations, interactive installations.",
    },
    link: { zh: "查看軟體與互動服務", en: "View software & interactive" },
  },
] as const;

/** Home §5: three open service-group rows (design-system §6.13). */
export function ServicesOverview({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  return (
    <section
      className="home-section home-services"
      aria-labelledby="home-services-title"
    >
      <div className="grid section-head">
        <p className="eyebrow">SERVICES / 03</p>
        <h2
          className="section-head__title t-h1"
          id="home-services-title"
          data-reveal="mask"
        >
          {isZh ? "服務" : "Services"}
        </h2>
        <div className="section-head__aside">
          <Link className="text-link" to={localePath(locale, "/services")}>
            {isZh ? "查看全部服務" : "All services"}
            <span className="text-link__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
      <div className="grid">
        <ul className="home-rows home-services__list" data-reveal-group>
          {GROUPS.map((group) => (
            <li key={group.id} className="home-service" data-reveal-item>
              <span className="home-service__index t-meta">{group.index}</span>
              <h3 className="home-service__name t-h2">{group.name[locale]}</h3>
              <p className="home-service__body t-secondary">
                {group.body[locale]}
              </p>
              <Link
                className="home-service__link text-link"
                to={localePath(locale, group.path)}
              >
                {group.link[locale]}
                <span className="text-link__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
