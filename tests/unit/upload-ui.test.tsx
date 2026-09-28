/**
 * P2 Studio UI: uploader, media library and asset detail, music list and
 * editor (static render inside a stub data router).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MediaDetailView } from "../../app/components/studio/media/asset-detail";
import { MediaLibraryView } from "../../app/components/studio/media/library";
import {
  MediaUploader,
  uploadLimitsLabel,
} from "../../app/components/studio/media/uploader";
import {
  groupUsages,
  usageFieldLabel,
  usageHref,
} from "../../app/components/studio/media/usage";
import { MusicEditorView } from "../../app/components/studio/music/music-editor";
import { MusicListView } from "../../app/components/studio/music/music-list";
import {
  StudioSessionProvider,
  ToastProvider,
} from "../../app/components/studio/ui";
import { MediaConfigProvider } from "../../app/lib/cms/media/media-config-context";
import {
  DEFAULT_MEDIA_CONFIG,
  type MediaConfig,
} from "../../app/lib/cms/media/urls";
import type {
  MediaDetailData,
  MediaLibraryData,
} from "../../app/lib/cms/repositories/media-library.server";
import type {
  MusicEditorData,
  MusicListData,
  StudioMusicRow,
} from "../../app/lib/cms/repositories/music.server";
import type { MediaAsset } from "../../app/lib/cms/schemas/media-asset";
import type { EntityMeta } from "../../app/lib/cms/types";

const enabled: MediaConfig = {
  ...DEFAULT_MEDIA_CONFIG,
  publicBaseUrl: "https://media.example.test",
  uploadsEnabled: true,
};

/** An `autoplay` attribute on any audio or video element. */
const AUTOPLAY_ATTRIBUTE = /<(audio|video)\b[^>]*\sautoplay/i;

function render(config: MediaConfig, node: React.ReactNode) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MediaConfigProvider value={config}>{node}</MediaConfigProvider>
    </MemoryRouter>,
  );
}

describe("media uploader", () => {
  it("explains that uploads are off and points to Register URL", () => {
    const html = render(
      DEFAULT_MEDIA_CONFIG,
      <MediaUploader onUploaded={() => {}} />,
    );
    expect(html).toContain("Uploads are off");
    expect(html).toContain("Register URL");
    expect(html).not.toContain('type="file"');
  });

  it("offers a keyboard-reachable file input restricted to the field's kind", () => {
    const html = render(
      enabled,
      <MediaUploader kind="audio" onUploaded={() => {}} />,
    );
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="audio/mpeg,audio/wav');
    expect(html).not.toContain("image/png");
    expect(html).toContain("Audio up to 95 MB");
    expect(html).toContain("Drop a file here, or choose one");
  });

  it("never names its controls, so nothing leaks into an editor form", () => {
    const html = render(enabled, <MediaUploader onUploaded={() => {}} />);
    expect(html).not.toMatch(/\sname="/);
    expect(html).not.toContain('type="submit"');
    expect(html).not.toMatch(AUTOPLAY_ATTRIBUTE);
  });

  it("lists every kind's limit when no kind is required", () => {
    expect(uploadLimitsLabel()).toBe(
      "Images up to 20 MB · Audio up to 95 MB · Video up to 95 MB · PDF up to 20 MB",
    );
    expect(uploadLimitsLabel("embed")).toBe(uploadLimitsLabel());
  });
});

// ---- Fixtures and a data-router render helper --------------------------------

function renderRoute(node: React.ReactNode, config: MediaConfig = enabled) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <StudioSessionProvider
          initial={{ csrfToken: "csrf-1", csrfExpiresAt: "", ownerEmail: "o" }}
        >
          <MediaConfigProvider value={config}>
            <ToastProvider>{node}</ToastProvider>
          </MediaConfigProvider>
        </StudioSessionProvider>
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub />);
}

const text = (zh: string, en = zh) => ({ zh, en });

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    kind: "image",
    source: "r2",
    state: "ready",
    storageKey: "media/2026/09/asset-1/cover.jpg",
    externalUrl: null,
    provider: "r2",
    filename: "cover.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 2_516_582,
    width: 1600,
    height: 900,
    durationMs: null,
    title: text("", ""),
    alt: text("封面", "Cover"),
    caption: text("", ""),
    credit: null,
    focalX: 0.25,
    focalY: 0.5,
    previewStartSeconds: null,
    previewEndSeconds: null,
    tags: [],
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

