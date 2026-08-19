import { useOutletContext } from "react-router";
import { ServiceOverview } from "../../components/services/service-overview";
import type { PublicOutletContext } from "./layout";

export default function EditTransitionRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return <ServiceOverview serviceId="edit_transition" locale={locale} />;
}
