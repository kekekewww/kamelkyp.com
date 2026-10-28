import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { usePublicSite } from "../../components/layout/use-public-site";
import { PrivacyPage } from "../../components/legal/legal-pages";
import { pageMeta } from "../../lib/cms/public/meta";
import { listPublishedTerms } from "../../lib/content/public-content.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";

// Legal pages close with a text link, not the contact band (IA §4.11).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  return { locale, terms: await listPublishedTerms(db, locale, "privacy") };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) =>
  pageMeta(matches, {
    title: loaderData?.locale === "en" ? "Privacy" : "隱私說明",
  });

export default function PrivacyRoute() {
  const { locale, terms } = useLoaderData<typeof loader>();
  const { brandName } = usePublicSite().brand;
  return <PrivacyPage locale={locale} terms={terms} brandName={brandName} />;
}
