import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { loadServiceDetail } from "../../components/services/service-detail-loader.server";
import { ServiceOverview } from "../../components/services/service-overview";

export async function loader(args: LoaderFunctionArgs) {
  return loadServiceDetail(args, "simple_transition");
}

export default function SimpleTransitionRoute() {
  const { locale, fxSnapshot, studentDiscountBps } =
    useLoaderData<typeof loader>();
  return (
    <ServiceOverview
      serviceId="simple_transition"
      locale={locale}
      fxSnapshot={fxSnapshot}
      studentDiscountBps={studentDiscountBps}
    />
  );
}
