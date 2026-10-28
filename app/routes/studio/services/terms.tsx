/** `/studio/services/terms`: legal documents per language (wp2 §4.2, §4.9). */
import { useLoaderData } from "react-router";
import { TermsIndex } from "../../../components/studio/terms/terms-index";
import { loadTermsIndex } from "../../../lib/cms/repositories/terms.server";
import { withOwner } from "../../../lib/cms/studio/auth.server";
import pricingStyles from "../../../styles/studio/pricing.css?url";
import termsStyles from "../../../styles/studio/terms.css?url";

export const links = () => [
  { rel: "stylesheet", href: pricingStyles },
  { rel: "stylesheet", href: termsStyles },
];

export const loader = withOwner(({ db, now }) => loadTermsIndex(db, now));

export default function TermsRoute() {
  const data = useLoaderData<typeof loader>();
  return <TermsIndex data={data} />;
}
