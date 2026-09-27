/**
 * Web Audio amplitude plumbing (docs/motion-system.md §4.4, §4.5, §2.8).
 *
 * - One AudioContext per page, created lazily from a click handler only
 *   (never on load, so no autoplay warnings).
 * - Only CORS-enabled hosts are routed through Web Audio: routing a
 *   cross-origin element WITHOUT CORS through createMediaElementSource makes it
 *   play silence. Everything else reports playing state without an analyser.
 * - Readers reuse preallocated buffers; nothing allocates per frame.
 *
 * Consumers (hero canvas, player bars) get the analyser through
 * `usePlayback().subscribeLevel(listener)` / `getLevelSource()` on the
 * PlaybackCoordinator, then call `readLevel(analyser)` / `readBands(analyser, n)`
 * inside their own rAF loop.
 */

/**
 * May this audio URL be routed through Web Audio? Only same-origin URLs and
 * the hosts in the media configuration's CORS list (`MEDIA_CORS_HOSTS`,
 * `MediaConfig.corsHosts`) qualify: those send `Access-Control-Allow-Origin`.
 * No host is hard-coded here; the bucket host is added to the configuration
 * only after its CORS rule exists (content-architecture §4.6).
 */
export function isCorsAudioHost(
  url: string,
  corsHosts: Iterable<string>,
  origin: string | null = typeof location === "undefined"
    ? null
    : location.origin,
): boolean {
  try {
    const parsed = new URL(url, origin ?? undefined);
    if (origin && parsed.origin === origin) return true;
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    for (const allowed of corsHosts) {
      if (allowed.toLowerCase() === host) return true;
    }
    return false;
  } catch {
    return false;
  }
}

let context: AudioContext | null = null;
const attached = new WeakMap<HTMLMediaElement, AnalyserNode>();

/** Call from a user-gesture handler. Returns null where Web Audio is missing. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Routes `audio` → analyser → destination. Must be called from the click
 * handler that starts playback, after `audio.crossOrigin = "anonymous"` was
 * set before `audio.src`. Returns null when Web Audio is unavailable.
 */
export function attachAnalyser(audio: HTMLAudioElement): AnalyserNode | null {
  const existing = attached.get(audio);
  if (existing) return existing;
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    void ctx.resume();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    attached.set(audio, analyser);
    return analyser;
  } catch {
    return null;
  }
}

let timeBuffer: Float32Array<ArrayBuffer> | null = null;
let freqBuffer: Uint8Array<ArrayBuffer> | null = null;

function timeData(analyser: AnalyserNode): Float32Array<ArrayBuffer> {
  if (!timeBuffer || timeBuffer.length !== analyser.fftSize) {
    timeBuffer = new Float32Array(analyser.fftSize);
  }
  analyser.getFloatTimeDomainData(timeBuffer);
  return timeBuffer;
}

function freqData(analyser: AnalyserNode): Uint8Array<ArrayBuffer> {
  if (!freqBuffer || freqBuffer.length !== analyser.frequencyBinCount) {
    freqBuffer = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.getByteFrequencyData(freqBuffer);
  return freqBuffer;
}

/** RMS level mapped from −48…−12 dBFS to 0…1 (§4.4). */
export function readLevel(analyser: AnalyserNode): number {
  const data = timeData(analyser);
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
  const rms = Math.sqrt(sum / data.length);
  if (rms <= 0) return 0;
  const level = (20 * Math.log10(rms) + 48) / 36;
  return Math.max(0, Math.min(1, level));
}

/** Mean of the 40–250 Hz bins, 0…1 (drives the hero's bass "crest"). */
export function readLowBand(analyser: AnalyserNode): number {
  const data = freqData(analyser);
  const nyquist = analyser.context.sampleRate / 2;
  const binHz = nyquist / data.length;
  const from = Math.max(0, Math.floor(40 / binHz));
  const to = Math.min(data.length - 1, Math.ceil(250 / binHz));
  let sum = 0;
  for (let i = from; i <= to; i += 1) sum += data[i];
  return sum / ((to - from + 1) * 255);
}

/**
 * `count` log-spaced bands between 60 Hz and 8 kHz, each 0…1, written into
 * `out` (preallocate it once: `new Float32Array(32)`).
 */
export function readBands(
  analyser: AnalyserNode,
  out: Float32Array,
  minHz = 60,
  maxHz = 8000,
): Float32Array {
  const data = freqData(analyser);
  const nyquist = analyser.context.sampleRate / 2;
  const binHz = nyquist / data.length;
  const count = out.length;
  const ratio = maxHz / minHz;
  for (let band = 0; band < count; band += 1) {
    const lo = minHz * ratio ** (band / count);
    const hi = minHz * ratio ** ((band + 1) / count);
    const from = Math.min(data.length - 1, Math.floor(lo / binHz));
    const to = Math.min(data.length - 1, Math.max(from, Math.ceil(hi / binHz)));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += data[i];
    out[band] = sum / ((to - from + 1) * 255);
  }
  return out;
}

/**
 * Asymmetric envelope follower, frame-rate independent.
 * attack/release are per-60fps-frame factors (defaults from §4.4).
 */
export function follow(
  current: number,
  target: number,
  dtMs: number,
  attack = 0.35,
  release = 0.06,
): number {
  const perFrame = target > current ? attack : release;
  const k = 1 - (1 - perFrame) ** (dtMs / 16.667);
  return current + (target - current) * k;
}
