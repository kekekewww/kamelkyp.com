/** STUB (P4 Studio home): counts, recent changes, attention list, quick actions. */
import { StubPanel } from "../../components/studio/shell/stub-panel";
import { withOwner } from "../../lib/cms/studio/auth.server";

export const loader = withOwner(() => null);

export default function StudioHomeRoute() {
  return (
    <StubPanel
      title="Home"
      legacyHref="/admin"
      description="The Studio home (what needs attention, recent changes, homepage summary) is part of the Studio but still being built."
    />
  );
}
