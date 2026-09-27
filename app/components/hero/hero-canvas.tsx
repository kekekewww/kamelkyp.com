import { type RefObject, useEffect, useRef } from "react";
import type { LevelSource } from "../../lib/media/playback-coordinator";
import { follow, readLevel, readLowBand } from "../../lib/motion/audio-level";
import { loop, scheduleWrite } from "../../lib/motion/frame";
import { observe } from "../../lib/motion/observe";
import {
  type MotionTier,
  useMotionTier,
} from "../../lib/motion/reduced-motion";
import { lerpFactor } from "../../lib/motion/tokens";
import { usePlayback } from "../media/playback-provider";

/**
 * Hero canvas: "the measured line" (docs/motion-system.md §4, design-system §7.2).
 *
 * A field of horizontal lines: straight (and not drawn) over the text columns,
 * turning into slow waveforms toward the right. SSR ships the same field as a
 * static inline SVG (t = 0, fixed seed); the canvas mounts over it, draws that
 * static frame synchronously, and only loops while the hero is on screen, the
 * tab is visible and the motion tier is not "static". No `style` attributes:
 * size comes from CSS, the backing store from the canvas width/height props.
 */

export const FIELD_SEED = 0x4b414d; // "KAM"

export type FieldMode = "wide" | "band";

export interface FieldParams {
  lines: number;
  /** Sample step along x, CSS px. */
  step: number;
  /** Base amplitude, CSS px. */
  amp: number;
}

/** §4.2: full 28 / 8 / 14; lite 16 (12 < 480px) / 12 / 10. */
export function fieldParams(
  tier: MotionTier,
  viewportWidth: number,
  degraded = false,
): FieldParams {
  if (viewportWidth >= 1024 && tier === "full" && !degraded) {
    return { lines: 28, step: 8, amp: 14 };
  }
  if (viewportWidth >= 1024 && tier === "static") {
    return { lines: 28, step: 8, amp: 14 };
  }
  return { lines: viewportWidth < 480 ? 12 : 16, step: 12, amp: 10 };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const NOISE = (() => {
  const rand = mulberry32(FIELD_SEED ^ 0x9e3779b9);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) table[i] = rand() * 2 - 1;
  return table;
})();

/** Value noise in [-1, 1] with smoothstep interpolation (§4.6). */
function noise1D(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  const a = NOISE[floor & 255];
  const b = NOISE[(floor + 1) & 255];
  const s = frac * frac * (3 - 2 * frac);
  return a + (b - a) * s;
}

/** §4.3: two slow sines plus value noise. */
export function wave(
  u: number,
  t: number,
  k: number,
  phase: number,
  index: number,
): number {
  const tau = Math.PI * 2;
  return (
    0.5 * Math.sin(tau * (1.6 * k * u + 0.031 * t) + phase) +
    0.3 * Math.sin(tau * (3.1 * k * u - 0.047 * t) + 1.7 * phase) +
    0.2 * noise1D(u * 4 + index * 0.37 + t * 0.061)
  );
}

/**
 * Envelope over x (§4.1). Wide: near zero over the text columns, growing to
 * the right with a quiet crest near 0.78W. Band (stacked mobile layout): full
 * across x with an 8% fade at both edges.
 */
export function envelope(u: number, mode: FieldMode): number {
  if (mode === "band") {
    return smoothstep(0, 0.08, u) * smoothstep(0, 0.08, 1 - u);
  }
  const crest = 0.8 + 0.2 * Math.exp(-(((u - 0.78) / 0.1) ** 2));
  return smoothstep(0.3, 0.62, u) * crest;
}

const SKIP = 255;
/** Envelope zones: alpha multiplier per zone (lines fade in toward the right). */
const ZONE_ALPHA = [0.3, 0.62, 0.92] as const;

