/** `/studio/services/terms/:documentId/:locale`: term draft editor (wp2 §4.5, §4.9). */
import { useLoaderData } from "react-router";
import { TermEditor } from "../../../components/studio/terms/term-editor";
import {
  handleTermEditorAction,
  loadTermEditor,
} from "../../../lib/cms/repositories/terms.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import pricingStyles from "../../../styles/studio/pricing.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";
import termsStyles from "../../../styles/studio/terms.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: pricingStyles },
  { rel: "stylesheet", href: termsStyles },
];

export const loader = withOwner(({ db, params, now }) =>
  loadTermEditor(db, params.documentId ?? "", params.locale ?? "", now),
);

export const action = withOwnerMutation(
  ({ db, params, formData, intent, now }) =>
    handleTermEditorAction({
      db,
      documentId: params.documentId ?? "",
      locale: params.locale ?? "",
      formData,
      intent,
      now,
    }),
);

export default function TermsEditRoute() {
  const data = useLoaderData<typeof loader>();
  return <TermEditor key={`${data.document.id}:${data.locale}`} data={data} />;
}
