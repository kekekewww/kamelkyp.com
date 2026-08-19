import { useOutletContext } from "react-router";
import { ServiceOverview } from "../../components/services/service-overview";
import type { PublicOutletContext } from "./layout";

export default function SimpleTransitionRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return <ServiceOverview serviceId="simple_transition" locale={locale} />;
}
