import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { CommissionWizard } from "../../components/commission/commission-wizard";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { loadCommissionWizard } from "../../lib/commission/availability.server";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import type { ServiceId } from "../../lib/services/service-id";

const ROUTE_SERVICES: Record<string, ServiceId> = {
  "mixing/full": "full_mix",
  "mixing/vocal": "vocal_mix",
  "song-transition/simple": "simple_transition",
  "song-transition/edit": "edit_transition",
};

// No contact band on commission pages (IA §5.1).
export const handle: PublicRouteHandle = { contactBand: false };

export async function loader(args: LoaderFunctionArgs) {
  const routeKey = `${args.params.category ?? ""}/${args.params.service ?? ""}`;
  const serviceId = ROUTE_SERVICES[routeKey];
  if (!serviceId) throw new Response("Not Found", { status: 404 });

  const { locale, db, env } = getPublicLoaderContext(args);
  // A service without an active price or effective terms is closed: 404,
  // never a 500 (wp2 §4.6). Missing FX only hides the US$ figures.
  const wizard = await loadCommissionWizard(db, locale, serviceId, new Date());
  if (!wizard) throw new Response("Not Found", { status: 404 });
  const { priceRule, terms, serviceName, fxSnapshot } = wizard;

  const turnstileSiteKey =
    env.TURNSTILE_SITE_KEY ||
    (import.meta.env.DEV ? "1x00000000000000000000AA" : "");
  return {
    locale,
    serviceId,
    serviceName,
    priceRule,
    terms,
    fxSnapshot,
    turnstileSiteKey,
    turnstileAction:
      turnstileSiteKey === "1x00000000000000000000AA"
        ? "test"
        : "commission-submit",
  };
}

export default function CommissionServiceRoute() {
  const data = useLoaderData<typeof loader>();
  return <CommissionWizard {...data} />;
}
