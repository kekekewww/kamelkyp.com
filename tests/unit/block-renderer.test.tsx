import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BlockRenderer } from "../../app/components/content/block-renderer";
import { PlaybackProvider } from "../../app/components/media/playback-provider";
import {
  MediaConfigProvider,
  useR2Hosts,
} from "../../app/lib/cms/media/media-config-context";
import { DEFAULT_MEDIA_CONFIG } from "../../app/lib/cms/media/urls";

function HostsProbe() {
  return <output>{[...useR2Hosts()].join(",")}</output>;
}

describe("block renderer", () => {
  it("renders content as escaped React text nodes", () => {
    const html = renderToStaticMarkup(
      <BlockRenderer
        blocks={[{ type: "paragraph", text: "<script>alert(1)</script>" }]}
      />,
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders media blocks without an explicit R2 host list", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PlaybackProvider>
          <MediaConfigProvider
            value={{ ...DEFAULT_MEDIA_CONFIG, r2Hosts: ["cdn.example.com"] }}
          >
            <BlockRenderer
              locale="en"
              blocks={[{ type: "media", mediaId: "reel" }]}
              media={[
                {
                  id: "reel",
                  kind: "cloudflare_r2_audio",
                  url: "https://cdn.example.com/reel.wav",
                  title: "Studio reel",
                  startSeconds: null,
                  endSeconds: null,
                },
              ]}
            />
          </MediaConfigProvider>
        </PlaybackProvider>
      </MemoryRouter>,
    );
    expect(html).toContain("Studio reel");
  });

  it("reads approved R2 hosts from the media config, with today's default", () => {
    expect(renderToStaticMarkup(<HostsProbe />)).toContain(
      "media.kamelkyp.com",
    );
    expect(
      renderToStaticMarkup(
        <MediaConfigProvider
          value={{ ...DEFAULT_MEDIA_CONFIG, r2Hosts: ["cdn.example.com"] }}
        >
          <HostsProbe />
        </MediaConfigProvider>,
      ),
    ).toContain("cdn.example.com");
  });
});
