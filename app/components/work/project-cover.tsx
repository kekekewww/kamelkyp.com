import { useMemo } from "react";
import type { PublicImage } from "../../lib/cms/public/view-models";
import { getSiteCopy } from "../../lib/i18n/copy";
import type { Locale } from "../../lib/i18n/locale";

/**
 * Project cover (design-system §7.1).
 *
 * `cover` present → the real image (object-fit: cover; focal point through
 * `focal-x-* focal-y-*` classes). `cover: null` (no image, or a missing
 * asset) → a server-rendered procedural <svg>, seeded from the slug, whose
 * *structure* is keyed to the primary category slug (never its colour). No
 * canvas, no JS, no inline style attributes: geometry lives in SVG
 * attributes, colour and size in app/styles/components.css via classes and
 * data attributes. Works under CSP and reduced motion.
 */

/** `hero` = 21:9 on lg+, 16:9 below (project detail). */
export type CoverAspect = "3:2" | "4:3" | "4:5" | "16:9" | "21:9" | "hero";

const W = 1200;
const H = 800;

type Pattern = "trace" | "lattice" | "contour" | "wave" | "spectrum";

/** Keyed by `project_category` term slug; new categories draw a trace. */
const PATTERN_BY_CATEGORY: Readonly<Record<string, Pattern>> = {
  software: "trace",
  ai: "lattice",
  interactive: "contour",
  "creative-technology": "lattice",
  music: "wave",
  mixing: "wave",
  research: "spectrum",
};

/** FNV-1a 32-bit hash of the slug. */
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small deterministic PRNG, identical on server and client. */
function seeded(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value);
const opacity = (value: number) => Math.round(value * 100) / 100;

interface Stroke {
  d: string;
  opacity: number;
}

interface Ring {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

interface CoverGeometry {
  strokes: Stroke[];
  rings: Ring[];
  /** Round-capped zero-length segments: the point lattice. */
  dots: string | null;
}

/** software: orthogonal step lines on the 12-column rhythm (a schematic trace). */
function traceGeometry(random: () => number): CoverGeometry {
  const column = W / 12;
  const row = H / 20;
  const count = 7 + Math.floor(random() * 4);
  const strokes: Stroke[] = [];
  for (let index = 0; index < count; index += 1) {
    let y = row * (2 + Math.floor(random() * 16));
    let x = 0;
    let d = `M0 ${y}`;
    while (x < W) {
      x = Math.min(W, x + column * (1 + Math.floor(random() * 3)));
      d += `H${x}`;
      if (x >= W) break;
      const step = row * (1 + Math.floor(random() * 3));
      y = Math.max(row, Math.min(H - row, y + (random() < 0.5 ? -step : step)));
      d += `V${y}`;
    }
    strokes.push({ d, opacity: opacity(0.1 + random() * 0.12) });
  }
  return { strokes, rings: [], dots: null };
}

/** ai: point lattice whose density rises along a diagonal. */
function latticeGeometry(random: () => number): CoverGeometry {
  const pitch = 40;
  const flip = random() < 0.5;
  let dots = "";
  for (let y = pitch / 2; y < H; y += pitch) {
    for (let x = pitch / 2; x < W; x += pitch) {
      const along = flip ? 1 - x / W : x / W;
      const density = (along + (1 - y / H)) / 2;
      if (random() < density ** 2.2 + 0.03) dots += `M${x} ${y}h0`;
    }
  }
  return { strokes: [], rings: [], dots };
}

/** interactive: concentric contour lines around one or two off-centre foci. */
function contourGeometry(random: () => number): CoverGeometry {
  const rings: Ring[] = [];
  const foci = random() < 0.5 ? 1 : 2;
  for (let focus = 0; focus < foci; focus += 1) {
    const cx = round(W * (0.22 + random() * 0.56));
    const cy = round(H * (0.25 + random() * 0.5));
    const count = focus === 0 ? 12 + Math.floor(random() * 5) : 6;
    const step = 34 + random() * 18;
    for (let index = 1; index <= count; index += 1) {
      rings.push({
        cx,
        cy,
        r: round(index * step + random() * 6),
        opacity: opacity(0.22 - (index / count) * 0.12),
      });
    }
  }
  return { strokes: [], rings, dots: null };
}

/** music / mixing: 24–40 horizontal waveform traces (the hero language). */
function waveGeometry(random: () => number): CoverGeometry {
  const count = 24 + Math.floor(random() * 9);
  const points = 32;
  const stepX = W / points;
  const top = H * 0.1;
  const span = H * 0.8;
  const f1 = 1.5 + random() * 2;
  const f2 = 4 + random() * 3;
  const strokes: Stroke[] = [];
  for (let index = 0; index < count; index += 1) {
    const y0 = top + (span * index) / (count - 1);
    const centre = 1 - Math.abs(index / (count - 1) - 0.5) * 2;
    const amplitude = 6 + centre * 34 * (0.6 + random() * 0.4);
    const phase = random() * Math.PI * 2;
    // Relative segments keep the SSR markup small.
    let d = `M0 ${round(y0)}l`;
    let previous = round(y0);
    for (let point = 1; point <= points; point += 1) {
      const t = point / points;
      const envelope = Math.sin(Math.PI * t) ** 2;
      const y = round(
        y0 +
          amplitude *
            envelope *
            (0.62 * Math.sin(t * f1 * Math.PI * 2 + phase) +
              0.38 * Math.sin(t * f2 * Math.PI * 2 + phase * 1.7)),
      );
      d += `${point === 1 ? "" : " "}${stepX} ${y - previous}`;
      previous = y;
    }
    strokes.push({ d, opacity: opacity(0.1 + centre * 0.12) });
  }
  return { strokes, rings: [], dots: null };
}

/** research: vertical spectrogram bars of varying height at a 2px pitch. */
function spectrumGeometry(random: () => number): CoverGeometry {
  const pitch = 4;
  const bands = 3 + Math.floor(random() * 3);
  let level = 0.3;
  let loud = "";
  let quiet = "";
  for (let x = pitch / 2; x < W; x += pitch) {
    level += (random() - 0.5) * 0.12;
    level = Math.max(0.08, Math.min(0.62, level));
    const band = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * bands);
    const height = round(H * Math.min(0.86, level * 0.7 + band * 0.24));
    const segment = `M${x} ${H}V${H - height}`;
    if (band > 0.6) loud += segment;
    else quiet += segment;
  }
  return {
    strokes: [
      { d: quiet, opacity: 0.1 },
      { d: loud, opacity: 0.2 },
    ],
    rings: [],
    dots: null,
  };
}

