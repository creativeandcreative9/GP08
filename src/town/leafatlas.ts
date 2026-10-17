import { CELLS, CELL_MARGIN, LEAF_H, LEAF_W, type CellName } from './leafcells';
import { FLORA } from './leafflora';
import {
  TAU, clamp01, css, depthIn, gauss, leaf, makeLobes, mix3, ramp, scatterDots, spriteRng, tint3, twig,
  type C3, type Ctx2D, type Ramp, type Rng,
} from './paint';

/**
 * Paints the foliage atlas (layout in leafcells.ts) procedurally: cherry-blossom clusters of many small five-petal
 * flowers (white, pale pink, pink, a few deeper), hanging sprays and flowering twigs, fallen-petal patches, leaf
 * clusters for hedges and tree crowns, and (leafflora.ts) grass, clover, weeds, flower beds, pot plants and ivy.
 *
 * The picture has an alpha channel (sprites are cut out by alpha test); transparent texels get the average colour
 * of their sprite, so that filtering and mip-mapping never pull a dark fringe into the edges.
 */

export const BLOOM: Ramp = [
  [0.0, [212, 104, 150]],
  [0.22, [236, 146, 182]],
  [0.45, [248, 184, 208]],
  [0.7, [253, 218, 230]],
  [0.88, [255, 240, 246]],
  [1.0, [255, 252, 253]],
];
const BARK_DK: C3 = [84, 62, 56];
const BARK_LT: C3 = [150, 120, 106];

/** A cherry flower of radius R: five notched petals, deeper pink at the heart, a few stamens. */
export function sakura(g: Ctx2D, x: number, y: number, R: number, rot: number, light: number, r: Rng): void {
  const col = ramp(BLOOM, light);
  const rim = ramp(BLOOM, light - 0.3);
  const deep = ramp(BLOOM, 0.04);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1, R * 0.075);
  for (let k = 0; k < 5; k++) {
    g.rotate(TAU / 5);
    g.beginPath();
    g.moveTo(R * 0.05, 0);
    g.bezierCurveTo(R * 0.25, -R * 0.56, R * 0.92, -R * 0.62, R, -R * 0.14);
    g.lineTo(R * 0.88, 0);
    g.lineTo(R, R * 0.14);
    g.bezierCurveTo(R * 0.92, R * 0.62, R * 0.25, R * 0.56, R * 0.05, 0);
    g.closePath();
    g.fillStyle = css(r() < 0.25 ? mix3(col, rim, 0.25) : col);
    g.fill();
    g.strokeStyle = css(rim, 0.6);
    g.stroke();
  }
  g.fillStyle = css(deep, 0.5);
  g.beginPath();
  g.arc(0, 0, R * 0.3, 0, TAU);
  g.fill();
  g.fillStyle = css(deep, 0.75);
  g.beginPath();
  g.arc(0, 0, R * 0.16, 0, TAU);
  g.fill();
  g.fillStyle = css([255, 222, 150], 0.95);
  for (let k = 0; k < 5; k++) {
    const a = r() * TAU;
    g.beginPath();
    g.arc(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, Math.max(0.8, R * 0.05), 0, TAU);
    g.fill();
  }
  g.restore();
}

interface BloomOpts {
  /** Mean brightness of the flowers (0 = deep pink ... 1 = white). */
  base: number;
  spread: number;
  R: readonly [number, number];
  count: number;
  lobes: number;
  twigs: number;
  /** Young reddish leaves peeking out between the flowers. */
  leaves: number;
}