export interface FieldGeometry {
  w: number;
  h: number;
  mode: FieldMode;
  n: number;
  amp: number;
  points: number;
  xs: Float32Array;
  env: Float32Array;
  /** Envelope zone per sample (0–2) or SKIP where env < 0.05. */
  zone: Uint8Array;
  baseY: Float32Array;
  phase: Float32Array;
  k: Float32Array;
  /** Centre-weight bucket per line (0–3). */
  bucket: Uint8Array;
  centerY: number;
  accentIndex: number;
  /** Scratch buffer: n × points y values, reused every frame. */
  ys: Float32Array;
}

export function buildGeometry(
  w: number,
  h: number,
  params: FieldParams,
  mode: FieldMode,
): FieldGeometry {
  const n = params.lines;
  const points = Math.max(2, Math.ceil(w / params.step) + 1);
  const xs = new Float32Array(points);
  const env = new Float32Array(points);
  const zone = new Uint8Array(points);
  for (let j = 0; j < points; j += 1) {
    const x = Math.min(w, j * params.step);
    xs[j] = x;
    const e = envelope(w > 0 ? x / w : 0, mode);
    env[j] = e;
    zone[j] = e < 0.05 ? SKIP : e < 0.4 ? 0 : e < 0.75 ? 1 : 2;
  }

  const rand = mulberry32(FIELD_SEED);
  const baseY = new Float32Array(n);
  const phase = new Float32Array(n);
  const k = new Float32Array(n);
  const bucket = new Uint8Array(n);
  const spacing = mode === "wide" ? (0.6 * h) / n : h / (n + 1);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    baseY[i] =
      mode === "wide" ? 0.4 * h + (i + 0.5) * spacing : (i + 1) * spacing;
    phase[i] = rand() * Math.PI * 2;
    k[i] = 0.8 + 0.4 * rand();
    const centerWeight = n > 1 ? 1 - Math.abs((2 * i) / (n - 1) - 1) : 1;
    bucket[i] = Math.min(3, Math.floor(centerWeight * 4));
    sum += baseY[i];
  }

  return {
    w,
    h,
    mode,
    n,
    amp: mode === "band" ? Math.min(params.amp, spacing * 0.6) : params.amp,
    points,
    xs,
    env,
    zone,
    baseY,
    phase,
    k,
    bucket,
    centerY: sum / n,
    accentIndex: Math.floor(n * 0.62),
    ys: new Float32Array(n * points),
  };
}

export interface FieldFrame {
  t: number;
  gain: number;
  /** Smoothed cursor, 0–1 over the hero. */
  cx: number;
  cy: number;
  cursor: boolean;
  /** Scroll progress 0–1. */
  p: number;
}

export const STATIC_FRAME: FieldFrame = {
  t: 0,
  gain: 1,
  cx: 0.5,
  cy: 0.5,
  cursor: false,
  p: 0,
};

/** Fills `g.ys` for one frame (§4.3, §4.4). */
export function computeField(g: FieldGeometry, s: FieldFrame): void {
  const converge = 0.35 * s.p;
  for (let i = 0; i < g.n; i += 1) {
    const base = g.baseY[i] * (1 - converge) + g.centerY * converge;
    const row = i * g.points;
    const side = Math.sign(base / g.h - s.cy);
    const dy = base / g.h - s.cy;
    const bumpY = s.cursor ? Math.exp(-(dy * dy) / (2 * 0.18 * 0.18)) : 0;
    for (let j = 0; j < g.points; j += 1) {
      const e = g.env[j];
      if (e < 0.05) {
        g.ys[row + j] = base;
        continue;
      }
      const u = g.xs[j] / g.w;
      let y = base + g.amp * s.gain * e * wave(u, s.t, g.k[i], g.phase[i], i);
      if (bumpY > 0.001) {
        const d = u - s.cx;
        const bumpX = Math.exp(-(d * d) / (2 * 0.12 * 0.12));
        y += side * 18 * bumpX * bumpY * e;
      }
      g.ys[row + j] = y;
    }
  }
}