const coverUrl = "https://media.example.test/media/2026/09/asset-1/cover.jpg";

function libraryData(
  overrides: Partial<MediaLibraryData> = {},
): MediaLibraryData {
  return {
    items: [
      {
        summary: {
          id: "asset-1",
          kind: "image",
          filename: "cover.jpg",
          url: coverUrl,
          alt: text("", "Cover"),
          sizeBytes: 2_516_582,
          width: 1600,
          height: 900,
          state: "ready",
        },
        source: "r2",
        provider: "r2",
        createdAt: "2026-09-20T10:00:00.000Z",
        archived: false,
        usageCount: 2,
        publishedUsageCount: 1,
        missingAlt: true,
      },
      {
        summary: {
          id: "asset-2",
          kind: "audio",
          filename: "reel.mp3",
          url: "https://media.example.test/media/2026/09/asset-2/reel.mp3",
          alt: text(""),
          sizeBytes: 5_000_000,
          durationMs: 195_000,
          state: "failed",
        },
        source: "r2",
        provider: "r2",
        createdAt: "2026-09-21T10:00:00.000Z",
        archived: false,
        usageCount: 0,
        publishedUsageCount: 0,
        missingAlt: false,
      },
    ],
    next: "cursor-1",
    filters: {
      q: "",
      kind: null,
      usage: null,
      missingAlt: false,
      archived: false,
      cursor: null,
    },
    pendingCount: 1,
    uploads: { enabled: true, host: "media.example.test" },
    analysis: {
      host: "media.example.test",
      enabled: false,
      corsHosts: ["raw.githubusercontent.com"],
    },
    ...overrides,
  };
}

function detailData(overrides: Partial<MediaDetailData> = {}): MediaDetailData {
  const item = asset();
  return {
    asset: item,
    summary: {
      id: item.id,
      kind: item.kind,
      filename: item.filename,
      url: coverUrl,
      alt: item.alt,
      sizeBytes: item.sizeBytes,
      width: item.width,
      height: item.height,
      state: item.state,
    },
    usages: [
      {
        entityType: "project",
        entityId: "p1",
        field: "coverImageId",
        scope: "published",
        label: "訊號花園",
        status: "published",
      },
      {
        entityType: "project",
        entityId: "p1",
        field: "coverImageId",
        scope: "working",
        label: "訊號花園",
        status: "published",
      },
      {
        entityType: "music",
        entityId: "m1",
        field: "artworkId",
        scope: "working",
        label: "Draft track",
        status: "draft",
      },
    ],
    publicUrl: coverUrl,
    image: { src: coverUrl, width: 1600, height: 900 },
    analysis: {
      host: "media.example.test",
      enabled: false,
      corsHosts: ["raw.githubusercontent.com"],
    },
    analysable: false,
    ...overrides,
  };
}

const meta: EntityMeta = {
  id: "m1",
  type: "music",
  status: "draft",
  todoContent: false,
  featured: false,
  featuredOrder: null,
  sortOrder: 0,
  revision: 3,
  publishedRevision: null,
  hasUnpublishedChanges: false,
  isShowreel: false,
  createdAt: "2026-09-24T00:00:00Z",
  updatedAt: "2026-09-24T00:00:00Z",
  publishedAt: null,
  firstPublishedAt: null,
  archivedAt: null,
};

function musicRow(overrides: Partial<StudioMusicRow> = {}): StudioMusicRow {
  return {
    id: "m1",
    status: "published",
    todoContent: false,
    featured: true,
    featuredOrder: 10,
    sortOrder: 0,
    isShowreel: true,
    hasUnpublishedChanges: false,
    updatedAt: "2026-09-24T00:00:00Z",
    title: text("訊號花園", "Signal Garden"),
    artist: text("Kamel"),
    role: text("混音", "Mixing"),
    genre: text("電子", "Electronic"),
    year: 2025,
    durationMs: 195_000,
    showreelReady: true,
    playable: true,
    projectId: null,
    ...overrides,
  };
}

