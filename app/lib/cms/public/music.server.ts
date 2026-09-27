/**
 * Public music reads (content-schema §2.3): the homepage showreel (the
 * flagged track, only when published) and "Listen" rows on project detail.
 * Never autoplay: this returns data only; players are unchanged.
 */
import type { Env } from "../../env.server";
import type { MediaItem } from "../../media/media-schema";
import type { Locale } from "../types";
import { buildMusicItem, isMusicVisible } from "./build-views";
import { buildViewContext, byPublicOrder, readEntities } from "./read.server";
import type { PublicMusicItem, ReadMode } from "./view-models";

type Options = { mode?: ReadMode };

export async function getShowreelTrack(
  db: D1Database,
  env: Env,
  locale: Locale,
  options: Options = {},
): Promise<PublicMusicItem | null> {
  const mode = options.mode ?? "published";
  const rows = await readEntities(db, "music", mode, {
    where: "t.is_showreel = 1",
  });
  const item = rows[0];
  if (!item || !isMusicVisible(item.content, locale)) return null;
  const context = await buildViewContext(
    db,
    env,
    "music",
    [item.content],
    mode,
  );
  return buildMusicItem(item.content, locale, context, item.facts);
}

/** The active homepage showreel as a player item, or null (empty showreel). */
export async function getShowreel(
  db: D1Database,
  env: Env,
  locale: Locale,
  options: Options = {},
): Promise<MediaItem | null> {
  return (await getShowreelTrack(db, env, locale, options))?.media ?? null;
}

export async function listProjectMusic(
  db: D1Database,
  env: Env,
  locale: Locale,
  projectId: string,
  options: Options = {},
): Promise<PublicMusicItem[]> {
  const mode = options.mode ?? "published";
  const rows = (
    await readEntities(db, "music", mode, {
      where:
        mode === "published"
          ? "json_extract(t.published_json, '$.core.project_id') = ?"
          : "t.project_id = ?",
      binds: [projectId],
    })
  )
    .filter((item) => isMusicVisible(item.content, locale))
    .sort(byPublicOrder);
  const context = await buildViewContext(
    db,
    env,
    "music",
    rows.map((item) => item.content),
    mode,
  );
  return rows.map((item) =>
    buildMusicItem(item.content, locale, context, item.facts),
  );
}
