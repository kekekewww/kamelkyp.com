/** `/studio/social`: social links table (create, update, toggle, delete, reorder). */
import { useLoaderData } from "react-router";
import { SocialLinks } from "../../components/studio/social/social-links";
import {
  handleSocialAction,
  loadSocialLinks,
} from "../../lib/cms/repositories/social-links.server";
import { withOwner, withOwnerMutation } from "../../lib/cms/studio/auth.server";
import socialStyles from "../../styles/studio/social.css?url";

export const links = () => [{ rel: "stylesheet", href: socialStyles }];

export const loader = withOwner(loadSocialLinks);

export const action = withOwnerMutation(handleSocialAction);

export default function SocialLinksRoute() {
  const data = useLoaderData<typeof loader>();
  return <SocialLinks links={data.links} />;
}
