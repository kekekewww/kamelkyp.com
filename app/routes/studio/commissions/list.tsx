/**
 * `/studio/commissions`: the Commissions inbox (admin-architecture §2.2).
 * Query parameters keep the legacy names (`status`, `service`, `cursor`).
 * No action here: status, student price and cleanup post to their own
 * resource routes.
 */
import { useLoaderData } from "react-router";
import { CommissionsInbox } from "../../../components/studio/commissions/commissions-inbox";
import { loadCommissions } from "../../../lib/cms/repositories/commissions.server";
import { withOwner } from "../../../lib/cms/studio/auth.server";
import commissionsStyles from "../../../styles/studio/commissions.css?url";

export const links = () => [{ rel: "stylesheet", href: commissionsStyles }];

export const loader = withOwner(({ db, env, request, now }) =>
  loadCommissions({
    db,
    url: new URL(request.url),
    cursorSecret: env.CSRF_SECRET,
    now,
  }),
);

export default function CommissionsRoute() {
  const data = useLoaderData<typeof loader>();
  return <CommissionsInbox data={data} />;
}
