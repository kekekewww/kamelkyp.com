import { useState } from "react";

type MediaField = { id: string; url: string; title: string };

export function ExternalMediaFields() {
  const [items, setItems] = useState<MediaField[]>([]);
  const update = (id: string, field: "url" | "title", value: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };
  return (
    <fieldset>
      <legend>外部媒體 URL（選填）</legend>
      <input
        name="mediaJson"
        type="hidden"
        value={JSON.stringify(items.map(({ id: _id, ...item }) => item))}
      />
      {items.map((item) => (
        <section className="admin-block" key={item.id}>
          <label>
            HTTPS URL
            <input
              type="url"
              value={item.url}
              onChange={(event) => update(item.id, "url", event.target.value)}
            />
          </label>
          <label>
            顯示標題（選填）
            <input
              value={item.title}
              onChange={(event) => update(item.id, "title", event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setItems((current) =>
                current.filter((entry) => entry.id !== item.id),
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
          setItems((current) => [
            ...current,
            { id: crypto.randomUUID(), url: "", title: "" },
          ])
        }
      >
        新增外部媒體
      </button>
      <p>Dropbox、MediaFire 與不可安全內嵌的網址只會提供外部連結。</p>
    </fieldset>
  );
}
