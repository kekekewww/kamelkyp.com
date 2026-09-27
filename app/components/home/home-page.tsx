import type {
  PublicProjectCard,
  PublicRecognitionItem,
  PublicSite,
  PublicSiteContext,
  PublicWritingItem,
} from "../../lib/cms/public/view-models";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import type { FxSnapshot } from "../../lib/pricing/fx-repository.server";
import { ContactBand } from "../layout/contact-band";
import { AboutTeaser } from "./about-teaser";
import { Capabilities } from "./capabilities";
import { Hero } from "./hero";
import { type HomePriceRow, PricingPreview } from "./pricing-preview";
import { Recognition } from "./recognition";
import { SelectedWork } from "./selected-work";
import { ServicesOverview } from "./services-overview";
import { WritingPreview } from "./writing-preview";

export interface HomeData {
  showreel: MediaItem | null;
  projects: PublicProjectCard[];
  recognition: PublicRecognitionItem[];
  writing: PublicWritingItem[];
  startingPrices: {
    mixing: number | null;
    song_transition: number | null;
  } | null;
  fxSnapshot: FxSnapshot | null;
}

/** Area price rows in settings order; software is always quoted on request. */
export function homePriceRows(
  areas: PublicSite["serviceAreas"],
  prices: HomeData["startingPrices"],
): HomePriceRow[] {
  if (!prices) return [];
  return areas.flatMap<HomePriceRow>((area) => {
    if (!area.name) return [];
    if (area.key === "software") {
      return [{ key: area.key, name: area.name, twd: null }];
    }
    const twd = prices[area.key];
    return twd === null ? [] : [{ key: area.key, name: area.name, twd }];
  });
}

/**
 * Home (IA §4.1): every section reads the Content Studio through the public
 * read layer and hides itself when its collection is empty or its visibility
 * flag is off (site settings → homepage sections). Shared by the public home
 * and the Studio home preview.
 */
export function HomePage({
  locale,
  site: { brand, site },
  data,
}: {
  locale: Locale;
  site: PublicSiteContext;
  data: HomeData;
}) {
  const sections = site.homepage.sections;

  return (
    <main className="home-page" id="main-content">
      <Hero
        locale={locale}
        brand={brand}
        showreel={data.showreel}
        showreelVisible={sections.showreel}
      />
      {sections.selectedWork ? (
        <SelectedWork items={data.projects} locale={locale} />
      ) : null}
      {sections.capabilities ? (
        <Capabilities items={brand.capabilities} locale={locale} />
      ) : null}
      <Recognition items={data.recognition} locale={locale} />
      {sections.services ? (
        <ServicesOverview areas={site.serviceAreas} locale={locale} />
      ) : null}
      <PricingPreview
        locale={locale}
        rows={homePriceRows(site.serviceAreas, data.startingPrices)}
        fxSnapshot={data.fxSnapshot}
      />
      {sections.about ? (
        <AboutTeaser body={brand.shortBio} locale={locale} />
      ) : null}
      <WritingPreview items={data.writing} locale={locale} />
      {sections.contact ? (
        <ContactBand
          locale={locale}
          size="large"
          heading={site.contactBand.default}
          body={site.homepage.contactBandBody || undefined}
          email={brand.contactEmail}
        />
      ) : null}
    </main>
  );
}