function tracePath(
  add: (x: number, y: number, move: boolean) => void,
  g: FieldGeometry,
  line: number,
  zoneFilter: number | null,
): void {
  const row = line * g.points;
  let started = false;
  for (let j = 0; j < g.points; j += 1) {
    const z = g.zone[j];
    if (z === SKIP || (zoneFilter !== null && z !== zoneFilter)) {
      started = false;
      continue;
    }
    if (!started) {
      const prev = j - 1;
      if (prev >= 0 && g.zone[prev] !== SKIP) {
        add(g.xs[prev], g.ys[row + prev], true);
        add(g.xs[j], g.ys[row + j], false);
      } else {
        add(g.xs[j], g.ys[row + j], true);
      }
      started = true;
    } else {
      add(g.xs[j], g.ys[row + j], false);
    }
  }
}

function lineAlpha(bucket: number, zone: number): number {
  // §4.1: 0.06 + 0.16 × centre weight (max 0.22), × envelope.
  return (0.06 + 0.16 * ((bucket + 0.5) / 4)) * ZONE_ALPHA[zone];
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface FieldColors {
  text: Rgb;
  accent: Rgb;
  audio: Rgb;
}

const FALLBACK_COLORS: FieldColors = {
  text: { r: 232, g: 237, b: 242 },
  accent: { r: 167, g: 199, b: 231 },
  audio: { r: 120, g: 139, b: 255 },
};

function parseHex(value: string, fallback: Rgb): Rgb {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function readColors(): FieldColors {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: parseHex(
      styles.getPropertyValue("--color-text"),
      FALLBACK_COLORS.text,
    ),
    accent: parseHex(
      styles.getPropertyValue("--color-accent"),
      FALLBACK_COLORS.accent,
    ),
    audio: parseHex(
      styles.getPropertyValue("--color-accent-2"),
      FALLBACK_COLORS.audio,
    ),
  };
}

const rgba = ({ r, g, b }: Rgb, a: number) =>
  `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;

function drawField(
  ctx: CanvasRenderingContext2D,
  g: FieldGeometry,
  s: FieldFrame,
  colors: FieldColors,
  playing: boolean,
): void {
  computeField(g, s);
  ctx.clearRect(0, 0, g.w, g.h);
  ctx.globalAlpha = 1 - 0.5 * s.p;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  const add = (x: number, y: number, move: boolean) =>
    move ? ctx.moveTo(x, y) : ctx.lineTo(x, y);

  // 4 centre buckets × 3 envelope zones, one stroke() each.
  for (let bucket = 0; bucket < 4; bucket += 1) {
    for (let zone = 0; zone < 3; zone += 1) {
      ctx.beginPath();
      for (let i = 0; i < g.n; i += 1) {
        if (i === g.accentIndex || g.bucket[i] !== bucket) continue;
        tracePath(add, g, i, zone);
      }
      ctx.strokeStyle = rgba(colors.text, lineAlpha(bucket, zone));
      ctx.stroke();
    }
  }

  // The view's single accent line (audio colour while playing).
  ctx.beginPath();
  tracePath(add, g, g.accentIndex, null);
  ctx.strokeStyle = playing
    ? rgba(colors.audio, 0.7)
    : rgba(colors.accent, 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---- Static SVG (SSR, no JS, reduced motion) ----

interface StaticPath {
  d: string;
  opacity: number;
  accent: boolean;
}

function staticPaths(
  w: number,
  h: number,
  params: FieldParams,
  mode: FieldMode,
): StaticPath[] {
  const g = buildGeometry(w, h, params, mode);
  computeField(g, STATIC_FRAME);
  const paths: StaticPath[] = [];
  const build = (line: number, zone: number | null) => {
    let d = "";
    tracePath(
      (x, y, move) => {
        d += `${move ? "M" : "L"}${Math.round(x)} ${y.toFixed(1)}`;
      },
      g,
      line,
      zone,
    );
    return d;
  };
  for (let bucket = 0; bucket < 4; bucket += 1) {
    for (let zone = 0; zone < 3; zone += 1) {
      let d = "";
      for (let i = 0; i < g.n; i += 1) {
        if (i === g.accentIndex || g.bucket[i] !== bucket) continue;
        d += build(i, zone);
      }
      if (d) {
        paths.push({
          d,
          opacity: Number(lineAlpha(bucket, zone).toFixed(3)),
          accent: false,
        });
      }
    }
  }
  paths.push({ d: build(g.accentIndex, null), opacity: 0.5, accent: true });
  return paths;
}

const WIDE_BOX = { w: 1440, h: 800 };
const BAND_BOX = { w: 400, h: 144 };
const STATIC_PARAMS: Record<FieldMode, FieldParams> = {
  wide: { lines: 28, step: 24, amp: 14 },
  band: { lines: 12, step: 16, amp: 10 },
};
const staticCache = new Map<FieldMode, StaticPath[]>();

function getStaticPaths(mode: FieldMode): StaticPath[] {
  const cached = staticCache.get(mode);
  if (cached) return cached;
  const box = mode === "wide" ? WIDE_BOX : BAND_BOX;
  const paths = staticPaths(box.w, box.h, STATIC_PARAMS[mode], mode);
  staticCache.set(mode, paths);
  return paths;
}

function StaticField({ mode }: { mode: FieldMode }) {
  const box = mode === "wide" ? WIDE_BOX : BAND_BOX;
  const paths = getStaticPaths(mode);
  return (
    <svg
      className={`hero-field__svg hero-field__svg--${mode}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: static, deterministic list
          key={index}
          className={path.accent ? "hero-field__accent" : "hero-field__line"}
          d={path.d}
          strokeOpacity={path.opacity}
        />
      ))}
    </svg>
  );
}

