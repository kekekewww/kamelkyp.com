import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import type { PublicRouteHandle } from "../../components/layout/public-shell";
import { getPublicLoaderContext } from "../../lib/content/public-loader.server";
import { localePath } from "../../lib/i18n/path";

// TODO(Services + About + Writing page agent): complete per IA §4.4 and
// design-system §6.13 (group blocks with starting-at prices, How it works).
// This stub keeps the route valid and links the three service groups.

export const handle: PublicRouteHandle = {
  contactBand: { variant: "default", size: "large" },
};

export async function loader(args: LoaderFunctionArgs) {
  const { locale } = getPublicLoaderContext(args);
  return { locale };
}

export default function ServicesIndexRoute() {
  const { locale } = useLoaderData<typeof loader>();
  const isZh = locale === "zh";

  return (
    <main className="page" id="main-content">
      <header className="page-header grid">
        <p className="eyebrow col-rail">SERVICES</p>
        <h1 className="page-header__title">{isZh ? "服務" : "Services"}</h1>
        <p className="page-header__intro">
          {isZh
            ? "三種合作方式：混音、歌曲銜接，以及軟體與互動開發。"
            : "Three ways to work together: mixing, song transitions, and software & interactive development."}
        </p>
      </header>
      <div className="grid">
        <ul className="ruled-list col-content">
          <li>
            <Link className="text-link" to={localePath(locale, "/mixing")}>
              {isZh ? "混音" : "Mixing"}
            </Link>
          </li>
          <li>
            <Link
              className="text-link"
              to={localePath(locale, "/song-transition")}
            >
              {isZh ? "歌曲銜接" : "Song Transition"}
            </Link>
          </li>
          <li>
            <Link
              className="text-link"
              to={localePath(locale, "/services/software")}
            >
              {isZh ? "軟體與互動" : "Software & Interactive"}
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
