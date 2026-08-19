import { useState } from "react";
import type { ContentVersion } from "../../lib/admin/content-service.server";
import type { ContentBlock } from "../../lib/content/block-schema";

type EditorBlock = { id: string; block: ContentBlock };

function blockLabel(block: ContentBlock): string {
  switch (block.type) {
    case "heading":
      return `標題 H${block.level}`;
    case "paragraph":
      return "段落";
    case "list":
      return "清單";
    case "quote":
      return "引言";
    case "external_image":
      return "外部圖片";
    case "external_link":
      return "外部連結";
    case "media":
      return "媒體";
    case "divider":
      return "分隔線";
  }
}

export function BlockEditor({
  version,
  csrfToken,
}: {
  version: ContentVersion;
  csrfToken: string;
}) {
  const [items, setItems] = useState<EditorBlock[]>(() =>
    version.body.map((block, index) => ({ id: `initial-${index}`, block })),
  );
  const updateText = (id: string, text: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (item.block.type === "heading" || item.block.type === "paragraph") {
          return { ...item, block: { ...item.block, text } };
        }
        return item;
      }),
    );
  };
  const move = (id: string, direction: -1 | 1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [
        next[target] as EditorBlock,
        next[index] as EditorBlock,
      ];
      return next;
    });
  };
  const add = (block: ContentBlock) => {
    setItems((current) => [...current, { id: crypto.randomUUID(), block }]);
  };

  return (
    <form className="admin-form" method="post">
      <input name="csrfToken" type="hidden" value={csrfToken} />
      <input name="intent" type="hidden" value="save" />
      <input name="versionId" type="hidden" value={version.id} />
      <input name="expectedRevision" type="hidden" value={version.revision} />
      <input
        name="blocksJson"
        type="hidden"
        value={JSON.stringify(items.map((item) => item.block))}
      />
      <label>
        標題
        <input defaultValue={version.title} name="title" />
      </label>
      <label>
        摘要
        <textarea defaultValue={version.summary ?? ""} name="summary" />
      </label>
      <fieldset>
        <legend>內容區塊</legend>
        {items.map(({ id, block }, index) => (
          <article className="admin-block" key={id}>
            <strong>{blockLabel(block)}</strong>
            {block.type === "heading" || block.type === "paragraph" ? (
              <textarea
                aria-label={`${blockLabel(block)} ${index + 1}`}
                value={block.text}
                onChange={(event) => updateText(id, event.target.value)}
              />
            ) : (
              <code>{JSON.stringify(block)}</code>
            )}
            <div className="admin-actions">
              <button type="button" onClick={() => move(id, -1)}>
                上移
              </button>
              <button type="button" onClick={() => move(id, 1)}>
                下移
              </button>
              <button
                type="button"
                onClick={() =>
                  setItems((current) =>
                    current.filter((item) => item.id !== id),
                  )
                }
              >
                刪除
              </button>
            </div>
          </article>
        ))}
        <div className="admin-actions">
          <button
            type="button"
            onClick={() => add({ type: "paragraph", text: "新段落" })}
          >
            新增段落
          </button>
          <button
            type="button"
            onClick={() => add({ type: "heading", level: 2, text: "新標題" })}
          >
            新增標題
          </button>
        </div>
      </fieldset>
      <label>
        SEO 標題
        <input defaultValue={version.seoTitle ?? ""} name="seoTitle" />
      </label>
      <label>
        SEO 說明
        <textarea
          defaultValue={version.seoDescription ?? ""}
          name="seoDescription"
        />
      </label>
      <label>
        社群圖片 HTTPS URL
        <input
          defaultValue={version.socialImageUrl ?? ""}
          name="socialImageUrl"
          type="url"
        />
      </label>
      <button type="submit">儲存草稿</button>
    </form>
  );
}
