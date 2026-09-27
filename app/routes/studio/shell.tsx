/**
 * Pathless Studio layout: sidebar navigation, main column. No loader: the
 * root loader (after the owner middleware) already supplies session data.
 */
import { Outlet, useRouteLoaderData } from "react-router";
import { StudioShell } from "../../components/studio/shell/studio-shell";
import type { StudioRootData } from "./root";

export default function StudioShellLayout() {
  const data = useRouteLoaderData("routes/studio/root") as
    | StudioRootData
    | undefined;
  return (
    <StudioShell
      ownerEmail={data?.ownerEmail ?? ""}
      attentionCount={data?.attentionCount ?? 0}
      pendingCommissions={data?.pendingCommissions ?? 0}
    >
      <Outlet />
    </StudioShell>
  );
}
