/** STUB (P4 Homepage control): hero, sections, showreel, featured lists. */
import { StubPanel } from "../../components/studio/shell/stub-panel";
import { withOwner } from "../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function HomepageRoute() {
  return <StubPanel title="Homepage" legacyHref="/admin/content" />;
}
