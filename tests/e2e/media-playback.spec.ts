import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

function writeAscii(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}

function createSilentWav(seconds = 45) {
  const sampleRate = 4000;
  const dataLength = seconds * sampleRate;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(bytes, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataLength, true);
  bytes.fill(128, 44);
  return Buffer.from(bytes);
}

test.beforeEach(async ({ page }) => {
  const audio = createSilentWav();
  await page.route("https://media.kamelkyp.com/e2e/*.wav", async (route) => {
    if (route.request().url().endsWith("fallback.wav")) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*" },
      body: audio,
    });
  });
});

test("starting a second direct audio pauses the first", async ({ page }) => {
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "media.kamelkyp.com") {
      audioRequests.push(request.url());
    }
  });

  await page.goto("/en/works/audio-test");
  expect(audioRequests).toEqual([]);
  await expect(page.locator("audio")).toHaveCount(0);

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
  const playButton = page.getByRole("button", {
    name: "Play Bounded preview",
  });
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-current-seconds]")).toHaveAttribute(
    "data-current-seconds",
    /^(1[2-9]|[2-3][0-9]|4[0-2])$/,
  );
});

test("waveform failure falls back to a non-preloading native player", async ({
  page,
}) => {
  const uncaughtErrors: string[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error.message));
  await page.goto("/en/works/audio-fallback-test");

  await page.getByRole("button", { name: "Play Fallback preview" }).click();

  const nativePlayer = page.locator("audio");
  await expect(nativePlayer).toBeVisible();
  await expect(nativePlayer).toHaveAttribute("preload", "none");
  expect(uncaughtErrors).toEqual([]);
});