/** A soft cloud of cherry flowers on a few dark twigs: lit on top, deep pink underneath and at the heart. */
function bloomCluster(g: Ctx2D, w: number, h: number, r: Rng, o: BloomOpts): void {
  const lobes = makeLobes(w, h, r, o.lobes, 0.2, 0.15, 0.21);
  // backing: keeps the body closed, so that only the rim is ragged
  for (const l of lobes) {
    g.fillStyle = css(ramp(BLOOM, 0.1));
    g.beginPath();
    g.arc(l.x, l.y, l.r * 0.66, 0, TAU);
    g.fill();
  }
  // dark twigs that show between the flowers
  for (let i = 0; i < o.twigs; i++) {
    const x0 = w * (0.5 + (r() - 0.5) * 0.3);
    const y0 = h * (0.7 + r() * 0.12);
    let x1 = x0;
    let y1 = y0;
    for (let k = 0; k < 40; k++) {
      x1 = w * (0.18 + r() * 0.64);
      y1 = h * (0.2 + r() * 0.55);
      if (depthIn(lobes, x1, y1) > 12) break;
    }
    twig(g, x0, y0, x1, y1, 3.5 + r() * 2.5, BARK_DK, BARK_LT, (r() - 0.5) * 0.4);
  }
  // young leaves
  for (let i = 0; i < o.leaves; i++) {
    const l = lobes[Math.floor(r() * lobes.length)]!;
    const a = r() * TAU;
    const px = l.x + Math.cos(a) * l.r * (0.5 + r() * 0.35);
    const py = l.y + Math.sin(a) * l.r * (0.5 + r() * 0.35);
    leaf(g, px, py, 26 + r() * 10, 11 + r() * 4, a, r() < 0.65 ? [150 + r() * 24, 84 + r() * 20, 74] : [122 + r() * 20, 120 + r() * 20, 70], 'pointed', 0.3);
  }
  const margin = CELL_MARGIN + o.R[1] + 2;
  const dots = scatterDots(lobes, w, h, r, o.count, margin, o.R[0] * 0.82, o.R[0] * 0.75);
  for (const d of dots) {
    const edge = 1 - clamp01(d.s / (0.17 * w));
    const light = o.base + 0.34 * -d.ny + 0.18 * (edge - 0.35) + (r() - 0.5) * o.spread;
    sakura(g, d.x, d.y, o.R[0] + r() * (o.R[1] - o.R[0]), r() * TAU, light, r);
  }
  // soft shading over the whole cluster: lit on top, cool and deeper underneath
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, h * 0.12, 0, h * 0.92);
  gr.addColorStop(0, 'rgba(255,255,255,0.12)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(130,55,105,0.22)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

/** A flowering branch from p0 to p1 with groups of flowers along it and short side twigs (sprays, twigs). */
function bloomBranch(
  g: Ctx2D, w: number, h: number, r: Rng,
  p0: readonly [number, number], p1: readonly [number, number], bend: number, groups: number, o: { base: number; R: readonly [number, number]; deepEnd?: boolean },
): void {
  const mx = (p0[0] + p1[0]) / 2 + (p1[1] - p0[1]) * bend;
  const my = (p0[1] + p1[1]) / 2 - (p1[0] - p0[0]) * bend;
  const at = (t: number): [number, number] => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * mx + t * t * p1[0], u * u * p0[1] + 2 * u * t * my + t * t * p1[1]];
  };
  twig(g, p0[0], p0[1], p1[0], p1[1], 6.5, BARK_DK, BARK_LT, bend);
  const flowers: { x: number; y: number; R: number; light: number }[] = [];
  for (let i = 0; i < groups; i++) {
    const t = 0.08 + (0.9 * (i + r() * 0.6)) / groups;
    const [bx, by] = at(t);
    const side = r() < 0.5 ? -1 : 1;
    const len = 16 + r() * 26;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    const gx = bx + (-dy / l) * side * len;
    const gy = by + (dx / l) * side * len;
    twig(g, bx, by, gx, gy, 3.2, BARK_DK, BARK_LT, (r() - 0.5) * 0.5);
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const a = r() * TAU;
      const d = (k === 0 ? 0 : 10 + r() * 14) * (o.R[1] / 14);
      flowers.push({ x: gx + Math.cos(a) * d, y: gy + Math.sin(a) * d, R: o.R[0] + r() * (o.R[1] - o.R[0]), light: o.base + (r() - 0.5) * 0.4 - (o.deepEnd ? t * 0.2 : 0) });
    }
  }
  // the tip carries a last bunch
  const [tx, ty] = at(1);
  for (let k = 0; k < 4; k++) flowers.push({ x: tx + (r() - 0.5) * 22, y: ty + (r() - 0.5) * 22, R: o.R[0] + r() * (o.R[1] - o.R[0]), light: o.base + (r() - 0.5) * 0.3 });
  for (const f of flowers) {
    const m = CELL_MARGIN + f.R + 1;
    sakura(g, Math.min(w - m, Math.max(m, f.x)), Math.min(h - m, Math.max(m, f.y)), f.R, r() * TAU, f.light, r);
  }
}