const GEOMETRY: Record<Pattern, (random: () => number) => CoverGeometry> = {
  trace: traceGeometry,
  lattice: latticeGeometry,
  contour: contourGeometry,
  wave: waveGeometry,
  spectrum: spectrumGeometry,
};

export function coverPattern(category: string | null | undefined): Pattern {
  return (category && PATTERN_BY_CATEGORY[category]) || "trace";
}

/** Exported for tests: deterministic geometry for a slug + category. */
export function coverGeometry(
  slug: string,
  category: string | null | undefined,
): CoverGeometry {
  return GEOMETRY[coverPattern(category)](seeded(hashSlug(slug)));
}

function ProceduralCover({
  slug,
  category,
}: {
  slug: string;
  category: string | null | undefined;
}) {
  const geometry = useMemo(
    () => coverGeometry(slug, category),
    [slug, category],
  );
  return (
    <svg
      className="project-cover__art"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {geometry.strokes.map((stroke, index) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered geometry
          key={index}
          className="project-cover__line"
          d={stroke.d}
          strokeOpacity={stroke.opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {geometry.rings.map((ring, index) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered geometry
          key={index}
          className="project-cover__line"
          cx={ring.cx}
          cy={ring.cy}
          r={ring.r}
          strokeOpacity={ring.opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {geometry.dots ? (
        <path
          className="project-cover__dots"
          d={geometry.dots}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export function ProjectCover({
  slug,
  category,
  cover,
  index,
  placeholder = false,
  showBadge = false,
  aspect = "4:3",
  locale,
  className,
  decorative = true,
  priority = false,
}: {
  slug: string;
  /** Primary category slug: drives the procedural pattern. */
  category: string | null | undefined;
  cover: PublicImage | null;
  /** 1-based index shown as the numeral on procedural covers. */
  index?: number;
  placeholder?: boolean;
  /** Draw the PLACEHOLDER badge top-left (feature, detail hero, preview). */
  showBadge?: boolean;
  aspect?: CoverAspect;
  locale: Locale;
  className?: string;
  /** Decorative covers (rows, previews) get an empty alt. */
  decorative?: boolean;
  /** The first above-the-fold cover loads eagerly (content-architecture §4.5). */
  priority?: boolean;
}) {
  const classes = ["project-cover", className].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      data-aspect={aspect}
      data-pattern={cover ? undefined : coverPattern(category)}
    >
      {cover ? (
        <img
          className={["project-cover__image", cover.focalClass]
            .filter(Boolean)
            .join(" ")}
          src={cover.src}
          srcSet={cover.srcSet}
          sizes={cover.sizes}
          width={cover.width}
          height={cover.height}
          alt={decorative ? "" : cover.alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      ) : (
        <ProceduralCover slug={slug} category={category} />
      )}
      {!cover && index !== undefined ? (
        <span className="project-cover__numeral" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
      ) : null}
      {placeholder && showBadge ? (
        <span className="project-cover__badge badge-placeholder">
          {getSiteCopy(locale).badgePlaceholder}
        </span>
      ) : null}
    </div>
  );
}
