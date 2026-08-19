import { Link } from "react-router";
import type { ContentVersion } from "../../lib/admin/content-service.server";

export function PublishPanel({
  version,
  csrfToken,
}: {
  version: ContentVersion;
  csrfToken: string;
}) {
  return (
    <aside className="publish-panel">
      <h2>發布狀態</h2>
      <dl>
        <dt>版本</dt>
        <dd>v{version.versionNumber}</dd>
        <dt>狀態</dt>
        <dd>{version.state}</dd>
        <dt>Revision</dt>
        <dd>{version.revision}</dd>
        <dt>最後發布</dt>
        <dd>{version.publishedAt ?? "尚未發布"}</dd>
      </dl>
      <Link to={`/admin/content/${version.id}/preview`}>預覽</Link>
      {version.state === "draft" ? (
        <form method="post">
          <input name="csrfToken" type="hidden" value={csrfToken} />
          <input name="intent" type="hidden" value="publish" />
          <button type="submit">發布</button>
        </form>
      ) : null}
      <form method="post">
        <input name="csrfToken" type="hidden" value={csrfToken} />
        <input name="intent" type="hidden" value="unpublish" />
        <button type="submit">下架</button>
      </form>
    </aside>
  );
}
