import { useOutletContext } from "react-router";
import { ServiceChoice } from "../../components/services/service-choice";
import type { PublicOutletContext } from "./layout";

export default function MixingIndexRoute() {
  const { locale } = useOutletContext<PublicOutletContext>();
  return (
    <main className="service-page" id="main-content">
      <header className="service-page__header">
        <p className="eyebrow">MIXING</p>
        <h1>{locale === "zh" ? "選擇混音服務" : "Choose mixing service"}</h1>
        <p>
          {locale === "zh"
            ? "依你的素材範圍，選擇完整歌曲混音或 Vocal 混音。"
            : "Choose full-song or vocal mixing based on your source material."}
        </p>
      </header>
      <ServiceChoice category="mixing" locale={locale} />
    </main>
  );
}