// ---- fallen petals --------------------------------------------------------------------------------------------------

const PETAL_TONES: readonly C3[] = [
  [255, 246, 249],
  [253, 232, 240],
  [250, 214, 228],
  [245, 192, 212],
  [238, 168, 196],
  [210, 160, 160],
];

/** A single fallen petal lying flat: rounded, with the notch at its tip and a deeper base. */
function fallenPetal(g: Ctx2D, x: number, y: number, len: number, rot: number, col: C3): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.18, -len * 0.58, len * 0.95, -len * 0.5, len, -len * 0.1);
  g.lineTo(len * 0.89, 0);
  g.lineTo(len, len * 0.1);
  g.bezierCurveTo(len * 0.95, len * 0.5, len * 0.18, len * 0.58, 0, 0);
  g.closePath();
  g.fillStyle = css(col);
  g.fill();
  g.lineWidth = Math.max(1, len * 0.07);
  g.strokeStyle = css(tint3(col, 0.82), 0.6);
  g.stroke();
  g.fillStyle = css(tint3(col, 0.8), 0.55);
  g.beginPath();
  g.ellipse(len * 0.14, 0, len * 0.14, len * 0.1, 0, 0, TAU);
  g.fill();
  g.restore();
}

function petalTone(r: Rng, deep: number): C3 {
  const t = r();
  if (t < 0.3 - deep * 0.2) return PETAL_TONES[0]!;
  if (t < 0.58 - deep * 0.1) return PETAL_TONES[1]!;
  if (t < 0.8) return PETAL_TONES[2]!;
  if (t < 0.93) return PETAL_TONES[3]!;
  if (t < 0.985) return PETAL_TONES[4]!;
  return PETAL_TONES[5]!;
}

/** Petals scattered with a gaussian falloff around (cx, cy): thick in the middle, a ragged sparse rim. */
function petalDrift(
  g: Ctx2D, w: number, h: number, r: Rng,
  o: { cx: number; cy: number; sx: number; sy: number; n: number; size: readonly [number, number]; wave?: number; deep: number },
): void {
  const m = CELL_MARGIN + o.size[1] + 2;
  for (let i = 0; i < o.n; i++) {
    let x = o.cx + gauss(r) * o.sx;
    let y = o.cy + gauss(r) * o.sy + (o.wave ? Math.sin((x / w) * 6.3) * o.wave * h : 0);
    x = Math.min(w - m, Math.max(m, x));
    y = Math.min(h - m, Math.max(m, y));
    fallenPetal(g, x, y, o.size[0] + r() * (o.size[1] - o.size[0]), r() * TAU, petalTone(r, o.deep));
  }
}

// ---- leaf clusters ------------------------------------------------------------------------------------------------------

interface FoliageOpts {
  cols: Ramp;
  base: number;
  spread: number;
  len: readonly [number, number];
  /** Width as a share of the length. */
  wid: number;
  count: number;
  lobes: number;
  shape: 'oval' | 'pointed' | 'round' | 'fan';
  /** Flowers among the leaves (azalea). */
  flowers?: { cols: readonly C3[]; n: number; R: number };
  /** A light smear on each leaf (glossy evergreen). */
  gloss?: boolean;
}

