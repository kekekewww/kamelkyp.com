import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import { TermsPage } from "../../components/legal/legal-pages";
import { pageMeta } from "../../lib/cms/public/meta";
import { getCommissionServiceNames } from "../../lib/cms/public/services.server";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

// Legal pages close with a text link, not the contact band (IA §4.11).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const [terms, serviceNames] = await Promise.all([
    listPublishedTerms(db, locale, "terms"),
    getCommissionServiceNames(db, locale),
  ]);
  return { locale, terms, serviceNames };
}

export const meta: MetaFunction<typeof loader> = ({
  loaderData,
  matches,
  location,
}) =>
  pageMeta(
    { matches, location },
    {
      title: loaderData?.locale === "en" ? "Terms of service" : "服務條款",
    },
  );

export default function TermsRoute() {
  const { locale, terms, serviceNames } = useLoaderData<typeof loader>();
  const { brandName } = usePublicSite().brand;
  return (
    <TermsPage
      locale={locale}
      terms={terms}
      serviceNames={serviceNames}
      brandName={brandName}
    />
  );
}
