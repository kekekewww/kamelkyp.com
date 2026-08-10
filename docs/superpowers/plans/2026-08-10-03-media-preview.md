# Kamel Media Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在作品、Landing Showreel 與 Blog 中安全預覽 YouTube、Google Drive、GitHub Raw、Cloudflare R2 與直接音訊，同時提供外部連結 fallback。

**Architecture:** 所有管理員 URL 先由純函式正規化並分類，公開頁面只渲染 Allowlist Adapter。第三方 iframe 與音訊在使用者點擊前不建立；PlaybackCoordinator 保證同一時間只有一個媒體播放，離開頁面時全部停止。

**Tech Stack:** React 19.2.8、React Router 8.3.0、WaveSurfer 7.12.11、Zod 4.4.3、YouTube Privacy-Enhanced Embed、Playwright 1.61.1。

## Global Constraints

- 前置計畫 01、02 已合併 main。
- Branch：codex/03-media-preview。
- 不接受上傳、Raw iframe HTML、HTTP、javascript:、data: 或未核准 Embed。
- 不自動播放；第三方內容在點擊前不可發出第三方網路請求。
- 播放新媒體時暫停上一個；離開路由時停止。
- 預覽開始／結束秒數只對 YouTube 與可控制的直接音訊保證。
- Drive 只保證可載入預覽，不保證精準段落。
- Dropbox、MediaFire 及不支援安全嵌入的服務顯示安全外部連結。
- 不顯示 download 屬性或下載按鈕。
- R2 Production 使用 Kamel 設定的自訂 Host；r2.dev 只允許 Preview。
- Direct Audio 波形需要 CORS；CORS 失敗時改用簡化播放器或外部連結。
- 控制項符合 44 × 44 px、鍵盤操作、Reduced Motion 與 accessible name。

---

## File Map

### Create

- app/lib/media/media-schema.ts
- app/lib/media/parse-media-url.ts
- app/lib/media/playback-coordinator.ts
- app/lib/media/media-repository.server.ts
- app/components/media/media-preview.tsx
- app/components/media/media-consent-gate.tsx
- app/components/media/youtube-preview.tsx
- app/components/media/google-drive-preview.tsx
- app/components/media/direct-audio-preview.tsx
- app/components/media/external-media-link.tsx
- app/components/media/playback-provider.tsx
- app/styles/media.css
- tests/unit/media-url.test.ts
- tests/unit/playback-coordinator.test.ts
- tests/worker/media-repository.test.ts
- tests/e2e/media-privacy.spec.ts
- tests/e2e/media-playback.spec.ts

### Modify

- app/root.tsx
- app/components/content/block-renderer.tsx
- app/routes/public/home.tsx
- app/routes/public/work-detail.tsx
- app/lib/content/block-schema.ts
- app/styles/global.css

### Produced Interfaces

~~~ts
export type MediaKind =
  | "youtube"
  | "google_drive"
  | "direct_audio"
  | "github_raw_audio"
  | "cloudflare_r2_audio"
  | "external_link";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  url: string;
  title: string;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface ParsedMediaUrl {
  kind: MediaKind;
  canonicalUrl: string;
  embedUrl: string | null;
  provider: "youtube" | "google_drive" | "direct" | "external";
}
~~~

---

### Task 1: Parse, normalize and restrict media URLs

**Files:**
- Create: app/lib/media/media-schema.ts
- Create: app/lib/media/parse-media-url.ts
- Create: tests/unit/media-url.test.ts

**Interfaces:**
- Consumes: MediaKind from the program contract.
- Produces: parseMediaUrl(), MediaItemSchema.

- [ ] **Step 1: Commit failing URL classification tests**

~~~ts
// tests/unit/media-url.test.ts
import { describe, expect, it } from "vitest";
import { parseMediaUrl } from "../../app/lib/media/parse-media-url";

const productionR2Hosts = new Set(["media.kamelkyp.com"]);

