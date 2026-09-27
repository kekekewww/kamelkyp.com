/**
 * `/studio/projects/new` (admin-architecture §2.2): title, slug (follows the
 * EN title until edited) and primary category, then straight into the
 * editor. Everything else waits; drafts are never public.
 */
import { Link, useNavigation } from "react-router";
import type { Term } from "../../../lib/cms/schemas/taxonomy";
import {
  IntentButton,
  LocalizedTextField,
  SlugField,
  StudioForm,
  TermSelect,
} from "../ui";
import type { ProjectActionData } from "./types";

function issueFor(
  result: ProjectActionData | undefined,
  field: string,
  locale?: "zh" | "en",
): string | undefined {
  return result?.issues?.find(
    (issue) =>
      issue.field === field && (locale ? issue.locale === locale : true),
  )?.message;
}

export function ProjectCreateForm({
  categories,
  result,
}: {
  categories: Term[];
  /** The last failed `create` (structural problems only). */
  result?: ProjectActionData;
}) {
  const navigation = useNavigation();
  const creating =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "create";
  const failed = result && !result.ok ? result : undefined;

  return (
    <StudioForm className="projects-create" noValidate>
      <p className="projects-create__lede">
        Start with a title. The year, media, case study and everything else live
        in the editor; nothing is public until you publish.
      </p>
      <LocalizedTextField
        name="title"
        label="Title"
        required
        maxLength={200}
        errors={{
          zh: issueFor(failed, "title", "zh"),
          en: issueFor(failed, "title", "en"),
        }}
        hint="The slug follows the English title."
      />
      <SlugField
        entityType="project"
        prefix="/en/works/"
        titleField="title.en"
        error={issueFor(failed, "slug")}
      />
      <TermSelect
        name="primaryCategoryId"
        label="Primary category"
        terms={categories}
        placeholder="Choose later"
        hint="More categories can be added in the editor."
        error={issueFor(failed, "primaryCategoryId")}
      />
      {failed && !failed.issues?.length ? (
        <p className="studio-field__error" role="alert">
          {failed.message}
        </p>
      ) : null}
      <div className="projects-create__actions">
        <IntentButton
          intent="create"
          variant="primary"
          pending={creating}
          pendingLabel="Creating…"
        >
          Create draft
        </IntentButton>
        <Link className="studio-btn studio-btn--ghost" to="/studio/projects">
          Cancel
        </Link>
      </div>
    </StudioForm>
  );
}