/** A fan-shaped ginkgo leaf with its notch and radiating veins; its stalk is at (x, y), it opens along `rot`. */
function ginkgoLeaf(g: Ctx2D, x: number, y: number, len: number, rot: number, col: C3): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, 0);
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = -1.0 + (2.0 * i) / steps;
    const rr = len * (1 - 0.2 * Math.exp(-((a / 0.13) ** 2)));
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = css(col);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = css(tint3(col, 0.7), 0.5);
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(i * 0.3) * len * 0.92, Math.sin(i * 0.3) * len * 0.92);
    g.stroke();
  }
  g.strokeStyle = css(tint3(col, 1.25), 0.5);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, len * 0.97, -0.95, 0.95);
  g.stroke();
  g.restore();
}

function foliageCluster(g: Ctx2D, w: number, h: number, r: Rng, o: FoliageOpts): void {
  const lobes = makeLobes(w, h, r, o.lobes, 0.16, 0.17, 0.23);
  for (const l of lobes) {
    g.fillStyle = css(ramp(o.cols, 0.05));
    g.beginPath();
    g.arc(l.x, l.y, l.r * 0.72, 0, TAU);
    g.fill();
  }
  const margin = CELL_MARGIN + o.len[1] * 0.6;
  const dots = scatterDots(lobes, w, h, r, o.count, margin, o.len[0] * 0.28, o.len[0] * 0.5);
  for (const d of dots) {
    const edge = 1 - clamp01(d.s / (0.2 * w));
    const light = o.base + 0.32 * -d.ny + 0.22 * (edge - 0.35) + (r() - 0.5) * o.spread;
    const col = ramp(o.cols, light);
    const len = o.len[0] + r() * (o.len[1] - o.len[0]);
    // leaves mostly point away from the middle of the cluster
    const l0 = lobes[0]!;
    const out = Math.atan2(d.y - l0.y, d.x - l0.x);
    const rot = out + (r() - 0.5) * 2.2;
    if (o.shape === 'fan') ginkgoLeaf(g, d.x, d.y, len, rot, col);
    else {
      leaf(g, d.x, d.y, len, len * o.wid, rot, col, o.shape);
      if (o.gloss && r() < 0.5) {
        g.save();
        g.translate(d.x, d.y);
        g.rotate(rot);
        g.strokeStyle = css([235, 250, 225], 0.32);
        g.lineWidth = Math.max(1.2, len * 0.08);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(len * 0.25, -len * o.wid * 0.18);
        g.lineTo(len * 0.62, -len * o.wid * 0.22);
        g.stroke();
        g.restore();
      }
    }
  }
  if (o.flowers) {
    const fl = scatterDots(lobes, w, h, r, o.flowers.n, margin, o.flowers.R * 1.2, o.flowers.R * 0.4);
    for (const d of fl) {
      const c = o.flowers.cols[Math.floor(r() * o.flowers.cols.length)]!;
      const R = o.flowers.R * (0.8 + r() * 0.4);
      g.save();
      g.translate(d.x, d.y);
      g.rotate(r() * TAU);
      for (let k = 0; k < 5; k++) {
        g.rotate(TAU / 5);
        g.beginPath();
        g.ellipse(R * 0.5, 0, R * 0.52, R * 0.42, 0, 0, TAU);
        g.fillStyle = css(tint3(c, 0.95 + r() * 0.1));
        g.fill();
      }
      g.fillStyle = css(tint3(c, 0.62), 0.8);
      g.beginPath();
      g.arc(0, 0, R * 0.2, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  // soft shading: lit on top, darker below
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, h * 0.1, 0, h * 0.95);
  gr.addColorStop(0, 'rgba(255,255,230,0.10)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(10,40,30,0.30)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

const GREENS: Record<string, Ramp> = {
  dark: [[0, [22, 64, 36]], [0.5, [46, 108, 54]], [1, [112, 168, 84]]],
  mid: [[0, [38, 92, 40]], [0.5, [74, 138, 56]], [1, [150, 200, 96]]],
  fresh: [[0, [62, 112, 46]], [0.5, [116, 168, 68]], [1, [192, 224, 112]]],
  light: [[0, [52, 110, 44]], [0.5, [98, 156, 64]], [1, [178, 214, 106]]],
  yellow: [[0, [108, 138, 38]], [0.5, [166, 190, 52]], [1, [228, 228, 104]]],
  broad: [[0, [34, 88, 40]], [0.5, [68, 128, 54]], [1, [140, 188, 90]]],
  glossy: [[0, [30, 78, 42]], [0.55, [62, 124, 58]], [1, [166, 204, 100]]],
};

type Painter = (g: Ctx2D, w: number, h: number, r: Rng) => void;

const bloomOf = (base: number, spread: number, R: [number, number], count: number): Painter => (g, w, h, r) =>
  bloomCluster(g, w, h, r, { base, spread, R, count, lobes: 7, twigs: 3, leaves: 6 });

const PAINTERS: Partial<Record<CellName, Painter>> = {
  bloomA: bloomOf(0.78, 0.34, [12, 17], 300),
  bloomB: bloomOf(0.56, 0.36, [12, 17], 300),
  bloomC: bloomOf(0.3, 0.34, [12, 17], 290),
  bloomD: (g, w, h, r) => bloomCluster(g, w, h, r, { base: 0.55, spread: 0.85, R: [11, 16], count: 320, lobes: 8, twigs: 4, leaves: 10 }),
  bloomE: (g, w, h, r) => bloomCluster(g, w, h, r, { base: 0.7, spread: 0.4, R: [13, 19], count: 230, lobes: 6, twigs: 3, leaves: 12 }),
  sprayA: (g, w, h, r) => bloomBranch(g, w, h, r, [w * 0.46, 10], [w * 0.58, h - 34], 0.12, 11, { base: 0.62, R: [11, 15], deepEnd: true }),
  sprayB: (g, w, h, r) => bloomBranch(g, w, h, r, [w * 0.6, 10], [w * 0.4, h - 40], -0.14, 10, { base: 0.5, R: [11, 15], deepEnd: true }),
  twigA: (g, w, h, r) => bloomBranch(g, w, h, r, [20, h * 0.78], [w - 40, h * 0.3], 0.1, 10, { base: 0.66, R: [11, 15] }),
  twigB: (g, w, h, r) => bloomBranch(g, w, h, r, [w - 20, h * 0.74], [48, h * 0.28], -0.12, 10, { base: 0.5, R: [11, 15] }),
  petalsA: (g, w, h, r) => {
    petalDrift(g, w, h, r, { cx: w * 0.46, cy: h * 0.5, sx: w * 0.2, sy: h * 0.18, n: 190, size: [17, 23], deep: 0.3 });
    petalDrift(g, w, h, r, { cx: w * 0.58, cy: h * 0.44, sx: w * 0.16, sy: h * 0.2, n: 110, size: [16, 22], deep: 0.4 });
  },
  petalsB: (g, w, h, r) => petalDrift(g, w, h, r, { cx: w * 0.5, cy: h * 0.5, sx: w * 0.25, sy: h * 0.12, n: 150, size: [15, 21], wave: 0.1, deep: 0.3 }),
  petalsC: (g, w, h, r) => {
    for (let i = 0; i < 60; i++) {
      const m = CELL_MARGIN + 24;
      fallenPetal(g, m + r() * (w - 2 * m), m + r() * (h - 2 * m), 16 + r() * 7, r() * TAU, petalTone(r, 0.4));
    }
  },
  hedgeA: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.dark!, base: 0.55, spread: 0.45, len: [26, 34], wid: 0.5, count: 200, lobes: 5, shape: 'oval', gloss: true }),
  hedgeB: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.mid!, base: 0.55, spread: 0.45, len: [24, 30], wid: 0.46, count: 210, lobes: 5, shape: 'pointed' }),
  hedgeC: (g, w, h, r) =>
    foliageCluster(g, w, h, r, {
      cols: GREENS.dark!, base: 0.5, spread: 0.45, len: [18, 24], wid: 0.45, count: 230, lobes: 5, shape: 'pointed',
      flowers: { cols: [[222, 72, 142], [240, 118, 170], [250, 190, 214], [214, 60, 120]], n: 30, R: 14 },
    }),
  hedgeD: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.fresh!, base: 0.55, spread: 0.45, len: [18, 24], wid: 0.7, count: 260, lobes: 5, shape: 'round' }),
  zelkova: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.light!, base: 0.55, spread: 0.5, len: [20, 27], wid: 0.5, count: 230, lobes: 6, shape: 'pointed' }),
  ginkgo: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.yellow!, base: 0.55, spread: 0.5, len: [30, 38], wid: 1, count: 120, lobes: 6, shape: 'fan' }),
  leafBroad: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.broad!, base: 0.55, spread: 0.45, len: [40, 52], wid: 0.55, count: 70, lobes: 5, shape: 'oval' }),
  camphor: (g, w, h, r) => foliageCluster(g, w, h, r, { cols: GREENS.glossy!, base: 0.55, spread: 0.55, len: [22, 30], wid: 0.42, count: 200, lobes: 6, shape: 'pointed', gloss: true }),
  ...FLORA,
};

