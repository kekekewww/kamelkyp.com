/** STUB (P3 Social links): inline table, enable/disable, order. */
import { StubPanel } from "../../components/studio/shell/stub-panel";
import { withOwner } from "../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function SocialLinksRoute() {
  return <StubPanel title="Social links" legacyHref="/admin/links" />;
}
