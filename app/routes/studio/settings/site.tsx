/** `/studio/settings/site`: site settings (live on save). */
import { useLoaderData } from "react-router";
import { SiteSettingsForm } from "../../../components/studio/settings/site-form";
import {
  handleSiteSettingsAction,
  loadSiteScreen,
} from "../../../lib/cms/settings-write.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import homepageStyles from "../../../styles/studio/homepage.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: homepageStyles },
];

export const loader = withOwner(({ db, env }) => loadSiteScreen(db, env));

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleSiteSettingsAction({ db, formData, intent, now }),
);

export default function SiteSettingsRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <SiteSettingsForm
      site={data.site}
      contactEmail={data.contactEmail}
      brandName={data.brandName}
      assets={data.assets}
    />
  );
}
