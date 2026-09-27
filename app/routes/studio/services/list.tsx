/** `/studio/services`: grouped services list (admin-architecture §2.2). */
import { useLoaderData } from "react-router";
import { ServiceList } from "../../../components/studio/services/service-list";
import {
  handleServiceListAction,
  loadServiceList,
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

export const loader = withOwner(async ({ db, request, now }) => {
  const list = await loadServiceList(db, new URL(request.url), now);
  return { ...list, now: now.toISOString() };
});

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleServiceListAction({ db, formData, intent, now }),
);

export default function ServicesListRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <ServiceList
      rows={data.rows}
      groups={data.groups}
      filters={{
        q: data.filters.q,
        status: data.filters.status,
        groupTermId: data.filters.groupTermId,
      }}
      now={data.now}
    />
  );
}
