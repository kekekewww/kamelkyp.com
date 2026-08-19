import { MediaItemSchema, type MediaKind } from "./media-schema";
import { parseMediaUrl } from "./parse-media-url";

interface MediaRow {
  id: string;
  kind: MediaKind;
  url: string;
  title: string;
  start_seconds: number | null;
  end_seconds: number | null;
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "invalid_media_item";
}

export async function listMediaForVersion(
  db: D1Database,
  contentVersionId: string,
  r2Hosts: ReadonlySet<string>,
) {
  const rows = await db
    .prepare(
      `SELECT m.id, m.kind, m.url, m.title, m.start_seconds, m.end_seconds
       FROM media_items m
       JOIN content_publications p ON p.version_id = m.content_version_id
       WHERE m.content_version_id = ?
       ORDER BY m.sort_order, m.id`,
    )
    .bind(contentVersionId)
    .all<MediaRow>();

  return rows.results.flatMap((row) => {
    try {
      const parsed = parseMediaUrl(row.url, {
        startSeconds: row.start_seconds,
        endSeconds: row.end_seconds,
        r2Hosts,
      });
      if (parsed.kind !== row.kind) {
        console.warn(
          "media_kind_corrected",
          row.id,
          `${row.kind}_to_${parsed.kind}`,
        );
      }
      return [
        MediaItemSchema.parse({
          id: row.id,
          kind: parsed.kind,
          url: parsed.canonicalUrl,
          title: row.title,
          startSeconds: row.start_seconds,
          endSeconds: row.end_seconds,
        }),
      ];
    } catch (error) {
      console.warn("media_item_rejected", row.id, errorCode(error));
      return [];
    }
  });
}
