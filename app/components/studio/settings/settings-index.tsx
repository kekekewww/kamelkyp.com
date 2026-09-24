/** Studio → Settings: the four settings screens, one line each. */
import { Link } from "react-router";
import { StudioPage } from "../shell/studio-page";

const SCREENS = [
  {
    to: "/studio/settings/brand",
    title: "Brand",
    body: "Name, tagline, hero text and buttons, about copy, capabilities, contact email, portrait and logo.",
  },
  {
    to: "/studio/settings/site",
    title: "Site",
    body: "Titles and descriptions, social images, navigation, footer, availability, homepage sections and service page copy.",
  },
  {
    to: "/studio/settings/taxonomies",
    title: "Taxonomies",
    body: "Project categories, recognition types, service groups and writing categories.",
  },
  {
    to: "/studio/settings/footer",
    title: "Footer links",
    body: "Link groups shown in the site footer.",
  },
];

export function SettingsIndex() {
  return (
    <StudioPage title="Settings" width="narrow">
      <p className="studio-hint">
        Settings apply to the live site as soon as you save them. There is no
        draft step.
      </p>
      <ul className="studio-settings-index" aria-label="Settings screens">
        {SCREENS.map((screen) => (
          <li className="studio-settings-index__row" key={screen.to}>
            <Link className="studio-settings-index__link" to={screen.to}>
              <span className="studio-settings-index__title">
                {screen.title}
              </span>
              <span className="studio-settings-index__body">{screen.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </StudioPage>
  );
}
