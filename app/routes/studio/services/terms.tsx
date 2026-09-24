/** STUB (I Terms): legal documents (port of /admin/terms). */
import { StubPanel } from "../../../components/studio/shell/stub-panel";
import { withOwner } from "../../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function TermsRoute() {
  return <StubPanel title="Terms" legacyHref="/admin/terms" />;
}
