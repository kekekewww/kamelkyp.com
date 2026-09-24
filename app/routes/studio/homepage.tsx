/** `/studio/homepage`: homepage control (admin-architecture §4.2.1). */
import { useLoaderData } from "react-router";
import { HomepageControl } from "../../components/studio/homepage/homepage-control";
import {
  getHomepageModel,
  handleHomepageAction,
} from "../../lib/cms/repositories/homepage.server";
import { withOwner, withOwnerMutation } from "../../lib/cms/studio/auth.server";
import homepageStyles from "../../styles/studio/homepage.css?url";
import settingsStyles from "../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: homepageStyles },
];

export const loader = withOwner(({ db }) => getHomepageModel(db));

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleHomepageAction({ db, formData, intent, now }),
);

export default function HomepageRoute() {
  const model = useLoaderData<typeof loader>();
  return <HomepageControl model={model} />;
}
