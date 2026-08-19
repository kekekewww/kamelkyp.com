import { useState } from "react";

type LinkField = { id: string; label: string; url: string };

export function LinkGroupEditor() {
  const [links, setLinks] = useState<LinkField[]>([]);
  const update = (id: string, field: "label" | "url", value: string) => {
    setLinks((current) =>
      current.map((link) =>
        link.id === id ? { ...link, [field]: value } : link,
      ),
    );
  };
  return (
    <>
      <label>
        分組
        <select name="key">
          <option value="social">社群</option>
          <option value="workRepository">作品存放處</option>
          <option value="otherWebsite">其他網站</option>
          <option value="footer">Footer</option>
          <option value="postReference">文章參考</option>
        </select>
      </label>
      <label>
        中文分組名稱
        <input name="labelZh" required />
      </label>
      <label>
        English group label
        <input name="labelEn" required />
      </label>
      <input
        name="linksJson"
        type="hidden"
        value={JSON.stringify(links.map(({ id: _id, ...link }) => link))}
      />
      {links.map((link) => (
        <section className="admin-block" key={link.id}>
          <label>
            連結名稱
            <input
              value={link.label}
              onChange={(event) => update(link.id, "label", event.target.value)}
            />
          </label>
          <label>
            HTTPS 或 mailto URL
            <input
              value={link.url}
              onChange={(event) => update(link.id, "url", event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setLinks((current) =>
                current.filter((entry) => entry.id !== link.id),
              )
            }
          >
            移除
          </button>
        </section>
      ))}
      <button
        type="button"
        onClick={() =>
          setLinks((current) => [
            ...current,
            { id: crypto.randomUUID(), label: "", url: "" },
          ])
        }
      >
        新增連結
      </button>
    </>
  );
}
