/**
 * Homepage placement from the editor. Placement is live on click (not part
 * of Save or Publish), so it posts through its own fetcher and never marks
 * the form as saved.
 */
import type { EntityMeta } from "../../../lib/cms/types";
import { useToast } from "../ui";
import { useProjectSubmit } from "./use-project-submit";

export function FeatureToggle({
  meta,
  limit,
}: {
  meta: EntityMeta;
  limit: number;
}) {
  const toast = useToast();
  const action = useProjectSubmit((result, sent) => {
    if (!result.ok) {
      toast.show({
        tone: "error",
        message: result.message ?? "The homepage was not updated.",
      });
      return;
    }
    const featured = sent.intent === "feature";
    toast.show({
      message: featured
        ? "Featured on the homepage"
        : "Removed from the homepage",
      action: {
        label: "Undo",
        onAction: () =>
          action.submit({ intent: featured ? "unfeature" : "feature" }),
      },
    });
  });

  if (meta.status === "archived") {
    return (
      <div className="projects-feature">
        <p className="studio-field__label">Homepage</p>
        <p className="studio-hint">
          Archived projects cannot be featured. Restore it first.
        </p>
      </div>
    );
  }

  const state = meta.featured
    ? meta.status === "published"
      ? "Featured in Selected work. Order it from the Projects list."
      : "Featured, but not on the homepage until it is published."
    : `Not featured. The homepage shows up to ${limit} featured projects.`;

  return (
    <div className="projects-feature">
      <div className="projects-feature__text">
        <p className="studio-field__label">Homepage</p>
        <p className="studio-hint">{state}</p>
      </div>
      <button
        type="button"
        className="studio-btn studio-btn--secondary studio-btn--compact"
        aria-busy={action.busy || undefined}
        disabled={action.busy}
        onClick={() =>
          action.submit({ intent: meta.featured ? "unfeature" : "feature" })
        }
      >
        {meta.featured ? "Remove from homepage" : "Feature on homepage"}
      </button>
      <p className="projects-feature__live">Applies immediately</p>
    </div>
  );
}
