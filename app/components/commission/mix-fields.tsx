import type { CommissionFieldProps } from "./common-fields";

export function MixFields({
  draft,
  locale,
  updateField,
}: CommissionFieldProps) {
  if (draft.serviceId !== "full_mix" && draft.serviceId !== "vocal_mix") {
    return null;
  }
  const isZh = locale === "zh";
  return (
    <fieldset className="commission-fields">
      <legend>{isZh ? "混音需求" : "Mix requirements"}</legend>
      <label htmlFor="genre">{isZh ? "曲風" : "Genre"}</label>
      <input
        id="genre"
        value={draft.genre}
        onChange={(event) => updateField("genre", event.target.value)}
      />
      <label htmlFor="referenceUrl">
        {isZh ? "參考作品連結" : "Reference link"}
      </label>
      <input
        id="referenceUrl"
        type="url"
        value={draft.referenceUrls[0] ?? ""}
        onChange={(event) => updateField("referenceUrls", [event.target.value])}
        placeholder="https://"
      />
      <label htmlFor="bpm">BPM</label>
      <input
        id="bpm"
        value={draft.bpm}
        onChange={(event) => updateField("bpm", event.target.value)}
        placeholder={isZh ? "不知道可填 unknown" : "Use unknown if unavailable"}
      />
      <label htmlFor="key">{isZh ? "調性" : "Key"}</label>
      <input
        id="key"
        value={draft.key}
        onChange={(event) => updateField("key", event.target.value)}
        placeholder={isZh ? "不知道可填 unknown" : "Use unknown if unavailable"}
      />
      <label htmlFor="direction">{isZh ? "處理方向" : "Direction"}</label>
      <textarea
        id="direction"
        rows={6}
        value={draft.direction}
        onChange={(event) => updateField("direction", event.target.value)}
      />
    </fieldset>
  );
}
