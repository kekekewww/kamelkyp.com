/** `/studio/music/new`: quick create (title), then the editor. */
import { Link } from "react-router";
import { StudioPage } from "../../../components/studio/shell/studio-page";
import {
  IntentButton,
  LocalizedTextField,
  StudioForm,
} from "../../../components/studio/ui";
import { handleMusicCreate } from "../../../lib/cms/repositories/music.server";
import { withOwner, withOwnerMutation } from "../../../lib/cms/studio/auth.server";
import musicStyles from "../../../styles/studio/music.css?url";

export const links = () => [{ rel: "stylesheet", href: musicStyles }];

export const loader = withOwner(() => null);

export const action = withOwnerMutation(handleMusicCreate);

export default function NewMusicRoute() {
  return (
    <StudioPage
      title="New music entry"
      breadcrumb={<Link to="/studio/music">Music</Link>}
      width="narrow"
    >
      <StudioForm className="studio-music-new">
        <LocalizedTextField
          name="title"
          label="Title"
          required
          sameInBoth
          maxLength={200}
          hint="You can change everything later. The artist starts as Kamel."
        />
        <div className="studio-music-new__actions">
          <IntentButton intent="create" variant="primary">
            Create and edit
          </IntentButton>
          <Link className="studio-link" to="/studio/music">
            Cancel
          </Link>
        </div>
      </StudioForm>
    </StudioPage>
  );
}
