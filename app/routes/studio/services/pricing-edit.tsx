/** `/studio/services/pricing/:serviceId`: one service's price versions (wp2 §4.2-4.3). */
import { useLoaderData } from "react-router";
import { PriceVersionEditor } from "../../../components/studio/pricing/price-version-editor";
import {
  handlePriceEditorAction,
  loadPriceEditor,
} from "../../../lib/cms/repositories/pricing.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import pricingStyles from "../../../styles/studio/pricing.css?url";
import servicesStyles from "../../../styles/studio/services.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: servicesStyles },
  { rel: "stylesheet", href: pricingStyles },
];

export const loader = withOwner(({ db, params, now }) =>
  loadPriceEditor(db, params.serviceId ?? "", now),
);

export const action = withOwnerMutation(
  ({ db, params, formData, intent, now }) =>
    handlePriceEditorAction({
      db,
      serviceId: params.serviceId ?? "",
      formData,
      intent,
      now,
    }),
);

export default function PricingEditRoute() {
  const data = useLoaderData<typeof loader>();
  return <PriceVersionEditor key={data.service.serviceId} data={data} />;
}
