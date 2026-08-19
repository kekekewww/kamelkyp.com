import { Link, useOutletContext } from "react-router";
import { localePath } from "../../lib/i18n/path";
import type { PublicOutletContext } from "./layout";

export default function CommissionIndexRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return (
    <main className="commission-entry" id="main-content">
      <header>
        <p className="eyebrow">COMMISSION</p>
        <h1>{locale === "zh" ? "選擇委託類型" : "Choose a commission"}</h1>
        <p>
          {locale === "zh"
            ? "先選擇工作類型，再查看該類型的兩種服務。"
            : "Choose a work category first, then compare its two services."}
        </p>
      </header>
      <div className="commission-entry__choices">
        <Link to={localePath(locale, "/mixing")}>
          {locale === "zh" ? "混音服務" : "Mixing"}
        </Link>
        <Link to={localePath(locale, "/song-transition")}>
          {locale === "zh" ? "歌曲銜接" : "Song transition"}
        </Link>
      </div>
    </main>
  );
}
