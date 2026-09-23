import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { ABOUT, CAPABILITIES } from "../../content";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import { localePath } from "../../lib/i18n/path";

/**
 * About (IA §4.7, design-system §6.17). Not an autobiography, and never the
 * real name (it appears only on the landing page).
 */
export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  return { locale };
}

export default function AboutRoute() {
  const { locale } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);

  return (
    <main className="page about-page" id="main-content">
      <header className="page-header about-header grid">
        <p className="eyebrow col-rail">ABOUT</p>
        <h1 className="page-header__title">{isZh ? "關於" : "About"}</h1>
        <p className="about-header__lede">{ABOUT.lede[locale]}</p>
      </header>

      {ABOUT.sections.map((section) => {
        const titleId = `about-${section.id}`;
        return (
          <section
            className="about-section grid"
            key={section.id}
            aria-labelledby={titleId}
          >
            <h2 className="about-section__title" id={titleId}>
              {section.heading[locale]}
            </h2>
            <div className="about-section__body" data-reveal="up">
              {section.body.map((paragraph) => (
                <p key={paragraph.en}>{paragraph[locale]}</p>
              ))}

              {section.id === "what" ? (
                <ul className="about-capabilities">
                  {CAPABILITIES.map((capability) => (
                    <li className="about-capability" key={capability.id}>
                      <span
                        className="about-capability__index"
                        aria-hidden="true"
                      >
                        {capability.index}
                      </span>
                      <h3 className="about-capability__title">
                        <Link
                          className="text-link"
                          to={`${localePath(locale, "/works")}?category=${capability.categories[0]}`}
                        >
                          {capability.title[locale]}
                          <span className="text-link__arrow" aria-hidden="true">
                            →
                          </span>
                        </Link>
                      </h3>
                      <p className="about-capability__description">
                        {capability.description[locale]}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {section.items && section.items.length > 0 ? (
                <ol className="about-principles">
                  {section.items.map((item, index) => (
                    <li className="about-principle" key={item.en}>
                      <span
                        className="about-principle__index"
                        aria-hidden="true"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="about-principle__text">
                        {item[locale]}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </section>
        );
      })}

      <div className="grid about-page__coda">
        <Link className="text-link" to={localePath(locale, "/works")}>
          {copy.viewWork}
          <span className="text-link__arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}