function listData(overrides: Partial<MusicListData> = {}): MusicListData {
  return {
    rows: [
      musicRow(),
      musicRow({
        id: "m2",
        status: "draft",
        featured: false,
        isShowreel: false,
        title: text("第二首", "Second"),
        durationMs: null,
        year: null,
      }),
    ],
    facets: {
      years: [2025, 2024],
      artists: ["Guest Artist", "Kamel"],
      roles: ["Mixing"],
    },
    filters: {
      q: "",
      status: "active",
      artist: "",
      year: null,
      role: "",
      featured: false,
      sort: "order",
    },
    showreel: { id: "m1", title: "訊號花園", status: "published", ready: true },
    manualOrder: true,
    ...overrides,
  };
}

function editorData(overrides: Partial<MusicEditorData> = {}): MusicEditorData {
  return {
    meta,
    content: {
      projectId: "p1",
      title: text("訊號花園", "Signal Garden"),
      artist: text("Kamel"),
      role: text("混音", "Mixing"),
      genre: text("", ""),
      description: text("", ""),
      year: 2025,
      credits: [{ role: text("製作", "Producer"), name: "Kamel" }],
      artworkId: null,
      audioPreviewId: "a1",
      fullAudioId: null,
      durationMs: 195_000,
      previewStartSeconds: 30,
      previewEndSeconds: 60,
      spotifyUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=abc123",
      soundcloudUrl: null,
      otherLinks: [],
    },
    publishedContent: null,
    issues: [],
    assets: {
      a1: {
        id: "a1",
        kind: "audio",
        filename: "reel.mp3",
        url: "https://media.example.test/reel.mp3",
        alt: text(""),
        durationMs: 195_000,
      },
    },
    projectOptions: [
      { id: "p1", label: "訊號花園", status: "published" },
      { id: "p2", label: "Other", status: "draft" },
    ],
    showreel: null,
    previewUrl: "/studio/preview/music/m1",
    ...overrides,
  };
}

// ---- Usage helpers -------------------------------------------------------------

describe("usage references", () => {
  it("links each usage to the editor that fixes it", () => {
    expect(usageHref({ entityType: "project", entityId: "p1" })).toBe(
      "/studio/projects/p1",
    );
    expect(usageHref({ entityType: "music", entityId: "m1" })).toBe(
      "/studio/music/m1",
    );
    expect(usageHref({ entityType: "site_settings", entityId: "site" })).toBe(
      "/studio/settings/site",
    );
    expect(usageFieldLabel("coverImageId")).toBe("Cover image");
    expect(usageFieldLabel("body.zh")).toBe("Content blocks (ZH)");
  });

  it("groups working and live usages of one entry into one row", () => {
    const groups = groupUsages(detailData().usages);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ live: true, fields: ["Cover image"] });
    expect(groups[1]).toMatchObject({ live: false, fields: ["Artwork"] });
  });
});

// ---- Media library -------------------------------------------------------------

describe("media library view", () => {
  it("shows upload availability, the analysis status and the usage index action", () => {
    const html = renderRoute(<MediaLibraryView data={libraryData()} />);
    expect(html).toContain("Uploads on");
    expect(html).toContain("media.example.test");
    expect(html).toContain("Audio analysis off");
    expect(html).toContain("Rebuild usage index");
    expect(html).toContain("1 upload pending or failed");
  });

  it("explains when uploads are off", () => {
    const html = renderRoute(
      <MediaLibraryView
        data={libraryData({ uploads: { enabled: false, host: null } })}
      />,
      DEFAULT_MEDIA_CONFIG,
    );
    expect(html).toContain("Uploads off");
    expect(html).toContain("Register URL");
  });

  it("lists assets with type, size, duration, usage, state and copy URL", () => {
    const html = renderRoute(<MediaLibraryView data={libraryData()} />);
    expect(html).toContain("cover.jpg");
    expect(html).toContain("2.4 MB");
    expect(html).toContain("1600 × 900");
    expect(html).toContain("Used in 2 places");
    expect(html).toContain("Live");
    expect(html).toContain("Alt text missing");
    expect(html).toContain("reel.mp3");
    expect(html).toContain("03:15");
    expect(html).toContain("Unused");
    expect(html).toContain("Upload failed");
    expect(html).toContain(`href="/studio/media/asset-1"`);
    expect(html).toContain("Copy URL");
    expect(html).toContain(`data-copy="${coverUrl}"`);
    expect(html).toContain("?cursor=cursor-1");
  });

  it("filters by search, kind, usage, missing alt text and archive", () => {
    const html = renderRoute(<MediaLibraryView data={libraryData()} />);
    expect(html).toContain('name="q"');
    expect(html).toContain('name="kind"');
    expect(html).toContain('value="audio"');
    expect(html).toContain('name="usage"');
    expect(html).toContain('name="missingAlt"');
    expect(html).toContain('name="archived"');
  });

  it("invites the first upload when the library is empty", () => {
    const html = renderRoute(
      <MediaLibraryView data={libraryData({ items: [], next: null })} />,
    );
    expect(html).toContain("No media yet");
  });
});