describe("media URL parser", () => {
  it("creates a privacy-enhanced YouTube embed with preview bounds", () => {
    expect(
      parseMediaUrl(
        "https://youtu.be/dQw4w9WgXcQ",
        { startSeconds: 12, endSeconds: 42, r2Hosts: productionR2Hosts },
      ),
    ).toEqual({
      kind: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl:
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=12&end=42&autoplay=0",
      provider: "youtube",
    });
  });

  it("classifies GitHub Raw and the approved R2 custom host as audio", () => {
    expect(
      parseMediaUrl(
        "https://raw.githubusercontent.com/kekekewww/audio/main/demo.wav",
        { startSeconds: null, endSeconds: null, r2Hosts: productionR2Hosts },
      ).kind,
    ).toBe("github_raw_audio");

    expect(
      parseMediaUrl(
        "https://media.kamelkyp.com/showreel/demo.mp3",
        { startSeconds: null, endSeconds: null, r2Hosts: productionR2Hosts },
      ).kind,
    ).toBe("cloudflare_r2_audio");
  });

  it("keeps MediaFire as an external link", () => {
    expect(
      parseMediaUrl(
        "https://www.mediafire.com/file/abc/demo/file",
        { startSeconds: null, endSeconds: null, r2Hosts: productionR2Hosts },
      ),
    ).toMatchObject({ kind: "external_link", embedUrl: null });
  });

  it("rejects dangerous and insecure protocols", () => {
    expect(() =>
      parseMediaUrl("javascript:alert(1)", {
        startSeconds: null,
        endSeconds: null,
        r2Hosts: productionR2Hosts,
      }),
    ).toThrow("https_required");
    expect(() =>
      parseMediaUrl("http://example.com/demo.mp3", {
        startSeconds: null,
        endSeconds: null,
        r2Hosts: productionR2Hosts,
      }),
    ).toThrow("https_required");
  });

  it("rejects an end time that is not after the start time", () => {
    expect(() =>
      parseMediaUrl("https://youtu.be/dQw4w9WgXcQ", {
        startSeconds: 30,
        endSeconds: 20,
        r2Hosts: productionR2Hosts,
      }),
    ).toThrow("invalid_preview_range");
  });
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
npm run test:unit -- tests/unit/media-url.test.ts
~~~

Expected result: FAIL because parse-media-url.ts does not exist.

- [ ] **Step 3: Implement deterministic URL parsing**

~~~ts
// app/lib/media/parse-media-url.ts
import type { MediaKind } from "./media-schema";

export interface ParsedMediaUrl {
  kind: MediaKind;
  canonicalUrl: string;
  embedUrl: string | null;
  provider: "youtube" | "google_drive" | "direct" | "external";
}

interface ParseOptions {
  startSeconds: number | null;
  endSeconds: number | null;
  r2Hosts: ReadonlySet<string>;
}

const AUDIO_EXTENSION = /\.(wav|mp3|m4a|aac|ogg|flac)(?:$|\?)/i;

function assertRange(start: number | null, end: number | null) {
  if (start !== null && start < 0) throw new Error("invalid_preview_range");
  if (end !== null && (end < 0 || (start !== null && end <= start))) {
    throw new Error("invalid_preview_range");
  }
}

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
  if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] ?? null;
  }
  return null;
}

function driveId(url: URL): string | null {
  if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  return fileMatch?.[1] ?? url.searchParams.get("id");
}

