import { useOutletContext } from "react-router";
import { ServiceOverview } from "../../components/services/service-overview";
import type { PublicOutletContext } from "./layout";

export default function FullMixRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return <ServiceOverview serviceId="full_mix" locale={locale} />;
}
