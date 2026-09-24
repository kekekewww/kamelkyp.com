/** STUB (I Pricing): commission price versions (port of /admin/services). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function PricingRoute() {
  return <StubPanel title="Pricing" legacyHref="/admin/services" />;
}
