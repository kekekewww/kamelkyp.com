import { useRef } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { PriceQuote } from "../../components/services/price-figure";
import { listProjects, SOFTWARE_SERVICES } from "../../content";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import { localePath } from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";

/**
 * The contact block's "Email me" is this page's START A PROJECT instance
 * (IA §5.1), so the shell adds no second CTA band after it.
 */
export const handle: PublicRouteHandle = { contactBand: false };

const RELATED_CATEGORIES = new Set(["software", "ai", "interactive"]);

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  const related = listProjects()
    .filter((project) =>
      project.categories.some((category) => RELATED_CATEGORIES.has(category)),
    )
    .slice(0, 3)
    .map((project) => ({
      slug: project.slug,
      title: project.title[locale],
      year: project.year,
      placeholder: project.placeholder,
    }));
  return { locale, related };
}

export default function ServicesSoftwareRoute() {
  const { locale, related } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);
  const { offerings, engagementModels, process, contact } = SOFTWARE_SERVICES;
  const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(
    contact.subject[locale],
  )}`;
  const emailRef = useRef<HTMLAnchorElement>(null);
  useMagnetic(emailRef);

  return (
    <main className="page software-page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">
          SERVICES / SOFTWARE &amp; INTERACTIVE
        </p>
        <h1 className="page-header__title">
          {isZh ? "軟體與互動開發" : "Software & Interactive"}
        </h1>
        <p className="page-header__intro">
          {isZh
            ? "從想法到可運作的系統：網站、原型、AI 整合與互動體驗。"
            : "From idea to working system: websites, prototypes, AI integrations and interactive experiences."}
        </p>
      </header>

      <section
        className="software-section grid"
        aria-labelledby="software-offer-title"
      >
        <h2 className="software-section__title" id="software-offer-title">
          {isZh ? "可以合作的內容" : "What I build"}
        </h2>
        <ul className="software-offers" data-reveal-group>
          {offerings.map((offering) => (
            <li className="software-offer" key={offering.id} data-reveal-item>
              <h3 className="software-offer__title">
                {offering.title[locale]}
              </h3>
              <p className="software-offer__description">
                {offering.description[locale]}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="software-section grid section-top-m"
        aria-labelledby="software-models-title"
      >
        <h2 className="software-section__title" id="software-models-title">
          {isZh ? "合作方式" : "Engagement models"}
        </h2>
        <ul className="software-models" data-reveal-group>
          {engagementModels.map((model) => (
            <li className="software-model" key={model.id} data-reveal-item>
              <p className="software-model__label">{model.label}</p>
              <h3 className="software-model__title">{model.title[locale]}</h3>
              <p className="software-model__description">
                {model.description[locale]}
              </p>
              <PriceQuote quote={model.price[locale]} />
            </li>
          ))}
        </ul>
      </section>

      <section
        className="software-section grid section-top-m"
        aria-labelledby="software-process-title"
      >
        <h2 className="software-section__title" id="software-process-title">
          {isZh ? "流程" : "Process"}
        </h2>
        <ol className="step-list step-list--five" data-reveal-group>
          {process.map((step) => (
            <li className="step-list__item" key={step.index} data-reveal-item>
              <span className="step-list__index" aria-hidden="true">
                {step.index}
              </span>
              <span className="step-list__title">{step.title[locale]}</span>
            </li>
          ))}
        </ol>
      </section>

      {related.length > 0 ? (
        <section
          className="software-section grid section-top-m"
          aria-labelledby="software-related-title"
        >
          <h2 className="software-section__title" id="software-related-title">
            {isZh ? "相關作品" : "Related work"}
          </h2>
          <ul className="software-related" data-reveal-group>
            {related.map((project) => (
              <li
                className="software-related__item"
                key={project.slug}
                data-reveal-item
              >
                <span className="software-related__year">{project.year}</span>
                <Link
                  className="text-link software-related__link"
                  to={localePath(locale, `/works/${project.slug}`)}
                >
                  {project.title}
                  <span className="text-link__arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                {project.placeholder ? (
                  <span className="badge-placeholder">
                    {copy.badgePlaceholder}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="software-contact zone-2"
        id="contact"
        aria-labelledby="software-contact-title"
      >
        <div className="grid software-contact__inner" data-magnetic-scope>
          <h2 className="software-contact__title" id="software-contact-title">
            {isZh ? "聊聊你的專案" : "Tell me about your project"}
          </h2>
          <p className="software-contact__body">
            {isZh
              ? "軟體與互動專案目前以 Email 洽談，不經過線上委託表單。"
              : "Software and interactive projects are handled by email, not through the commission form."}
          </p>
          <div className="software-contact__include">
            <p
              className="software-contact__include-label"
              id="software-include"
            >
              {isZh ? "請附上" : "Please include"}
            </p>
            <ul aria-labelledby="software-include">
              {contact.include.map((item) => (
                <li key={item.en}>{item[locale]}</li>
              ))}
            </ul>
          </div>
          <div className="software-contact__actions">
            <a
              ref={emailRef}
              className="button button--primary button--large"
              href={mailto}
            >
              <span className="button__label" data-magnetic-label>
                {isZh ? "寄信聯絡" : "Email me"}
              </span>
            </a>
            <p className="software-contact__address">{contact.email}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