// ---- Asset detail --------------------------------------------------------------

describe("asset detail view", () => {
  it("shows facts, the public URL and editable text fields", () => {
    const html = renderRoute(<MediaDetailView data={detailData()} />);
    expect(html).toContain("cover.jpg");
    expect(html).toContain("image/jpeg");
    expect(html).toContain("2.4 MB");
    expect(html).toContain("1600 × 900");
    expect(html).toContain(`value="${coverUrl}"`);
    for (const name of [
      "title.zh",
      "title.en",
      "alt.zh",
      "alt.en",
      "caption.zh",
      "caption.en",
      "credit",
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("sets the focal point with a keyboard-operable grid (no inline styles)", () => {
    const html = renderRoute(<MediaDetailView data={detailData()} />);
    expect(html.match(/name="focal"/g)).toHaveLength(25);
    expect(html).toContain('name="focalX:number" value="0.25"');
    expect(html).toContain('name="focalY:number" value="0.5"');
    expect(html).not.toMatch(/\sstyle="/);
  });

  it("lists usages with links and refuses deletion while content is live", () => {
    const html = renderRoute(<MediaDetailView data={detailData()} />);
    expect(html).toContain('href="/studio/projects/p1"');
    expect(html).toContain('href="/studio/music/m1"');
    expect(html).toContain("訊號花園");
    expect(html).toContain("Cover image");
    expect(html).toContain(
      "Published content uses this asset. Unpublish or replace it in: 訊號花園.",
    );
  });

  it("confirms deletion of an asset used only by drafts", () => {
    const data = detailData();
    const html = renderRoute(
      <MediaDetailView
        data={{
          ...data,
          usages: data.usages.filter((usage) => usage.scope === "working"),
        }}
      />,
    );
    expect(html).toContain("Delete…");
    expect(html).not.toContain("Published content uses this asset");
  });

  it("plays audio without autoplay and reports the analysis status", () => {
    const audio = asset({
      id: "a2",
      kind: "audio",
      filename: "reel.mp3",
      mimeType: "audio/mpeg",
      width: null,
      height: null,
      durationMs: 195_000,
    });
    const html = renderRoute(
      <MediaDetailView
        data={detailData({
          asset: audio,
          summary: {
            id: "a2",
            kind: "audio",
            filename: "reel.mp3",
            url: "https://media.example.test/reel.mp3",
            alt: text(""),
            durationMs: 195_000,
          },
          publicUrl: "https://media.example.test/reel.mp3",
          image: null,
          usages: [],
        })}
      />,
    );
    expect(html).toContain("<audio");
    expect(html).toContain('preload="none"');
    expect(html).not.toMatch(AUTOPLAY_ATTRIBUTE);
    expect(html).toContain("03:15");
    expect(html).toContain("Test CORS");
    expect(html).toContain('name="previewStartSeconds:number"');
    expect(html).not.toContain('name="focal"');
  });
});

// ---- Music list -----------------------------------------------------------------

describe("music list view", () => {
  it("shows the homepage showreel slot and never promises autoplay", () => {
    const html = renderRoute(<MusicListView data={listData()} />);
    expect(html).toContain("Homepage showreel");
    expect(html).toContain("訊號花園");
    expect(html).toContain("Never autoplays");
  });

  it("warns when the showreel track is not live", () => {
    const html = renderRoute(
      <MusicListView
        data={listData({
          showreel: { id: "m2", title: "Second", status: "draft", ready: true },
        })}
      />,
    );
    expect(html).toContain("Not live until this track is published");
    const none = renderRoute(
      <MusicListView data={listData({ showreel: null })} />,
    );
    expect(none).toContain("No homepage showreel");
  });

  it("renders rows with flags, meta and order controls in manual order", () => {
    const html = renderRoute(<MusicListView data={listData()} />);
    expect(html).toContain('href="/studio/music/m1"');
    expect(html).toContain("Signal Garden");
    expect(html).toContain("Showreel");
    expect(html).toContain("Featured");
    expect(html).toContain("Kamel · Mixing · 2025 · 03:15");
    expect(html).toContain("Reorder: 訊號花園, position 1 of 2");
  });

  it("hides ordering while filtered and offers artist, year, role and featured filters", () => {
    const html = renderRoute(
      <MusicListView data={listData({ manualOrder: false })} />,
    );
    expect(html).not.toContain("Reorder:");
    expect(html).toContain('name="artist"');
    expect(html).toContain(">Guest Artist<");
    expect(html).toContain('name="year"');
    expect(html).toContain('name="role"');
    expect(html).toContain('name="featured"');
  });

  it("invites the first entry or clearing filters when empty", () => {
    expect(
      renderRoute(<MusicListView data={listData({ rows: [] })} />),
    ).toContain("No music yet");
    expect(
      renderRoute(
        <MusicListView
          data={listData({
            rows: [],
            manualOrder: false,
            filters: { ...listData().filters, q: "zzz" },
          })}
        />,
      ),
    ).toContain("Clear filters");
  });
});

// ---- Music editor ----------------------------------------------------------------

describe("music editor view", () => {
  it("groups every field in the documented sections", () => {
    const html = renderRoute(<MusicEditorView data={editorData()} />);
    for (const section of [
      "BASIC",
      "AUDIO",
      "LINKS",
      "CREDITS",
      "RELATIONS",
      "PUBLICATION",
    ]) {
      expect(html).toContain(`id="section-${section.toLowerCase()}"`);
    }
    for (const name of [
      "title.zh",
      "title.en",
      "artist.zh",
      "artist.en",
      "role.en",
      "genre.en",
      "description.en",
      "year:number",
      "duration",
      "audioPreviewId",
      "fullAudioId",
      "artworkId",
      "previewStartSeconds:number",
      "previewEndSeconds:number",
      "spotifyUrl",
      "youtubeUrl",
      "soundcloudUrl",
      "credits.0.name",
      "projectId",
    ]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(html).toContain('name="expectedRevision" value="3"');
    expect(html).toContain('value="03:15"');
  });

  it("offers the project relation with the current project selected", () => {
    const html = renderRoute(<MusicEditorView data={editorData()} />);
    expect(html).toMatch(/<option value="p1" selected="">訊號花園/);
    expect(html).toContain("Other (draft)");
  });

  it("makes the showreel and featured toggles live placement controls", () => {
    const html = renderRoute(<MusicEditorView data={editorData()} />);
    expect(html).toContain('form="music-placement"');
    expect(html).toContain("Make homepage showreel");
    expect(html).toContain("Feature on homepage");
    expect(html).toContain("Never autoplays");

    const reel = renderRoute(
      <MusicEditorView
        data={editorData({
          meta: { ...meta, isShowreel: true, featured: true },
          showreel: {
            id: "m1",
            title: "訊號花園",
            status: "draft",
            ready: true,
          },
        })}
      />,
    );
    expect(reel).toContain("Remove from homepage showreel");
    expect(reel).toContain("Remove from homepage");
  });

  it("shows the save state and never autoplays", () => {
    const html = renderRoute(<MusicEditorView data={editorData()} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("SAVED");
    expect(html).not.toMatch(AUTOPLAY_ATTRIBUTE);
  });
});
