import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preflightUpload,
  UploadFailure,
  type UploadXhr,
  uploadFile,
} from "../../app/components/studio/media/upload-client";

const MB = 1024 * 1024;

function sizedFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(4)], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

type Script = (xhr: FakeXhr) => void;

class FakeXhr implements UploadXhr {
  static scripts: Script[] = [];
  static made: FakeXhr[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.made.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    const script = FakeXhr.scripts.shift();
    queueMicrotask(() => script?.(this));
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const summary = {
  id: "asset-1",
  kind: "audio",
  filename: "take.mp3",
  url: "https://media.example.test/media/2026/09/asset-1/take.mp3",
  alt: { zh: "", en: "" },
  state: "ready",
};

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.scripts = [];
  FakeXhr.made = [];
});

describe("upload preflight", () => {
  it("accepts an allowed file and returns its canonical type and kind", () => {
    expect(
      preflightUpload(sizedFile("Take.M4A", "audio/x-m4a", 3 * MB)),
    ).toEqual({ ok: true, kind: "audio", mimeType: "audio/mp4" });
  });

  it("explains refused types, sizes and kinds in plain words", () => {
    const svg = preflightUpload(sizedFile("logo.svg", "image/svg+xml", 10));
    expect(svg).toMatchObject({ ok: false });
    expect(!svg.ok && svg.message).toMatch(/not allowed/);

    const big = preflightUpload(sizedFile("mix.wav", "audio/wav", 120 * MB));
    expect(!big.ok && big.message).toBe(
      "mix.wav is 120.0 MB; audio uploads are limited to 95 MB. Register a YouTube or SoundCloud link for longer media.",
    );

    const kind = preflightUpload(sizedFile("a.mp3", "audio/mpeg", 10), "image");
    expect(!kind.ok && kind.message).toBe(
      "This field needs an image. a.mp3 is audio.",
    );

    const empty = preflightUpload(sizedFile("a.png", "image/png", 0));
    expect(!empty.ok && empty.message).toBe("a.png is empty.");
  });
});

describe("streamed upload client", () => {
  it("declares, streams with progress and returns the asset", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        assetId: "asset-1",
        uploadUrl: "/api/studio/media/asset-1/content",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    FakeXhr.scripts.push((xhr) => {
      xhr.upload.onprogress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
      xhr.respond(200, { asset: summary });
    });
    const progress = vi.fn();
    const file = sizedFile("take.mp3", "audio/mpeg", 100);

    const asset = await uploadFile(
      {
        file,
        mimeType: "audio/mpeg",
        kind: "audio",
        metadata: { durationMs: 1000 },
        title: { zh: "", en: "Take" },
        alt: { zh: "", en: "" },
      },
      { csrfToken: "t1", onProgress: progress, createXhr: () => new FakeXhr() },
    );
    expect(asset).toEqual(summary);
    expect(progress).toHaveBeenCalledWith(50, 100);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/studio/media");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      filename: "take.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 100,
      durationMs: 1000,
      title: { zh: "", en: "Take" },
      alt: { zh: "", en: "" },
      kind: "audio",
    });
    const xhr = FakeXhr.made[0];
    expect(xhr?.method).toBe("PUT");
    expect(xhr?.url).toBe("/api/studio/media/asset-1/content");
    expect(xhr?.headers).toMatchObject({
      "Content-Type": "audio/mpeg",
      "X-Studio-CSRF": "t1",
    });
    expect(xhr?.body).toBe(file);
  });

  it("surfaces the server's reason when the declaration is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(503, {
          code: "uploads_not_configured",
          message: "Uploads are off.",
        }),
      ),
    );
    const failure = await uploadFile(
      {
        file: sizedFile("a.png", "image/png", 10),
        mimeType: "image/png",
        metadata: {},
        title: { zh: "", en: "" },
        alt: { zh: "", en: "" },
      },
      { csrfToken: "t1", createXhr: () => new FakeXhr() },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UploadFailure);
    expect(failure).toMatchObject({
      code: "uploads_not_configured",
      status: 503,
      message: "Uploads are off.",
    });
  });

  it("refreshes the CSRF token once when the stream is refused with 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(201, {
          assetId: "asset-1",
          uploadUrl: "/api/studio/media/asset-1/content",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          csrfToken: "t2",
          csrfExpiresAt: "x",
          ownerEmail: "o",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    FakeXhr.scripts.push((xhr) => xhr.respond(403, {}));
    FakeXhr.scripts.push((xhr) => xhr.respond(200, { asset: summary }));
    const onToken = vi.fn();
    const asset = await uploadFile(
      {
        file: sizedFile("take.mp3", "audio/mpeg", 100),
        mimeType: "audio/mpeg",
        metadata: {},
        title: { zh: "", en: "" },
        alt: { zh: "", en: "" },
      },
      { csrfToken: "t1", onToken, createXhr: () => new FakeXhr() },
    );
    expect(asset.id).toBe("asset-1");
    expect(onToken).toHaveBeenCalledWith("t2");
    expect(FakeXhr.made.map((xhr) => xhr.headers["X-Studio-CSRF"])).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("reports a refused stream and a cancelled upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(201, {
          assetId: "asset-1",
          uploadUrl: "/api/studio/media/asset-1/content",
        }),
      ),
    );
    FakeXhr.scripts.push((xhr) =>
      xhr.respond(415, {
        code: "signature_mismatch",
        message: "The file contents do not match its type.",
      }),
    );
    const input = {
      file: sizedFile("a.png", "image/png", 10),
      mimeType: "image/png",
      metadata: {},
      title: { zh: "", en: "" },
      alt: { zh: "", en: "" },
    };
    await expect(
      uploadFile(input, { csrfToken: "t", createXhr: () => new FakeXhr() }),
    ).rejects.toMatchObject({
      code: "signature_mismatch",
      message: "The file contents do not match its type.",
    });

    const controller = new AbortController();
    FakeXhr.scripts.push(() => controller.abort());
    await expect(
      uploadFile(input, {
        csrfToken: "t",
        signal: controller.signal,
        createXhr: () => new FakeXhr(),
      }),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});