export function parseMediaUrl(
  input: string,
  options: ParseOptions,
): ParsedMediaUrl {
  assertRange(options.startSeconds, options.endSeconds);
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("https_required");

  const videoId = youtubeId(url);
  if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    const params = new URLSearchParams();
    if (options.startSeconds !== null) {
      params.set("start", String(Math.floor(options.startSeconds)));
    }
    if (options.endSeconds !== null) {
      params.set("end", String(Math.floor(options.endSeconds)));
    }
    params.set("autoplay", "0");
    return {
      kind: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${params}`,
      provider: "youtube",
    };
  }

  const googleDriveId = driveId(url);
  if (googleDriveId && /^[A-Za-z0-9_-]+$/.test(googleDriveId)) {
    return {
      kind: "google_drive",
      canonicalUrl: url.toString(),
      embedUrl: `https://drive.google.com/file/d/${googleDriveId}/preview`,
      provider: "google_drive",
    };
  }

  if (
    url.hostname === "raw.githubusercontent.com" &&
    AUDIO_EXTENSION.test(url.pathname)
  ) {
    return {
      kind: "github_raw_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  if (options.r2Hosts.has(url.hostname) && AUDIO_EXTENSION.test(url.pathname)) {
    return {
      kind: "cloudflare_r2_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  if (AUDIO_EXTENSION.test(url.pathname)) {
    return {
      kind: "direct_audio",
      canonicalUrl: url.toString(),
      embedUrl: null,
      provider: "direct",
    };
  }

  return {
    kind: "external_link",
    canonicalUrl: url.toString(),
    embedUrl: null,
    provider: "external",
  };
}
~~~

MediaItemSchema repeats server validation and does not trust the D1 kind field:

~~~ts
// app/lib/media/media-schema.ts
import { z } from "zod";

export const MediaKinds = [
  "youtube",
  "google_drive",
  "direct_audio",
  "github_raw_audio",
  "cloudflare_r2_audio",
  "external_link",
] as const;

export type MediaKind = (typeof MediaKinds)[number];

export const MediaItemSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(MediaKinds),
    url: z.url(),
    title: z.string().min(1).max(200),
    startSeconds: z.number().int().nonnegative().nullable(),
    endSeconds: z.number().int().positive().nullable(),
  })
  .refine(
    (item) =>
      item.startSeconds === null ||
      item.endSeconds === null ||
      item.endSeconds > item.startSeconds,
    "invalid_preview_range",
  );

export type MediaItem = z.infer<typeof MediaItemSchema>;
~~~

- [ ] **Step 4: Run tests and typecheck**

~~~bash
npm run test:unit -- tests/unit/media-url.test.ts
npm run typecheck
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add safe media URL adapters.

---

### Task 2: Coordinate playback and require click-to-load consent

**Files:**
- Create: app/lib/media/playback-coordinator.ts
- Create: app/components/media/playback-provider.tsx
- Create: app/components/media/media-consent-gate.tsx
- Create: tests/unit/playback-coordinator.test.ts
- Modify: app/root.tsx

**Interfaces:**
- Consumes: media item IDs.
- Produces: PlaybackCoordinator, usePlayback(), MediaConsentGate.

- [ ] **Step 1: Commit failing single-playback tests**

~~~ts
// tests/unit/playback-coordinator.test.ts
import { describe, expect, it, vi } from "vitest";
import { PlaybackCoordinator } from "../../app/lib/media/playback-coordinator";

describe("PlaybackCoordinator", () => {
  it("pauses the active item before another item starts", () => {
    const coordinator = new PlaybackCoordinator();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    coordinator.register("a", pauseA);
    coordinator.register("b", pauseB);
    coordinator.markPlaying("a");
    coordinator.markPlaying("b");

    expect(pauseA).toHaveBeenCalledOnce();
    expect(pauseB).not.toHaveBeenCalled();
  });

  it("stops every item on route disposal", () => {
    const coordinator = new PlaybackCoordinator();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    coordinator.register("a", pauseA);
    coordinator.register("b", pauseB);
    coordinator.stopAll();

    expect(pauseA).toHaveBeenCalledOnce();
    expect(pauseB).toHaveBeenCalledOnce();
  });
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
npm run test:unit -- tests/unit/playback-coordinator.test.ts
~~~

Expected result: FAIL because playback-coordinator.ts does not exist.

- [ ] **Step 3: Implement coordinator and React provider**

~~~ts
// app/lib/media/playback-coordinator.ts
export class PlaybackCoordinator {
  private activeId: string | null = null;
  private readonly pauseCallbacks = new Map<string, () => void>();

  register(id: string, pause: () => void): () => void {
    this.pauseCallbacks.set(id, pause);
    return () => {
      this.pauseCallbacks.delete(id);
      if (this.activeId === id) this.activeId = null;
    };
  }

  markPlaying(id: string): void {
    if (this.activeId && this.activeId !== id) {
      this.pauseCallbacks.get(this.activeId)?.();
    }
    this.activeId = id;
  }

  markPaused(id: string): void {
    if (this.activeId === id) this.activeId = null;
  }

  stopAll(): void {
    for (const pause of this.pauseCallbacks.values()) pause();
    this.activeId = null;
  }
}
~~~

PlaybackProvider creates one coordinator per browser session and calls stopAll on unmount. MediaConsentGate renders a localized button first and creates children only after activation.

~~~tsx
export function MediaConsentGate({
  provider,
  locale,
  children,
}: {
  provider: string;
  locale: Locale;
  children: React.ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  if (enabled) return <>{children}</>;

  return (
    <div className="media-consent">
      <p>
        {locale === "zh"
          ? `啟用後會連線至 ${provider}。`
          : `Enabling this preview connects to ${provider}.`}
      </p>
      <button type="button" onClick={() => setEnabled(true)}>
        {locale === "zh" ? "載入預覽" : "Load preview"}
      </button>
    </div>
  );
}
~~~

- [ ] **Step 4: Run tests**

~~~bash
npm run test:unit -- tests/unit/playback-coordinator.test.ts
npm run typecheck
~~~

Expected result: PASS.

- [ ] **Step 5: Commit**

Cloud commit message: feat: coordinate media playback and consent.

---

### Task 3: Implement YouTube, Drive and external-link previews

**Files:**
- Create: app/components/media/media-preview.tsx
- Create: app/components/media/youtube-preview.tsx
- Create: app/components/media/google-drive-preview.tsx
- Create: app/components/media/external-media-link.tsx
- Create: app/lib/media/media-repository.server.ts
- Create: tests/worker/media-repository.test.ts
- Create: tests/e2e/media-privacy.spec.ts
- Modify: app/routes/public/work-detail.tsx
- Modify: app/routes/public/home.tsx
- Modify: app/components/content/block-renderer.tsx

**Interfaces:**
- Consumes: MediaItem, ParsedMediaUrl, MediaConsentGate.
- Produces: MediaPreview and listMediaForVersion().

- [ ] **Step 1: Commit failing privacy E2E**

~~~ts
// tests/e2e/media-privacy.spec.ts
import { expect, test } from "@playwright/test";

test("does not contact YouTube before explicit activation", async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("youtube")) youtubeRequests.push(request.url());
  });

  await page.goto("/en/works/media-test");
  expect(youtubeRequests).toEqual([]);

  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(page.locator('iframe[title="YouTube: Test video"]')).toBeVisible();
  expect(youtubeRequests.length).toBeGreaterThan(0);
});

