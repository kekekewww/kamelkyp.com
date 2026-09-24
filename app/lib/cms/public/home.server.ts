/**
 * Home page data (IA §4.1, content-architecture §3.6): showreel, featured
 * projects, recognition, writing and area starting prices, honouring the
 * site settings (section visibility, counts). A hidden section or a zero
 * count is not queried. Preview mode (Studio "Preview site", `drafts=1`)
 * reads working copies and includes drafts.
 */
import type { Env } from "../../env.server";
import { getSiteSettings } from "../settings.server";
import type { Locale } from "../types";
import { getShowreel } from "./music.server";
import { listHomeProjects } from "./projects.server";
import { listPublicRecognition } from "./recognition.server";
import { getAreaStartingPrices } from "./services.server";
import type { ReadMode } from "./view-models";
import { listPublicWriting } from "./writing.server";

export async function loadHome(
  db: D1Database,
  env: Env,
  locale: Locale,
  options: { mode?: ReadMode; now?: Date } = {},
) {
  const mode = options.mode ?? "published";
  const now = options.now ?? new Date();
  const { value: site } = await getSiteSettings(db);
  const { sections, featuredProjectCount, recognitionCount, writingCount } =
    site.homepage;

  const [showreel, projects, recognition, writing, startingPrices] =
    await Promise.all([
      sections.showreel ? getShowreel(db, env, locale, { mode }) : null,
      sections.selectedWork && featuredProjectCount > 0
        ? listHomeProjects(db, env, locale, featuredProjectCount, { mode })
        : [],
      sections.recognition && recognitionCount > 0
        ? listPublicRecognition(db, env, locale, {
            home: true,
            limit: recognitionCount,
            mode,
          })
        : [],
      sections.writing && writingCount > 0
        ? listPublicWriting(db, env, locale, {
            home: true,
            limit: writingCount,
            mode,
          })
        : [],
      sections.pricing ? getAreaStartingPrices(db, now) : null,
    ]);

  return { showreel, projects, recognition, writing, startingPrices };
}
