import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "../../app/components/studio/blocks/block-editor";
import {
  copyEditorBlocks,
  createEditorBlock,
  type EditorBlock,
  serializeBlocks,
  toEditorBlocks,
} from "../../app/components/studio/blocks/block-model";
import type { LocalizedBlocks } from "../../app/lib/cms/types";
import type { ContentBlock } from "../../app/lib/content/block-schema";

const ALL_TYPES: ContentBlock[] = [
  { type: "heading", level: 3, text: "Signal" },
  { type: "paragraph", text: "First line\nsecond line" },
  { type: "list", style: "unordered", items: ["Mix", "Master"] },
  { type: "quote", text: "Less, but better.", attribution: "Dieter Rams" },
  { type: "quote", text: "Unattributed", attribution: null },
  {
    type: "external_image",
    url: "https://images.example.com/a.jpg",
    alt: "Console",
    caption: "Studio A",
  },
  {
    type: "external_image",
    url: "https://images.example.com/b.jpg",
    alt: "Desk",
    caption: null,
  },
  { type: "external_link", url: "https://example.com", label: "Example" },
  { type: "media", mediaId: "asset-1" },
  { type: "divider" },
];

let counter = 0;
const key = () => {
  counter += 1;
  return `k${counter}`;
};

describe("block model", () => {
  it("round-trips every block type", () => {
    const items = toEditorBlocks(ALL_TYPES, "zh");
    const { blocks, errors } = serializeBlocks(items);
    expect(errors).toEqual({});
    expect(blocks).toEqual(ALL_TYPES);
  });

  it("keys loaded blocks by seed and position, apart from added blocks", () => {
    const keys = (items: readonly EditorBlock[]) =>
      items.map((item) => item.key);
    const first = keys(toEditorBlocks(ALL_TYPES.slice(0, 3), "zh"));
    // Another document loaded, a block added: neither shifts the keys.
    toEditorBlocks(ALL_TYPES, "zh");
    const added = createEditorBlock("paragraph");
    expect(keys(toEditorBlocks(ALL_TYPES.slice(0, 3), "zh"))).toEqual(first);
    expect(first).toEqual(["zh-0", "zh-1", "zh-2"]);
    expect(added.key).toMatch(/^block-\d+$/);
  });

  it("drops empty blocks, blank list lines and outer whitespace", () => {
    const items: EditorBlock[] = [
      createEditorBlock("paragraph", key),
      {
        ...createEditorBlock("heading", key),
        text: "  Title  ",
      } as EditorBlock,
      {
        ...createEditorBlock("list", key),
        itemsText: "\n  one \n\n two\n",
      } as EditorBlock,
      createEditorBlock("external_link", key),
      createEditorBlock("media", key),
      createEditorBlock("divider", key),
    ];
    const { blocks, errors } = serializeBlocks(items);
    expect(errors).toEqual({});
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Title" },
      { type: "list", style: "unordered", items: ["one", "two"] },
      { type: "divider" },
    ]);
  });

  it("flags blocks that cannot be saved and still sends them", () => {
    const image = {
      ...createEditorBlock("external_image", key),
      url: "http://images.example.com/a.jpg",
    } as EditorBlock;
    const link = {
      ...createEditorBlock("external_link", key),
      url: "https://example.com",
    } as EditorBlock;
    const list = {
      ...createEditorBlock("list", key),
      itemsText: "same\nsame",
    } as EditorBlock;
    const quote = {
      ...createEditorBlock("quote", key),
      attribution: "Someone",
    } as EditorBlock;
    const { blocks, errors } = serializeBlocks([image, link, list, quote]);
    expect(blocks).toHaveLength(4);
    expect(errors[image.key]).toMatch(/https/);
    expect(errors[image.key]).toMatch(/alt/i);
    expect(errors[link.key]).toMatch(/label/i);
    expect(errors[list.key]).toMatch(/different/i);
    expect(errors[quote.key]).toMatch(/quote/i);
  });

  it("copies blocks with fresh keys (translate from the other locale)", () => {
    const source = toEditorBlocks(ALL_TYPES.slice(0, 2), "en");
    const copy = copyEditorBlocks(source, key);
    expect(copy.map((item) => item.key)).not.toEqual(
      source.map((item) => item.key),
    );
    expect(serializeBlocks(copy).blocks).toEqual(ALL_TYPES.slice(0, 2));
  });
});

describe("block editor", () => {
  const renderEditor = (defaultValue: LocalizedBlocks) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <BlockEditor name="body" defaultValue={defaultValue} assets={[]} />
      </MemoryRouter>,
    );
  const blockKeys = (html: string) =>
    [...html.matchAll(/data-block-key="([^"]*)"/g)].map((match) => match[1]);

  it("renders the same block keys for the same document (server and hydration agree)", () => {
    const document: LocalizedBlocks = {
      zh: ALL_TYPES.slice(0, 3),
      en: ALL_TYPES.slice(3, 5),
    };
    const first = blockKeys(renderEditor(document));
    // Another request in the same Worker isolate.
    renderEditor({ zh: ALL_TYPES, en: ALL_TYPES });
    const second = blockKeys(renderEditor(document));
    expect(first).toHaveLength(5);
    expect(new Set(first.slice(0, 3)).size).toBe(3);
    expect(second).toEqual(first);
  });

  it("posts both locales as JSON and opens on ZH", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <BlockEditor
          name="content"
          defaultValue={{
            zh: [{ type: "paragraph", text: "中文段落" }],
            en: [],
          }}
          assets={[]}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('name="content.zh:json"');
    expect(html).toContain('name="content.en:json"');
    expect(html).toContain(
      `value="${JSON.stringify([{ type: "paragraph", text: "中文段落" }]).replace(/"/g, "&quot;")}"`,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>ZH/);
    expect(html).toContain('lang="zh-Hant"');
    expect(html).toContain("Add block");
  });
});
