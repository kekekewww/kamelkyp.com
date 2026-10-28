/** `/studio/services/pricing`: commission prices (wp2 §4.2, §4.9). */
import { useLoaderData } from "react-router";
import { PricingIndex } from "../../../components/studio/pricing/pricing-index";
import {
  handlePricingIndexAction,
  loadPricingIndex,
} from "../../../lib/cms/repositories/pricing.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import pricingStyles from "../../../styles/studio/pricing.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: pricingStyles },
];

export const loader = withOwner(({ db, now }) => loadPricingIndex(db, now));

export const action = withOwnerMutation(({ db, env, intent, now }) =>
  handlePricingIndexAction({ db, env, intent, now }),
);

export default function PricingRoute() {
  const data = useLoaderData<typeof loader>();
  return <PricingIndex data={data} />;
}
