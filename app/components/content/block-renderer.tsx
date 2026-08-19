import { Fragment } from "react";
import type { ContentBlock } from "../../lib/content/block-schema";
import type { Locale } from "../../lib/i18n/locale";
import type { MediaItem } from "../../lib/media/media-schema";
import { MediaPreview } from "../media/media-preview";

function renderBlock(
  block: ContentBlock,
  options: {
    locale: Locale | null;
    mediaById: ReadonlyMap<string, MediaItem>;
    r2Hosts: ReadonlySet<string>;
  },
) {
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
      const items = block.items.map((item) => <li key={item}>{item}</li>);
      return block.style === "ordered" ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "media": {
      const item = options.mediaById.get(block.mediaId);
      return item && options.locale ? (
        <MediaPreview
          item={item}
          locale={options.locale}
          r2Hosts={options.r2Hosts}
        />
      ) : null;
    }
    case "divider":
      return <hr />;
  }
}

export function BlockRenderer({
  blocks,
  locale = null,
  media = [],
  r2Hosts = new Set(["media.kamelkyp.com"]),
}: {
  blocks: ContentBlock[];
  locale?: Locale | null;
  media?: MediaItem[];
  r2Hosts?: ReadonlySet<string>;
}) {
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const duplicateCounts = new Map<string, number>();
  const renderedBlocks = blocks.map((block) => {
    const fingerprint = JSON.stringify(block);
    const occurrence = duplicateCounts.get(fingerprint) ?? 0;
    duplicateCounts.set(fingerprint, occurrence + 1);

    return (
      <Fragment key={`${fingerprint}:${occurrence}`}>
        {renderBlock(block, { locale, mediaById, r2Hosts })}
      </Fragment>
    );
  });

  return <div className="content-blocks">{renderedBlocks}</div>;
}
