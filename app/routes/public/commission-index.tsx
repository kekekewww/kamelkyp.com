import { Link, useOutletContext } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";
import type { PublicOutletContext } from "./layout";

// Commission pages carry no contact band: the header CTA is the only
// START A PROJECT instance here (IA §5.1).
export const handle: PublicRouteHandle = { contactBand: false };

interface ProjectPath {
  id: string;
  label: { zh: string; en: string };
  mode: { zh: string; en: string };
  to: (locale: Locale) => string;
}

const ONLINE = { zh: "線上委託", en: "Online commission" };

// Link text is exactly the label; the mode line is sibling text referenced by
// aria-describedby and never names one of the four services (IA §4.10).
const PATHS: ProjectPath[] = [
  {
    id: "mixing",
    label: { zh: "混音", en: "Mixing" },
    mode: ONLINE,
    to: (locale) => localePath(locale, "/commission/mixing"),
  },
  {
    id: "song-transition",
    label: { zh: "歌曲銜接", en: "Song transition" },
    mode: ONLINE,
    to: (locale) => localePath(locale, "/commission/song-transition"),
  },
  {
    id: "software",
    label: { zh: "軟體與互動", en: "Software & Interactive" },
    mode: { zh: "以 Email 洽談", en: "By email" },
    to: (locale) => `${localePath(locale, "/services/software")}#contact`,
  },
];

export default function CommissionIndexRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  const isZh = locale === "zh";

  return (
    <main className="page commission-start" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">START A PROJECT</p>
        <h1 className="page-header__title">
          {isZh ? "開始合作" : "Start a project"}
        </h1>
        <p className="page-header__intro">
          {isZh
            ? "先選擇合作類型。混音與歌曲銜接可直接線上委託；軟體與互動專案以 Email 洽談。"
            : "Choose a project type. Mixing and song transitions are commissioned online; software and interactive projects are handled by email."}
        </p>
      </header>
      <div className="grid">
        <ul className="commission-paths col-content">
          {PATHS.map((path) => {
            const modeId = `commission-path-${path.id}-mode`;
            return (
              <li className="commission-path" key={path.id}>
                <h2 className="commission-path__title">
                  <Link
                    className="commission-path__link"
                    to={path.to(locale)}
                    aria-describedby={modeId}
                  >
                    {path.label[locale]}
                  </Link>
                </h2>
                <p className="commission-path__mode" id={modeId}>
                  {path.mode[locale]}
                </p>
                <span className="commission-path__arrow" aria-hidden="true">
                  →
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
