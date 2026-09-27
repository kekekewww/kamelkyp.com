/** `/studio/services/:id`: service editor (admin-architecture §4.4). */
import { useLoaderData } from "react-router";
import { ServiceEditor } from "../../../components/studio/services/service-editor";
import {
  handleServiceEditorAction,
  loadServiceEditor,
} from "../../../lib/cms/repositories/services.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import servicesStyles from "../../../styles/studio/services.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: servicesStyles },
];

export const loader = withOwner(({ db, params, now }) =>
  loadServiceEditor(db, params.id ?? "", now),
);

export const action = withOwnerMutation(
  ({ db, params, formData, intent, now }) =>
    handleServiceEditorAction({
      db,
      id: params.id ?? "",
      formData,
      intent,
      now,
    }),
);

export default function ServiceEditRoute() {
  const data = useLoaderData<typeof loader>();
  return <ServiceEditor key={data.meta.id} data={data} />;
}
