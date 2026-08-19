import { useOutletContext } from "react-router";
import { ServiceOverview } from "../../components/services/service-overview";
import type { PublicOutletContext } from "./layout";

export default function VocalMixRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return <ServiceOverview serviceId="vocal_mix" locale={locale} />;
}
