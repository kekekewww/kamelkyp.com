/** `/studio`: Studio home (admin-architecture §4.2). */
import { useLoaderData } from "react-router";
import { StudioHome } from "../../components/studio/home/studio-home";
import { getStudioHome } from "../../lib/cms/repositories/studio-home.server";
import { withOwner } from "../../lib/cms/studio/auth.server";
import homeStyles from "../../styles/studio/home.css?url";

export const links = () => [{ rel: "stylesheet", href: homeStyles }];

export const loader = withOwner(({ db, now }) => getStudioHome(db, now));

export default function StudioHomeRoute() {
  const model = useLoaderData<typeof loader>();
  return <StudioHome model={model} />;
}
