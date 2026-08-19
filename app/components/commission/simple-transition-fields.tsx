import type { CommissionFieldProps } from "./common-fields";

export function SimpleTransitionFields({
  draft,
  locale,
  updateField,
}: CommissionFieldProps) {
  if (draft.serviceId !== "simple_transition") return null;
  const isZh = locale === "zh";
  return (
    <fieldset className="commission-fields">
      <legend>{isZh ? "歌曲與銜接" : "Songs and transitions"}</legend>
      {draft.songs.map((song, index) => (
        <div className="commission-song" key={`song-${song.order}`}>
          <h3>{isZh ? `第 ${index + 1} 首` : `Song ${index + 1}`}</h3>
          <label htmlFor={`song-url-${index}`}>
            {isZh ? `歌曲 ${index + 1} 連結` : `Song ${index + 1} link`}
          </label>
          <input
            id={`song-url-${index}`}
            type="url"
            value={song.url}
            onChange={(event) =>
              updateField(
                "songs",
                draft.songs.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, url: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="https://"
          />
          <label htmlFor={`transition-at-${index}`}>
            {isZh
              ? `歌曲 ${index + 1} 銜接時間點`
              : `Transition point ${index + 1}`}
          </label>
          <input
            id={`transition-at-${index}`}
            value={song.transitionAt}
            onChange={(event) =>
              updateField(
                "songs",
                draft.songs.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, transitionAt: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="00:45"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          updateField("songs", [
            ...draft.songs,
            { order: draft.songs.length + 1, url: "", transitionAt: "" },
          ])
        }
      >
        {isZh ? "新增歌曲" : "Add song"}
      </button>
      <label className="checkbox-field" htmlFor="sequenceConfirmed">
        <input
          id="sequenceConfirmed"
          type="checkbox"
          checked={draft.sequenceConfirmed}
          onChange={(event) =>
            updateField("sequenceConfirmed", event.target.checked)
          }
        />
        {isZh ? "歌曲順序已確認" : "Song order is confirmed"}
      </label>
      <label htmlFor="targetDuration">
        {isZh ? "目標總長度" : "Target total length"}
      </label>
      <input
        id="targetDuration"
        value={draft.targetDuration}
        onChange={(event) => updateField("targetDuration", event.target.value)}
        placeholder="03:00"
      />
      <label className="checkbox-field" htmlFor="seamless">
        <input
          id="seamless"
          type="checkbox"
          checked={draft.seamless}
          onChange={(event) => updateField("seamless", event.target.checked)}
        />
        {isZh ? "需要無縫播放" : "Seamless playback required"}
      </label>
      <label htmlFor="transitionStyle">
        {isZh ? "希望的銜接風格" : "Transition style"}
      </label>
      <textarea
        id="transitionStyle"
        value={draft.transitionStyle}
        onChange={(event) => updateField("transitionStyle", event.target.value)}
      />
      <label className="checkbox-field" htmlFor="consultation">
        <input
          id="consultation"
          type="checkbox"
          checked={draft.consultation}
          onChange={(event) =>
            updateField("consultation", event.target.checked)
          }
        />
        {isZh
          ? "需要協助決定順序或銜接點（服務基價 +50%）"
          : "Need help choosing order or transition points (+50% of service base)"}
      </label>
    </fieldset>
  );
}
