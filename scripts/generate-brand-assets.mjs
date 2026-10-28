/**
 * Static brand assets (WP4 §4.10; docs/design-system.md §7.3): the default
 * share card and the site icons in `public/`, rasterized with the Playwright
 * Chromium the e2e suites already install.
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Run by hand and commit the output; never in CI. Only pinned packages are
 * used (`playwright-core`, the Archivo variable font from
 * `@fontsource-variable/archivo`). The output is deterministic: fixed phases,
 * no randomness. Every image carries only the wordmark `KAMEL` or the
 * letter `K`; no other text.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const OUT = "public";
const FONT_FILE =
  "node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2";
const FONT_FAMILY = "Archivo Variable";

// Copied from app/styles/tokens.css.
const COLORS = {
  bg: "#090D12", // --color-bg
  text: "#E8EDF2", // --color-text
  accent: "#A7C7E7", // --color-accent
};

/** The share card: 1200 × 630, the hero line field and a centred wordmark. */
const CARD = { file: "og/kamel-default.png", width: 1200, height: 630 };

/** Square icons: cap height as a share of the side (maskable keeps 40%). */
const ICONS = [
  { file: "icons/icon-32.png", side: 32, cap: 0.58 },
  { file: "apple-touch-icon.png", side: 180, cap: 0.58 },
  { file: "icons/icon-192.png", side: 192, cap: 0.58 },
  { file: "icons/icon-512.png", side: 512, cap: 0.58 },
  { file: "icons/icon-maskable-512.png", side: 512, cap: 0.4 },
];