test("never embeds MediaFire", async ({ page }) => {
  await page.goto("/en/works/mediafire-test");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open external media" })).toBeVisible();
});
~~~

The Preview test data is inserted into the isolated test D1 during E2E setup and removed afterward.

- [ ] **Step 2: Run E2E and verify failure**

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/media-privacy.spec.ts
~~~

Expected result: FAIL because media components and seeded test routes do not exist.

- [ ] **Step 3: Implement Adapter rendering**

~~~tsx
// app/components/media/media-preview.tsx
export function MediaPreview({
  item,
  locale,
  r2Hosts,
}: {
  item: MediaItem;
  locale: Locale;
  r2Hosts: ReadonlySet<string>;
}) {
  const parsed = parseMediaUrl(item.url, {
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
    r2Hosts,
  });

  switch (parsed.kind) {
    case "youtube":
      return <YouTubePreview item={item} embedUrl={parsed.embedUrl!} locale={locale} />;
    case "google_drive":
      return <GoogleDrivePreview item={item} embedUrl={parsed.embedUrl!} locale={locale} />;
    case "direct_audio":
    case "github_raw_audio":
    case "cloudflare_r2_audio":
      return <DirectAudioPreview item={item} locale={locale} />;
    case "external_link":
      return <ExternalMediaLink url={parsed.canonicalUrl} locale={locale} />;
  }
}
~~~

~~~tsx
// app/components/media/youtube-preview.tsx
export function YouTubePreview({
  item,
  embedUrl,
  locale,
}: {
  item: MediaItem;
  embedUrl: string;
  locale: Locale;
}) {
  return (
    <MediaConsentGate provider="YouTube" locale={locale}>
      <iframe
        title={`YouTube: ${item.title}`}
        src={embedUrl}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </MediaConsentGate>
  );
}
~~~

Drive uses the same consent gate, sandbox="allow-scripts allow-same-origin allow-presentation", and never receives allow-downloads. ExternalMediaLink uses target="_blank" and rel="noreferrer noopener".

Repository requirements:

- Select media_items only through the published content_version_id.
- Re-parse each URL server-side.
- If stored kind differs from parsed kind, use the parsed kind and log only media ID plus error code.
- Never log the full URL.

