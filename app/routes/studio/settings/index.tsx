/** `/studio/settings`: links to the settings screens. */
import { SettingsIndex } from "../../../components/studio/settings/settings-index";
import { withOwner } from "../../../lib/cms/studio/auth.server";
import settingsStyles from "../../../styles/studio/settings.css?url";

export const links = () => [{ rel: "stylesheet", href: settingsStyles }];

export const loader = withOwner(() => null);

export default function SettingsIndexRoute() {
  return <SettingsIndex />;
}
