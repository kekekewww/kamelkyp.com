/**
 * Quick create for a service: a name (either language) and a group. The
 * draft opens in the editor; price mode starts as Contact, so no number is
 * ever needed to begin.
 */
import { Link } from "react-router";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import { StudioPage } from "../shell/studio-page";
import {
  IntentButton,
  LocalizedTextField,
  StudioForm,
  TermSelect,
} from "../ui";

export function NewServiceForm({
  groups,
  defaultGroup,
  error,
  pending,
}: {
  groups: Term[];
  defaultGroup?: string;
  error?: string | null;
  pending?: boolean;
}) {
  return (
    <StudioPage
      title="New service"
      breadcrumb={<Link to="/studio/services">Services</Link>}
      width="narrow"
    >
      <StudioForm className="studio-new-service" aria-label="New service">
        <LocalizedTextField
          name="name"
          label="Name"
          sameInBoth
          maxLength={200}
          hint="One language is enough to start; both are needed to publish."
          errors={error ? { zh: error } : undefined}
        />
        <TermSelect
          name="groupTermId"
          label="Group"
          terms={groups}
          defaultValue={defaultGroup || null}
          placeholder="Choose later"
          hint="Mixing, Music Production, Software Development and the other groups live in Settings → Taxonomies."
        />
        <p className="studio-hint">
          The draft starts with price mode Contact: no number is shown until you
          choose Fixed or Starting from and enter a confirmed price. Nothing
          goes live until you publish.
        </p>
        <div className="studio-new-service__actions">
          <IntentButton
            intent="create"
            variant="primary"
            pending={pending}
            pendingLabel="Creating…"
          >
            Create draft
          </IntentButton>
          <Link className="studio-link" to="/studio/services">
            Cancel
          </Link>
        </div>
      </StudioForm>
    </StudioPage>
  );
}
