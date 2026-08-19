import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { MediaPreview } from "../../components/media/media-preview";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { getPublishedContent } from "../../lib/db/content-repository.server";
import { localePath } from "../../lib/i18n/path";
import { listMediaForVersion } from "../../lib/media/media-repository.server";

const R2_HOSTS = new Set(["media.kamelkyp.com"]);

const WAVEFORM_BARS = [
  ["wave-01", 28],
  ["wave-02", 46],
  ["wave-03", 64],
  ["wave-04", 38],
  ["wave-05", 76],
  ["wave-06", 52],
  ["wave-07", 88],
  ["wave-08", 44],
  ["wave-09", 58],
  ["wave-10", 72],
  ["wave-11", 34],
  ["wave-12", 82],
  ["wave-13", 48],
  ["wave-14", 66],
  ["wave-15", 94],
  ["wave-16", 54],
  ["wave-17", 42],
  ["wave-18", 74],
  ["wave-19", 62],
  ["wave-20", 86],
  ["wave-21", 38],
  ["wave-22", 58],
  ["wave-23", 78],
  ["wave-24", 46],
  ["wave-25", 68],
  ["wave-26", 90],
  ["wave-27", 52],
  ["wave-28", 72],
  ["wave-29", 40],
  ["wave-30", 60],
  ["wave-31", 84],
  ["wave-32", 48],
] as const;

export async function loader(args: LoaderFunctionArgs) {
  const { locale, db } = getPublicLoaderContext(args);
  const home = await getPublishedContent(db, "page", "home", locale);
  const media = home
    ? await listMediaForVersion(db, home.versionId, R2_HOSTS)
    : [];

  return { locale, showreel: media[0] ?? null };
}

export default function HomeRoute() {
  const { locale, showreel } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="landing-page" id="main-content">
      <section
        className="landing-console"
        aria-label={isZh ? "Kamel 自我介紹" : "About Kamel"}
      >
        <div className="landing-console__identity">
          <p className="landing-console__real-name">楊子賢</p>
          <h1>Kamel</h1>
          <div className="landing-console__rule" aria-hidden="true" />
          <p className="landing-console__role">
            {isZh
              ? "音樂混音與歌曲銜接製作"
              : "Music mixing & song-transition editor"}
          </p>
          <p className="landing-console__introduction">
            {isZh
              ? "為獨立音樂人、歌手、舞蹈團體與活動製作清楚、穩定且服務於作品本身的聲音。"
              : "Focused, reliable audio work for independent musicians, singers, dance groups and events."}
          </p>
          <Link className="text-link" to={localePath(locale, "/commission")}>
            {isZh ? "查看委託方式" : "View commission process"}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>

        <div className="landing-console__content">
          <section className="showreel" aria-labelledby="showreel-title">
            <div className="section-heading">
              <p className="eyebrow">SHOWREEL / 001</p>
              <h2 id="showreel-title">
                {isZh ? "聽見作品" : "Listen to the work"}
              </h2>
            </div>

            {showreel ? (
              <MediaPreview
                item={showreel}
                locale={locale}
                r2Hosts={R2_HOSTS}
              />
            ) : (
              <>
                <div className="showreel__console">
                  <button
                    className="showreel__play"
                    type="button"
                    disabled
                    aria-label={
                      isZh
                        ? "尚無可播放的 Showreel"
                        : "No showreel is available yet"
                    }
                  >
                    <span aria-hidden="true">—</span>
                  </button>
                  <div className="showreel__track">
                    <div className="showreel__waveform" aria-hidden="true">
                      {WAVEFORM_BARS.map(([id, height]) => (
                        <span
                          key={id}
                          style={
                            {
                              "--wave-height": `${height}%`,
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </div>
                    <div className="showreel__metadata">
                      <span>{isZh ? "作品待發布" : "Showreel pending"}</span>
                      <span>00:00 / 00:00</span>
                    </div>
                  </div>
                </div>
                <p className="showreel__empty" role="status">
                  {isZh
                    ? "音訊會由 Kamel 從後台發布；媒體不會自動播放。"
                    : "Kamel will publish audio from the admin area. Media never autoplays."}
                </p>
              </>
            )}
          </section>

          <section
            className="landing-services"
            aria-labelledby="landing-services-title"
          >
            <h2 className="visually-hidden" id="landing-services-title">
              {isZh ? "服務" : "Services"}
            </h2>
            <Link to={localePath(locale, "/mixing")}>
              <span className="landing-services__number">01</span>
              <span>
                <strong>{isZh ? "混音" : "Mixing"}</strong>
                <small>
                  {isZh
                    ? "完整歌曲與 Vocal 混音"
                    : "Full-song and vocal mixing"}
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to={localePath(locale, "/song-transition")}>
              <span className="landing-services__number">02</span>
              <span>
                <strong>{isZh ? "歌曲銜接" : "Song Transition"}</strong>
                <small>
                  {isZh
                    ? "單純銜接與編輯剪輯"
                    : "Simple and edited transitions"}
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </section>
        </div>
      </section>

      <section className="landing-updates" aria-labelledby="updates-title">
        <div className="section-heading">
          <p className="eyebrow">SELECTED / CURRENT</p>
          <h2 id="updates-title">{isZh ? "近期內容" : "Current work"}</h2>
        </div>
        <div className="landing-updates__items">
          <article>
            <span>WORKS</span>
            <h3>{isZh ? "精選作品準備中" : "Selected works are coming"}</h3>
            <p>
              {isZh
                ? "作品發布後可直接在本站預覽。"
                : "Published work will be previewable directly on this site."}
            </p>
            <Link to={localePath(locale, "/works")}>
              {isZh ? "前往作品" : "Browse works"} →
            </Link>
          </article>
          <article>
            <span>NOTES</span>
            <h3>{isZh ? "公告與其他內容" : "Notes and other work"}</h3>
            <p>
              {isZh
                ? "之後會在這裡發布網站、社群與工作相關內容。"
                : "Website notes, posts and work updates will appear here."}
            </p>
            <Link to={localePath(locale, "/other")}>
              {isZh ? "查看其他內容" : "View other work"} →
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