// ---- Component ----

export function HeroCanvas({
  heroRef,
}: {
  /** The hero section: pointer, scroll and visibility are read from it. */
  heroRef: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tier = useMotionTier();
  const playback = usePlayback();

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = readColors();
    const wideQuery = window.matchMedia("(min-width: 1024px)");
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    const animated = tier !== "static";
    const cursorOn =
      tier === "full" &&
      window.matchMedia("(pointer: fine) and (hover: hover)").matches;

    let geometry: FieldGeometry | null = null;
    let degraded = false;
    let visible = false;
    let stopped = false;
    let stopLoop: (() => void) | null = null;
    let source: LevelSource | null = playback.getLevelSource();
    let heroRect = hero.getBoundingClientRect();

    const state = {
      t: 0,
      cx: 0.5,
      cy: 0.5,
      tx: 0.5,
      ty: 0.5,
      p: 0,
      level: 0,
      low: 0,
      gain: 1,
      acc: 0,
      emaMs: 0,
      slowFrames: 0,
    };

    const dprFor = () => {
      const dpr = window.devicePixelRatio || 1;
      if (tier === "lite" || degraded) {
        const strong =
          (navigator.hardwareConcurrency ?? 0) >= 6 &&
          nav.connection?.saveData !== true;
        return strong && !degraded ? Math.min(dpr, 1.5) : 1;
      }
      return Math.min(dpr, 2);
    };

    const playing = () => source?.playing === true;

    const frame = (): FieldFrame =>
      animated
        ? {
            t: state.t,
            gain: state.gain * (1 - 0.6 * state.p),
            cx: state.cx,
            cy: state.cy,
            cursor: cursorOn,
            p: state.p,
          }
        : STATIC_FRAME;

    const render = () => {
      if (!geometry) return;
      const dpr = canvas.width / geometry.w;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawField(ctx, geometry, frame(), colors, playing());
      canvas.dataset.ready = "";
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = dprFor();
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const mode: FieldMode = wideQuery.matches ? "wide" : "band";
      geometry = buildGeometry(
        rect.width,
        rect.height,
        fieldParams(tier, window.innerWidth, degraded),
        mode,
      );
    };

    const tick = (_now: number, dt: number) => {
      // 30fps cap in lite, ~60fps cap on high-refresh displays.
      state.acc += dt;
      if (state.acc < (tier === "lite" || degraded ? 32 : 14)) return;
      const step = Math.min(state.acc, 64);
      state.acc = 0;
      const started = performance.now();

      heroRect = hero.getBoundingClientRect();
      state.p =
        heroRect.height > 0
          ? Math.max(0, Math.min(1, -heroRect.top / heroRect.height))
          : 0;

      if (cursorOn) {
        const kc = lerpFactor(0.06, step);
        state.cx += (state.tx - state.cx) * kc;
        state.cy += (state.ty - state.cy) * kc;
      }

      const analyser = source?.playing ? source.analyser : null;
      state.level = follow(
        state.level,
        analyser ? readLevel(analyser) : 0,
        step,
      );
      state.low = follow(state.low, analyser ? readLowBand(analyser) : 0, step);
      const targetGain =
        source?.playing && !source.analyser ? 1.35 : 1 + 1.2 * state.level;
      state.gain +=
        (Math.min(targetGain, 2.2) - state.gain) * lerpFactor(0.03, step);
      state.t += (step / 1000) * (1 + 0.25 * state.low);

      render();

      // Self-throttle (§4.6): 60 slow frames → lite params, then stop.
      const ms = performance.now() - started;
      state.emaMs = state.emaMs * 0.95 + ms * 0.05;
      state.slowFrames = state.emaMs > 6 ? state.slowFrames + 1 : 0;
      if (state.slowFrames >= 60) {
        state.slowFrames = 0;
        state.emaMs = 0;
        if (!degraded) {
          degraded = true;
          resize();
        } else {
          stopped = true;
          stopLoop = null;
          return false;
        }
      }
      return undefined;
    };

    const sync = () => {
      const shouldRun = animated && visible && !stopped;
      if (shouldRun && !stopLoop) {
        state.acc = 0;
        stopLoop = loop(tick);
      } else if (!shouldRun && stopLoop) {
        stopLoop();
        stopLoop = null;
      }
    };

    // Mount: size, seed, draw the static frame synchronously.
    resize();
    render();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() =>
            scheduleWrite(() => {
              resize();
              render();
            }),
          );
    resizeObserver?.observe(canvas);

    const unobserve = observe(hero, "canvas", (entry) => {
      visible = entry.isIntersecting;
      sync();
    });

    const unsubscribe = playback.subscribeLevel((next) => {
      const wasPlaying = playing();
      source = next;
      // Static tier / paused loop: redraw once on playback start and pause.
      if (!stopLoop && wasPlaying !== playing()) render();
    });

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || heroRect.width === 0) return;
      state.tx = (event.clientX - heroRect.left) / heroRect.width;
      state.ty = (event.clientY - heroRect.top) / heroRect.height;
    };
    const onPointerLeave = () => {
      state.tx = 0.5;
      state.ty = 0.5;
    };
    if (cursorOn) {
      hero.addEventListener("pointermove", onPointerMove, { passive: true });
      hero.addEventListener("pointerleave", onPointerLeave, { passive: true });
    }

    return () => {
      stopLoop?.();
      stopLoop = null;
      resizeObserver?.disconnect();
      unobserve();
      unsubscribe();
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      geometry = null;
    };
  }, [heroRef, tier, playback]);

  return (
    <div className="hero-field" aria-hidden="true">
      <StaticField mode="wide" />
      <StaticField mode="band" />
      <canvas ref={canvasRef} className="hero-canvas" width={0} height={0} />
    </div>
  );
}
