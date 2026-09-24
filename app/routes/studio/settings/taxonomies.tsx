/** `/studio/settings/taxonomies?vocabulary=…`: vocabulary terms (live on save). */
import { useLoaderData } from "react-router";
import { TaxonomyManager } from "../../../components/studio/settings/taxonomy-manager";
import {
  handleTaxonomyAction,
  loadTaxonomyScreen,
} from "../../../lib/cms/repositories/taxonomies.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [{ rel: "stylesheet", href: settingsStyles }];

export const loader = withOwner(({ db, request }) =>
  loadTaxonomyScreen(db, new URL(request.url).searchParams.get("vocabulary")),
);

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleTaxonomyAction({ db, formData, intent, now }),
);

export default function TaxonomiesRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <TaxonomyManager
      key={data.vocabulary}
      vocabulary={data.vocabulary}
      vocabularies={data.vocabularies}
      terms={data.terms}
    />
  );
}
