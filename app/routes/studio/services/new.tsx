/** `/studio/services/new`: quick create (name + group) → editor. */
import { useActionData, useLoaderData, useNavigation } from "react-router";
import { NewServiceForm } from "../../../components/studio/services/new-service";
import { createServiceFromForm } from "../../../lib/cms/repositories/services.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import { listTerms } from "../../../lib/cms/taxonomy.server";
import servicesStyles from "../../../styles/studio/services.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: servicesStyles },
];

export const loader = withOwner(async ({ db, request }) => ({
  groups: await listTerms(db, "service_group"),
  group: new URL(request.url).searchParams.get("group") ?? "",
}));

export const action = withOwnerMutation(({ db, formData, now }) =>
  createServiceFromForm({ db, formData, now }),
);

export default function NewServiceRoute() {
  const { groups, group } = useLoaderData<typeof loader>();
  const result = useActionData() as { message?: string } | undefined;
  const navigation = useNavigation();
  return (
    <NewServiceForm
      groups={groups}
      defaultGroup={group}
      error={result?.message ?? null}
      pending={navigation.state === "submitting"}
    />
  );
}