export interface AtlasImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Gives the transparent texels of every sprite the sprite's average colour (no dark fringes when filtered). */
function bleed(img: ImageData): void {
  const d = img.data;
  for (const name of Object.keys(CELLS) as CellName[]) {
    const c = CELLS[name];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sa = 0;
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const i = (y * LEAF_W + x) * 4;
        const a = d[i + 3]!;
        if (a < 200) continue;
        sr += d[i]!;
        sg += d[i + 1]!;
        sb += d[i + 2]!;
        sa++;
      }
    }
    if (sa === 0) continue;
    const ar = Math.round(sr / sa);
    const ag = Math.round(sg / sa);
    const ab = Math.round(sb / sa);
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const i = (y * LEAF_W + x) * 4;
        if (d[i + 3]! < 3) {
          d[i] = ar;
          d[i + 1] = ag;
          d[i + 2] = ab;
        }
      }
    }
  }
}

/** Paints the whole atlas (needs a DOM canvas) and returns its pixels. */
/** Lift only the cool, saturated petal colours; preserve alpha, twigs, leaves and every other atlas cell. */
function softenBlossomColors(data: Uint8ClampedArray): void {
  for (const name of ['bloomA', 'bloomB', 'bloomC', 'bloomD', 'bloomE'] as const) {
    const c = CELLS[name];
    for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
      const i = (y * LEAF_W + x) * 4, red = data[i]!, green = data[i + 1]!, blue = data[i + 2]!;
      if (red > green * 1.05 && blue > green && blue >= red * .65) {
        data[i + 1] = Math.round(green + (red - green) * .3);
        data[i + 2] = Math.round(blue + (red - blue) * .15);
      }
    }
  }
}

export function paintLeafAtlas(): AtlasImage {
  const cv = document.createElement('canvas');
  cv.width = LEAF_W;
  cv.height = LEAF_H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, LEAF_W, LEAF_H);
  (Object.keys(CELLS) as CellName[]).forEach((name, i) => {
    const paint = PAINTERS[name];
    if (!paint) return;
    const c = CELLS[name];
    g.save();
    g.beginPath();
    g.rect(c.x + CELL_MARGIN, c.y + CELL_MARGIN, c.w - 2 * CELL_MARGIN, c.h - 2 * CELL_MARGIN);
    g.clip();
    g.translate(c.x, c.y);
    paint(g, c.w, c.h, spriteRng(i + 1));
    g.restore();
  });
  const img = g.getImageData(0, 0, LEAF_W, LEAF_H);
  bleed(img);
  softenBlossomColors(img.data);
  return { width: LEAF_W, height: LEAF_H, data: img.data };
}
