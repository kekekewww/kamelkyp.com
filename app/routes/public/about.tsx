import {
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import { pageMeta } from "../../lib/cms/public/meta";
import type { PublicBrand } from "../../lib/cms/public/view-models";
import type { FormattedBlock } from "../../lib/cms/text-format";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";
import { localePath } from "../../lib/i18n/path";

/**
 * About (IA §4.7, design-system §6.17). Not an autobiography: the lede,
 * sections and capabilities come from brand settings, and the only identity
 * is the brand.
 */
export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  return { locale };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "About" : "關於",
  });

/** Paragraphs as running text; `- ` lists as the numbered principle rows. */
function SectionBody({ blocks }: { blocks: readonly FormattedBlock[] }) {
  return (
    <>
      {blocks.map((block, position) =>
        block.type === "paragraph" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
          <p key={position}>{block.text}</p>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
          <ol className="about-principles" key={position}>
            {block.items.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items may repeat
              <li className="about-principle" key={index}>
                <span className="about-principle__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="about-principle__text">{item}</span>
              </li>
            ))}
          </ol>
        ),
      )}
    </>
  );
}

function CapabilityLinks({
  capabilities,
  locale,
}: {
  capabilities: PublicBrand["capabilities"];
  locale: Locale;
}) {
  if (capabilities.length === 0) return null;
  return (
    <ul className="about-capabilities">
      {capabilities.map((capability) => {
        const category = capability.categories[0];
        const href = category
          ? `${localePath(locale, "/works")}?category=${encodeURIComponent(category.slug)}`
          : localePath(locale, "/works");
        return (
          <li className="about-capability" key={capability.key}>
            <span className="about-capability__index" aria-hidden="true">
              {capability.index}
            </span>
            <h3 className="about-capability__title">
              <Link className="text-link" to={href}>
                {capability.title}
                <span className="text-link__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </h3>
            {capability.description ? (
              <p className="about-capability__description">
                {capability.description}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function AboutRoute() {
  const { locale } = useLoaderData<typeof loader>();
  const { brand } = usePublicSite();
  const isZh = locale === "zh";
  const copy = getSiteCopy(locale);

  return (
    <main className="page about-page" id="main-content">
      <header className="page-header about-header grid">
        <p className="eyebrow col-rail">ABOUT</p>
        <h1 className="page-header__title">{isZh ? "關於" : "About"}</h1>
        {brand.longBio.map((block, position) =>
          block.type === "paragraph" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
            <p className="about-header__lede" key={position}>
              {block.text}
            </p>
          ) : null,
        )}
      </header>

      {brand.aboutSections.map((section) => {
        const titleId = `about-${section.key}`;
        return (
          <section
            className="about-section grid"
            key={section.key}
            aria-labelledby={titleId}
          >
            <h2 className="about-section__title" id={titleId}>
              {section.heading}
            </h2>
            <div className="about-section__body" data-reveal="up">
              <SectionBody blocks={section.body} />
              {section.key === "what" ? (
                <CapabilityLinks
                  capabilities={brand.capabilities}
                  locale={locale}
                />
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