function page(fontBase64, width, height) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "${FONT_FAMILY}";
  font-style: normal;
  font-weight: 100 900;
  font-stretch: 62% 125%;
  src: url(data:font/woff2;base64,${fontBase64}) format("woff2");
}
html, body { margin: 0; padding: 0; background: ${COLORS.bg}; }
canvas { display: block; }
</style>
</head>
<body><canvas id="art" width="${width}" height="${height}"></canvas></body>
</html>`;
}

/**
 * Runs in the page. Helpers are inlined because Playwright serializes only
 * this function's source.
 */
async function draw({ kind, width, height, colors, family, cap }) {
  const WEIGHT = 780;
  const fontAt = (size) => `${WEIGHT} ${size}px "${family}"`;
  await document.fonts.load(`expanded ${fontAt(100)}`);
  await document.fonts.ready;

  const canvas = document.getElementById("art");
  const ctx = canvas.getContext("2d");
  const rgb = (hex) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const rgba = (hex, alpha) => `rgba(${rgb(hex).join(", ")}, ${alpha})`;
  const setFont = (size, letterSpacing = 0) => {
    ctx.font = fontAt(size);
    ctx.fontStretch = "expanded"; // 125%
    ctx.letterSpacing = `${letterSpacing}px`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  // Font check: Archivo is loaded and the expanded width applies.
  setFont(100);
  const expanded = ctx.measureText("KAMEL").width;
  ctx.fontStretch = "normal";
  const normal = ctx.measureText("KAMEL").width;
  if (!(expanded > normal * 1.1) || !document.fonts.check(fontAt(100))) {
    throw new Error(`archivo_not_loaded ${expanded} ${normal}`);
  }

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  if (kind === "icon") {
    // Cap height as a share of the side; the carrier line sits under the
    // baseline at full width; the group is centred, nudged up 1% (optical).
    setFont(100);
    const unit = ctx.measureText("K").actualBoundingBoxAscent / 100;
    const size = (cap * width) / unit;
    setFont(size);
    const k = ctx.measureText("K");
    const capHeight = k.actualBoundingBoxAscent;
    const thickness = Math.max(1, Math.round(width / 48));
    const group = capHeight + thickness;
    const baseline = Math.round(
      (height - group) / 2 + capHeight - height * 0.01,
    );
    const x =
      width / 2 - (k.actualBoundingBoxRight - k.actualBoundingBoxLeft) / 2;
    ctx.fillStyle = rgba(colors.accent, 0.6);
    ctx.fillRect(0, baseline, width, thickness);
    ctx.fillStyle = colors.text;
    ctx.fillText("K", x, baseline);
    return { size, capHeight, baseline, thickness };
  }

  // Share card. Page field (design-system §2.3): two radial gradients.
  const radial = (cx, cy, rx, ry, color, alpha, stop) => {
    ctx.save();
    ctx.translate(cx * width, cy * height);
    ctx.scale(rx * width, ry * height);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const [r, g, b] = color;
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
    gradient.addColorStop(stop, `rgba(${r}, ${g}, ${b}, 0)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  };
  radial(0.88, -0.12, 1.1, 0.7, [22, 30, 40], 0.55, 0.62);
  radial(-0.08, 1.08, 0.8, 0.55, [15, 21, 29], 0.7, 0.7);

  // Wordmark metrics: baseline on field line 14 (y = 392).
  const SPACING = 28;
  const LINES = 21; // y = 28 … 588
  const CARRIER = 14;
  const baseline = CARRIER * SPACING;
  const WORDMARK = 220;
  setFont(WORDMARK, -0.035 * WORDMARK);
  const mark = ctx.measureText("KAMEL");
  const capTop = baseline - mark.actualBoundingBoxAscent;
  const markX =
    width / 2 - (mark.actualBoundingBoxRight - mark.actualBoundingBoxLeft) / 2;

  // Line field (design-system §7.2): straight on the left, an envelope that
  // smoothsteps from 45% to 70% of the width, two sines with fixed per-line
  // phases (small steps between neighbours, so lines never cross). Lines in
  // the wordmark band stay straight; the bottom 15% fades out.
  const amplitude = 0.6 * SPACING;
  const smoothstep = (a, b, value) => {
    const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const fade = (y) =>
    y <= 0.85 * height ? 1 : Math.max(0, (height - y) / (0.15 * height));
  for (let line = 1; line <= LINES; line += 1) {
    if (line === CARRIER) continue;
    const y = line * SPACING;
    const straight = y >= capTop - SPACING && y <= baseline;
    ctx.strokeStyle = rgba(colors.text, 0.12 * fade(y));
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const envelope = straight
        ? 0
        : amplitude * smoothstep(0.45 * width, 0.7 * width, x);
      const turn = (x / width) * 2 * Math.PI;
      const wave =
        0.62 * Math.sin(turn * 2.3 + 0.35 * line) +
        0.38 * Math.sin(turn * 5.1 + 0.55 * line + 1.3);
      const py = y + 0.5 + envelope * wave;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  // Carrier line under the wordmark baseline: the one accent element, 2px.
  ctx.fillStyle = rgba(colors.accent, 0.6);
  ctx.fillRect(0, baseline, width, 2);

  ctx.fillStyle = colors.text;
  ctx.fillText("KAMEL", markX, baseline);
  return { capTop, baseline, markX, advance: mark.width };
}

function paeth(left, up, corner) {
  const p = left + up - corner;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - corner);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Chromium screenshots carry an alpha channel. Every asset is opaque, so it
 * is re-encoded as truecolour without alpha, after checking that alpha is 255
 * everywhere (iOS fills transparent icon areas black).
 */
function toOpaquePng(png) {
  const chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  const header = chunks.find((item) => item.type === "IHDR")?.data;
  if (!header) throw new Error("png_without_ihdr");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colourType = header[9];
  const interlace = header[12];
  if (depth !== 8 || interlace !== 0) throw new Error("png_unexpected_format");
  if (colourType === 2) return png;
  if (colourType !== 6) throw new Error(`png_colour_type_${colourType}`);

  const raw = inflateSync(
    Buffer.concat(
      chunks.filter((item) => item.type === "IDAT").map((item) => item.data),
    ),
  );
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, corner);
      else if (filter !== 0) throw new Error(`png_filter_${filter}`);
      pixels[y * stride + x] = (raw[row + x] + predictor) & 0xff;
    }
  }

  const outStride = width * 3;
  const rgb = Buffer.alloc(height * outStride);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    if (pixels[i + 3] !== 255) throw new Error("png_not_opaque");
    rgb[j] = pixels[i];
    rgb[j + 1] = pixels[i + 1];
    rgb[j + 2] = pixels[i + 2];
  }
  // Every row uses the Paeth filter (compact on gradients and flat fields).
  const filtered = Buffer.alloc(height * (outStride + 1));
  for (let y = 0; y < height; y += 1) {
    filtered[y * (outStride + 1)] = 4;
    for (let x = 0; x < outStride; x += 1) {
      const left = x >= 3 ? rgb[y * outStride + x - 3] : 0;
      const up = y > 0 ? rgb[(y - 1) * outStride + x] : 0;
      const corner = x >= 3 && y > 0 ? rgb[(y - 1) * outStride + x - 3] : 0;
      filtered[y * (outStride + 1) + 1 + x] =
        (rgb[y * outStride + x] - paeth(left, up, corner)) & 0xff;
    }
  }

  const ihdr = Buffer.from(header);
  ihdr[9] = 2;
  return Buffer.concat([
    png.subarray(0, 8),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filtered, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container: ICONDIR, one ICONDIRENTRY, then the 32 × 32 PNG. */
function ico(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(32, 6); // width
  header.writeUInt8(32, 7); // height
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, png]);
}

async function save(file, bytes) {
  const path = join(OUT, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`${path} ${bytes.length} bytes`);
}

async function render(browser, fontBase64, width, height, options) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const tab = await context.newPage();
  await tab.setContent(page(fontBase64, width, height));
  const facts = await tab.evaluate(draw, {
    ...options,
    width,
    height,
    colors: COLORS,
    family: FONT_FAMILY,
  });
  const png = toOpaquePng(await tab.screenshot({ type: "png" }));
  await context.close();
  return { png, facts };
}

const fontBase64 = (await readFile(FONT_FILE)).toString("base64");
const browser = await chromium.launch();
try {
  const card = await render(browser, fontBase64, CARD.width, CARD.height, {
    kind: "card",
  });
  console.log(CARD.file, JSON.stringify(card.facts));
  await save(CARD.file, card.png);
  for (const icon of ICONS) {
    const result = await render(browser, fontBase64, icon.side, icon.side, {
      kind: "icon",
      cap: icon.cap,
    });
    console.log(icon.file, JSON.stringify(result.facts));
    await save(icon.file, result.png);
    if (icon.side === 32) await save("favicon.ico", ico(result.png));
  }
} finally {
  await browser.close();
}
