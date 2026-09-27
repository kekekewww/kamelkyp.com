/**
 * Quick create for recognition: the event, its type and year, then the full
 * editor. Everything is optional for a draft; drafts are never public.
 */
import { Link, useActionData, useNavigation } from "react-router";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import type { ValidationIssue } from "../../../lib/cms/types";
import { StudioPage } from "../shell/studio-page";
import {
  IntentButton,
  LocalizedTextField,
  NumberInput,
  StudioForm,
} from "../ui";
import { issueFieldError } from "./kit/editorial";
import { TermField } from "./kit/term-field";

type CreateError = { ok: false; message: string; issues?: ValidationIssue[] };

export function RecognitionNew({ types }: { types: Term[] }) {
  const result = useActionData() as CreateError | undefined;
  const navigation = useNavigation();
  const issues = result?.issues ?? [];
  const creating =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "create";

  return (
    <StudioPage
      title="New recognition"
      breadcrumb={<Link to="/studio/recognition">Recognition</Link>}
      width="narrow"
    >
      <StudioForm className="p3-new" noValidate>
        {result && !result.ok ? (
          <p className="p3-banner p3-banner--error" role="alert">
            {result.message}
          </p>
        ) : null}
        <LocalizedTextField
          name="event"
          label="Event"
          maxLength={200}
          hint="You can fill in the other language and every other field in the editor."
          errors={{
            zh: issueFieldError(issues, "event", "zh"),
            en: issueFieldError(issues, "event", "en"),
          }}
        />
        <div className="p3-fields-row">
          <TermField
            name="typeTermId"
            label="Type"
            vocabulary="recognition_type"
            addLabel="Add type"
            terms={types}
            placeholder="Choose later"
          />
          <NumberInput
            name="year"
            label="Year"
            min={1990}
            max={2100}
            error={issueFieldError(issues, "year")}
          />
        </div>
        <div className="p3-new__actions">
          <IntentButton
            intent="create"
            variant="primary"
            pending={creating}
            pendingLabel="Creating…"
          >
            Create draft
          </IntentButton>
          <Link className="studio-link" to="/studio/recognition">
            Cancel
          </Link>
        </div>
      </StudioForm>
    </StudioPage>
  );
}