- [ ] **Step 4: Run repository and privacy tests**

~~~bash
npm run test:worker -- tests/worker/media-repository.test.ts
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/media-privacy.spec.ts
~~~

Expected result: PASS; no YouTube or Drive request occurs before activation.

- [ ] **Step 5: Commit**

Cloud commit message: feat: add consent-gated video and cloud previews.

---

### Task 4: Implement bounded direct-audio playback with waveform fallback

**Files:**
- Create: app/components/media/direct-audio-preview.tsx
- Create: app/styles/media.css
- Create: tests/e2e/media-playback.spec.ts
- Modify: app/root.tsx
- Modify: app/components/media/media-preview.tsx

**Interfaces:**
- Consumes: WaveSurfer, PlaybackCoordinator, MediaItem.
- Produces: DirectAudioPreview.

- [ ] **Step 1: Commit failing playback behavior tests**

~~~ts
// tests/e2e/media-playback.spec.ts
import { expect, test } from "@playwright/test";

test("starting a second direct audio pauses the first", async ({ page }) => {
  await page.goto("/en/works/audio-test");
  const first = page.getByRole("button", { name: "Play First preview" });
  const second = page.getByRole("button", { name: "Play Second preview" });

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("audio starts and stops inside the selected segment", async ({ page }) => {
  await page.goto("/en/works/audio-bounds-test");
  await page.getByRole("button", { name: "Play Bounded preview" }).click();
  await expect(page.locator("[data-current-seconds]")).toHaveAttribute(
    "data-current-seconds",
    /^(1[2-9]|[2-3][0-9]|4[0-2])$/,
  );
});
~~~

- [ ] **Step 2: Run test and verify failure**

~~~bash
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/media-playback.spec.ts
~~~

Expected result: FAIL because DirectAudioPreview is absent.

- [ ] **Step 3: Implement click-created WaveSurfer with native fallback**

DirectAudioPreview requirements:

1. Before click, do not create audio or WaveSurfer.
2. On first click, dynamically import wavesurfer.js.
3. Use url, height 72, waveColor #A9B3BC, progressColor #FF5C4D and cursorColor #FF5C4D.
4. Register pause callback with PlaybackCoordinator.
5. On ready, seek to startSeconds / duration.
6. On timeupdate, pause and seek to endSeconds when currentTime >= endSeconds.
7. On WaveSurfer load error, destroy it and render an audio element with preload="none", controls and no download attribute.
8. On component unmount, destroy instance and unregister.
9. Button aria-pressed reflects actual play state.

Core boundary function:

~~~ts
function enforcePreviewBounds(
  currentSeconds: number,
  startSeconds: number | null,
  endSeconds: number | null,
): "continue" | "stop" {
  if (endSeconds !== null && currentSeconds >= endSeconds) return "stop";
  if (startSeconds !== null && currentSeconds < startSeconds) return "stop";
  return "continue";
}
~~~

Do not add controlsList="nodownload" as the only protection; it may be added as a UI hint, but the design explicitly acknowledges streaming cannot prevent capture.

- [ ] **Step 4: Add styling and run complete media checks**

~~~css
.media-preview {
  border-top: 1px solid color-mix(in srgb, var(--color-cool-gray) 35%, transparent);
  padding-block: 1rem;
}

.media-preview button {
  min-inline-size: 44px;
  min-block-size: 44px;
}

.media-waveform {
  min-block-size: 72px;
  overflow: hidden;
}

@media (max-width: 767px) {
  .media-waveform {
    min-block-size: 56px;
  }
}
~~~

~~~bash
npm run test:unit -- tests/unit/media-url.test.ts tests/unit/playback-coordinator.test.ts
npm run test:worker -- tests/worker/media-repository.test.ts
PREVIEW_URL="${PREVIEW_URL}" npm run test:e2e -- tests/e2e/media-privacy.spec.ts tests/e2e/media-playback.spec.ts
~~~

Expected result: PASS. Simulate missing CORS and confirm native fallback appears without an uncaught error.

- [ ] **Step 5: Commit and open PR**

Cloud commit message: feat: add bounded waveform audio previews.

Create PR codex/03-media-preview → main. Include a Preview work item for each adapter and document which URL becomes an external link. Merge only after single-playback, privacy and fallback tests pass.
