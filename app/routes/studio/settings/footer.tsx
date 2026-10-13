/** `/studio/settings/footer`: footer groups and links (live on save). */
import { useLoaderData } from "react-router";
import { FooterSettings } from "../../../components/studio/footer/footer-settings";
import {
  handleFooterAction,
  loadFooterScreen,
} from "../../../lib/cms/repositories/footer.server";
import {
  withOwner,
  withOwnerMutation,
} from "../../../lib/cms/studio/auth.server";
import footerStyles from "../../../styles/studio/footer.css?url";
import settingsStyles from "../../../styles/studio/settings.css?url";
import socialStyles from "../../../styles/studio/social.css?url";

export const links = () => [
  { rel: "stylesheet", href: settingsStyles },
  { rel: "stylesheet", href: socialStyles },
  { rel: "stylesheet", href: footerStyles },
];

export const loader = withOwner(({ db }) => loadFooterScreen(db));

export const action = withOwnerMutation(({ db, formData, intent, now }) =>
  handleFooterAction({ db, formData, intent, now }),
);

export default function FooterSettingsRoute() {
  const data = useLoaderData<typeof loader>();
  return <FooterSettings groups={data.groups} sources={data.sources} />;
}
