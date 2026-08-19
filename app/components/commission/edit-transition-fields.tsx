import type { CommissionFieldProps } from "./common-fields";

export function EditTransitionFields({
  draft,
  locale,
  updateField,
}: CommissionFieldProps) {
  if (draft.serviceId !== "edit_transition") return null;
  const isZh = locale === "zh";
  const notes = [
    ["cuts", isZh ? "刪減段落（選填）" : "Cuts (optional)"],
    ["reorderNotes", isZh ? "重排結構（選填）" : "Restructuring (optional)"],
    [
      "tempoPitchNotes",
      isZh ? "速度／音高（選填）" : "Tempo or pitch (optional)",
    ],
    [
      "introOutroNotes",
      isZh ? "開頭／結尾（選填）" : "Intro or ending (optional)",
    ],
    ["effectNotes", isZh ? "音效需求（選填）" : "Effects (optional)"],
  ] as const;

  return (
    <fieldset className="commission-fields">
      <legend>
        {isZh ? "歌曲編輯與銜接" : "Song editing and transitions"}
      </legend>
      {draft.songs.map((song, index) => (
        <div className="commission-song" key={`song-${song.order}`}>
          <h3>{isZh ? `第 ${index + 1} 首` : `Song ${index + 1}`}</h3>
          <label htmlFor={`edited-song-url-${index}`}>
            {isZh ? `歌曲 ${index + 1} 連結` : `Song ${index + 1} link`}
          </label>
          <input
            id={`edited-song-url-${index}`}
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
          <label htmlFor={`segment-duration-${index}`}>
            {isZh ? "使用時長" : "Segment duration"}
          </label>
          <input
            id={`segment-duration-${index}`}
            value={song.segmentDuration}
            onChange={(event) =>
              updateField(
                "songs",
                draft.songs.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, segmentDuration: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="00:45"
          />
          <label htmlFor={`edited-transition-point-${index}`}>
            {isZh ? "銜接點" : "Transition point"}
          </label>
          <input
            id={`edited-transition-point-${index}`}
            value={song.transitionPoint}
            onChange={(event) =>
              updateField(
                "songs",
                draft.songs.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, transitionPoint: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="00:40"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          updateField("songs", [
            ...draft.songs,
            {
              order: draft.songs.length + 1,
              url: "",
              segmentDuration: "",
              transitionPoint: "",
            },
          ])
        }
      >
        {isZh ? "新增歌曲" : "Add song"}
      </button>
      <label htmlFor="targetDuration">
        {isZh ? "目標總長度" : "Target total length"}
      </label>
      <input
        id="targetDuration"
        value={draft.targetDuration}
        onChange={(event) => updateField("targetDuration", event.target.value)}
      />
      <label htmlFor="transitionStyle">
        {isZh ? "希望的銜接風格" : "Transition style"}
      </label>
      <textarea
        id="transitionStyle"
        value={draft.transitionStyle}
        onChange={(event) => updateField("transitionStyle", event.target.value)}
      />
      <label htmlFor="editedReferenceUrl">
        {isZh ? "參考連結（選填）" : "Reference link (optional)"}
      </label>
      <input
        id="editedReferenceUrl"
        type="url"
        value={draft.referenceUrls[0] ?? ""}
        onChange={(event) =>
          updateField(
            "referenceUrls",
            event.target.value ? [event.target.value] : [],
          )
        }
        placeholder="https://"
      />
      {notes.map(([field, label]) => (
        <div key={field}>
          <label htmlFor={field}>{label}</label>
          <textarea
            id={field}
            value={draft[field]}
            onChange={(event) => updateField(field, event.target.value)}
          />
        </div>
      ))}
    </fieldset>
  );
}
