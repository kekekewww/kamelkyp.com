import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { loadServiceDetail } from "../../components/services/service-detail-loader.server";
import { ServiceOverview } from "../../components/services/service-overview";

export async function loader(args: LoaderFunctionArgs) {
  return loadServiceDetail(args, "vocal_mix");
}

export default function VocalMixRoute() {
  const { locale, fxSnapshot, studentDiscountBps } =
    useLoaderData<typeof loader>();
  return (
    <ServiceOverview
      serviceId="vocal_mix"
      locale={locale}
      fxSnapshot={fxSnapshot}
      studentDiscountBps={studentDiscountBps}
    />
  );
}
