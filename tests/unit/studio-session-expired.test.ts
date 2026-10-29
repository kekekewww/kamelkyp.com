import { afterEach, describe, expect, it, vi } from "vitest";
import { studioSessionExpired } from "../../app/lib/cms/studio/session.client";

function stubFetch(result: unknown) {
  const fetchMock = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studioSessionExpired", () => {
  it("is true when Access answers with its login redirect", async () => {
    // A manual-redirect fetch exposes Access's 302 as an opaque response.
    stubFetch({ type: "opaqueredirect", status: 0, ok: false });
    expect(await studioSessionExpired()).toBe(true);
  });

  it("is true on a 403", async () => {
    stubFetch(new Response("{}", { status: 403 }));
    expect(await studioSessionExpired()).toBe(true);
  });

  it("is true on a 401", async () => {
    stubFetch(new Response("{}", { status: 401 }));
    expect(await studioSessionExpired()).toBe(true);
  });

  it("is false while the session is still valid", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    expect(await studioSessionExpired()).toBe(false);
  });

  it("is false when the check itself cannot reach the network", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect(await studioSessionExpired()).toBe(false);
  });

  it("does not follow redirects, so Access's 302 is not blocked by CORS", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }));
    await studioSessionExpired();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/studio/session");
    expect(init.redirect).toBe("manual");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
  });
});
