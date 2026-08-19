import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { CommissionWizard } from "../../components/commission/commission-wizard";
import { getActiveTerms } from "../../lib/commission/terms-repository.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getUsableFxSnapshot } from "../../lib/pricing/fx-repository.server";
import { getActivePriceRule } from "../../lib/pricing/price-repository.server";
import type { ServiceId } from "../../lib/services/service-id";

const ROUTE_SERVICES: Record<string, ServiceId> = {
  "mixing/full": "full_mix",
  "mixing/vocal": "vocal_mix",
  "song-transition/simple": "simple_transition",
  "song-transition/edit": "edit_transition",
};

export async function loader(args: LoaderFunctionArgs) {
  const routeKey = `${args.params.category ?? ""}/${args.params.service ?? ""}`;
  const serviceId = ROUTE_SERVICES[routeKey];
  if (!serviceId) throw new Response("Not Found", { status: 404 });

  const { locale, db } = getPublicLoaderContext(args);
  const now = new Date().toISOString();
  const [priceRule, terms] = await Promise.all([
    getActivePriceRule(db, serviceId, now),
    getActiveTerms(db, serviceId, locale, now),
  ]);
  const fxSnapshot =
    locale === "en" ? await getUsableFxSnapshot(db, now.slice(0, 10)) : null;

  return { locale, serviceId, priceRule, terms, fxSnapshot };
}

export default function CommissionServiceRoute() {
  const data = useLoaderData<typeof loader>();
  return <CommissionWizard {...data} />;
}
