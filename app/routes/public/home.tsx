import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { AboutTeaser } from "../../components/home/about-teaser";
import { Capabilities } from "../../components/home/capabilities";
import { Hero } from "../../components/home/hero";
import { PricingPreview } from "../../components/home/pricing-preview";
import { Recognition } from "../../components/home/recognition";
import { SelectedWork } from "../../components/home/selected-work";
import { ServicesOverview } from "../../components/home/services-overview";
import { WritingPreview } from "../../components/home/writing-preview";
import { ContactBand } from "../../components/layout/contact-band";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { listProjects, mergeWorks, mergeWriting, WRITING } from "../../content";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import {
  getPublishedContent,
  listPublishedContentRecords,
} from "../../lib/db/content-repository.server";
import { listMediaForVersion } from "../../lib/media/media-repository.server";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";
import { getCategoryServices } from "../../lib/services/catalog";

const R2_HOSTS = new Set(["media.kamelkyp.com"]);

/** Selected Work: first four featured file projects, plus the newest D1 work first. */
const FEATURED_LIMIT = 4;
const WRITING_LIMIT = 3;

/** The contact band is rendered inline (it carries the home body copy). */
export const handle: PublicRouteHandle = { contactBand: false };

function lowestBasePrice(category: "mixing" | "song_transition"): number {
  return Math.min(
    ...getCategoryServices(category).map((service) => service.basePriceTwd),
  );
}

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const [home, works, posts, price] = await Promise.all([
    getPublishedContent(db, "page", "home", locale),
    listPublishedContentRecords(db, "work", locale),
    listPublishedContentRecords(db, "post", locale),
    getPublicPriceContext(args),
  ]);
  const media = home
    ? await listMediaForVersion(db, home.versionId, R2_HOSTS)
    : [];

  const newestWork = [...works]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 1);
  const selectedWork = [
    ...mergeWorks(newestWork, [], locale),
    ...mergeWorks(
      [],
      listProjects({ featured: true }).slice(0, FEATURED_LIMIT),
      locale,
    ),
  ];

  const writing = mergeWriting(
    posts.map(({ slug, title, publishedAt }) => ({ slug, title, publishedAt })),
    WRITING,
    locale,
  ).slice(0, WRITING_LIMIT);

  return {
    locale,
    showreel: media[0] ?? null,
    selectedWork,
    writing,
    pricing: {
      mixingFromTwd: lowestBasePrice("mixing"),
      transitionFromTwd: lowestBasePrice("song_transition"),
      fxSnapshot: price.fxSnapshot,
    },
  };
}

export default function HomeRoute() {
  const { locale, showreel, selectedWork, writing, pricing } =
    useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="home-page" id="main-content">
      <Hero locale={locale} showreel={showreel} r2Hosts={R2_HOSTS} />
      <SelectedWork items={selectedWork} locale={locale} />
      <Capabilities locale={locale} />
      <Recognition locale={locale} />
      <ServicesOverview locale={locale} />
      <PricingPreview locale={locale} pricing={pricing} />
      <AboutTeaser locale={locale} />
      <WritingPreview items={writing} locale={locale} />
      <ContactBand
        locale={locale}
        size="large"
        body={
          isZh
            ? "混音與歌曲銜接可線上委託；軟體與互動專案以 Email 洽談。"
            : "Mixing and song transitions can be commissioned online; software and interactive projects are handled by email."
        }
      />
    </main>
  );
}
