import { useRef } from "react";
import {
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import { PriceQuote } from "../../components/services/price-figure";
import { pageMeta } from "../../lib/cms/public/meta";
import { listPublicProjects } from "../../lib/cms/public/projects.server";
import { listPublicServices } from "../../lib/cms/public/services.server";
import type { PublicServiceItem } from "../../lib/cms/public/view-models";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import { localePath } from "../../lib/i18n/path";
import { useMagnetic } from "../../lib/motion/use-magnetic";

/**
 * The contact block's "Email me" is this page's START A PROJECT instance
 * (IA §5.1), so the shell adds no second CTA band after it.
 */
export const handle: PublicRouteHandle = { contactBand: false };

const RELATED_CATEGORIES = new Set([
  "software",
  "ai",
  "interactive",
  "creative-technology",
]);

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db, env } = getPublicLoaderContext(args);
  const [offerings, projects] = await Promise.all([
    listPublicServices(db, env, locale, { area: "software" }),
    listPublicProjects(db, env, locale),
  ]);
  const related = projects
    .filter((project) =>
      project.categories.some((category) =>
        RELATED_CATEGORIES.has(category.slug),
      ),
    )
    .slice(0, 3)
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      year: project.year,
      placeholder: project.todoContent,
    }));
  return { locale, offerings, related };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title:
      loaderData?.locale === "en" ? "Software & Interactive" : "軟體與互動開發",
  });

function Offering({ offering }: { offering: PublicServiceItem }) {
  const body = offering.shortDescription
    ? [offering.shortDescription]
    : offering.description.flatMap((block) =>
        block.type === "paragraph" ? [block.text] : block.items,
      );
  return (
    <li className="software-offer" data-reveal-item>
      <h3 className="software-offer__title">{offering.name}</h3>
      {body.map((text) => (
        <p className="software-offer__description" key={text}>
          {text}
        </p>
      ))}
    </li>
  );
}

/**
 * Software & interactive (IA §4.6): offerings are the published services of
 * the software area (custom quote, never a number); engagement models,
 * process and the inquiry checklist come from site settings, the address
 * from brand settings.
 */
export default function ServicesSoftwareRoute() {
  const { locale, offerings, related } = useLoaderData<typeof loader>();
  const { brand, site } = usePublicSite();
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);
  const { engagementModels, process, inquiry } = site.softwarePage;
  const email = brand.contactEmail.trim();
  const mailto = email
    ? `mailto:${email}${
        inquiry.subject ? `?subject=${encodeURIComponent(inquiry.subject)}` : ""
      }`
    : null;
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

      {offerings.length > 0 ? (
        <section
          className="software-section grid"
          aria-labelledby="software-offer-title"
        >
          <h2 className="software-section__title" id="software-offer-title">
            {isZh ? "可以合作的內容" : "What I build"}
          </h2>
          <ul className="software-offers" data-reveal-group>
            {offerings.map((offering) => (
              <Offering key={offering.id} offering={offering} />
            ))}
          </ul>
        </section>
      ) : null}

      {engagementModels.length > 0 ? (
        <section
          className="software-section grid section-top-m"
          aria-labelledby="software-models-title"
        >
          <h2 className="software-section__title" id="software-models-title">
            {isZh ? "合作方式" : "Engagement models"}
          </h2>
          <ul className="software-models" data-reveal-group>
            {engagementModels.map((model) => (
              <li className="software-model" key={model.key} data-reveal-item>
                <p className="software-model__label">{model.label}</p>
                <h3 className="software-model__title">{model.title}</h3>
                <p className="software-model__description">
                  {model.description}
                </p>
                <PriceQuote
                  quote={
                    model.priceNote ||
                    (isZh ? "依專案報價" : "Contact for quote")
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {process.length > 0 ? (
        <section
          className="software-section grid section-top-m"
          aria-labelledby="software-process-title"
        >
          <h2 className="software-section__title" id="software-process-title">
            {isZh ? "流程" : "Process"}
          </h2>
          <ol
            className={`step-list${process.length === 5 ? " step-list--five" : ""}`}
            data-reveal-group
          >
            {process.map((title, position) => (
              <li className="step-list__item" key={title} data-reveal-item>
                <span className="step-list__index" aria-hidden="true">
                  {String(position + 1).padStart(2, "0")}
                </span>
                <span className="step-list__title">{title}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

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
                <span className="software-related__year">
                  {project.year ?? ""}
                </span>
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
          {inquiry.include.length > 0 ? (
            <div className="software-contact__include">
              <p
                className="software-contact__include-label"
                id="software-include"
              >
                {isZh ? "請附上" : "Please include"}
              </p>
              <ul aria-labelledby="software-include">
                {inquiry.include.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {mailto ? (
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
              <p className="software-contact__address">{email}</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
