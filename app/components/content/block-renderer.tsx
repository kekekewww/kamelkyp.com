import { Children } from "react";
import type { ContentBlock } from "../../lib/content/block-schema";

function renderBlock(block: ContentBlock) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>;
    case "paragraph":
      return <p>{block.text}</p>;
    case "external_link":
      return (
        <p>
          <a href={block.url} rel="noreferrer noopener" target="_blank">
            {block.label} <span aria-hidden="true">↗</span>
          </a>
        </p>
      );
    case "external_image":
      return (
        <figure>
          <img
            src={block.url}
            alt={block.alt}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    case "quote":
      return (
        <blockquote>
          <p>{block.text}</p>
          {block.attribution ? <cite>{block.attribution}</cite> : null}
        </blockquote>
      );
    case "list": {
      const items = Children.toArray(
        block.items.map((item) => <li key={item}>{item}</li>),
      );
      return block.style === "ordered" ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "divider":
      return <hr />;
  }
}

export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="content-blocks">
      {Children.toArray(blocks.map(renderBlock))}
    </div>
  );
}
