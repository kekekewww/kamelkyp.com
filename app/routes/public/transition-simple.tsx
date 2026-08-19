import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ServiceOverview } from "../../components/services/service-overview";
import { getPublicPriceContext } from "../../lib/pricing/public-price.server";

export async function loader(args: LoaderFunctionArgs) {
  return getPublicPriceContext(args);
}

export default function SimpleTransitionRoute() {
  const { locale, fxSnapshot } = useLoaderData<typeof loader>();
  return (
    <ServiceOverview
      serviceId="simple_transition"
      locale={locale}
      fxSnapshot={fxSnapshot}
    />
  );
}
