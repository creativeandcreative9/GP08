import { makeRng } from './util';

/**
 * Small 2D-canvas painting helpers for the procedurally painted sprites (leafatlas.ts, leafflora.ts, petals.ts).
 * Colours are [r, g, b] in 0..255; everything is deterministic (seeded generators), so every run paints the same atlas.
 */

export type Ctx2D = CanvasRenderingContext2D;
export type Rng = () => number;
export type C3 = readonly [number, number, number];
export type Ramp = readonly (readonly [number, C3])[];

export const TAU = Math.PI * 2;

export const css = (c: C3, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix3 = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const tint3 = (c: C3, k: number): C3 => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** Piecewise-linear colour ramp: `t` 0..1 runs through the stops. */
export function ramp(stops: Ramp, t: number): C3 {
  const v = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (v <= b[0]) {
      const a = stops[i - 1]!;
      return mix3(a[1], b[1], (v - a[0]) / Math.max(1e-6, b[0] - a[0]));
    }
  }
  return stops[stops.length - 1]![1];
}

/** A random number generator for one sprite. */
export const spriteRng = (seed: number): Rng => makeRng(0x9e3779b1 ^ Math.imul(seed, 2654435761));

/** Gaussian-ish random number (sum of three uniforms), roughly -1..1. */
export const gauss = (r: Rng): number => (r() + r() + r() - 1.5) / 1.5;

// ---- silhouettes: unions of discs, from which dots (flowers, leaves) are scattered -------------------------------------

export interface Lobe {
  x: number;
  y: number;
  r: number;
}

/** `n` overlapping discs around the centre of a w x h cell: the body of a cluster. */
export function makeLobes(w: number, h: number, rng: Rng, n: number, spread: number, rMin: number, rMax: number): Lobe[] {
  const out: Lobe[] = [{ x: w / 2, y: h * 0.52, r: w * (rMax + rMin) * 0.5 }];
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * TAU + rng() * 0.9;
    const d = w * spread * (0.5 + rng() * 0.5);
    out.push({ x: w / 2 + Math.cos(a) * d, y: h * 0.52 + Math.sin(a) * d * 0.85, r: w * (rMin + rng() * (rMax - rMin)) });
  }
  return out;
}

/** Depth inside the union of the discs in px (positive inside, negative outside). */
export function depthIn(lobes: readonly Lobe[], x: number, y: number): number {
  let best = -1e9;
  for (const l of lobes) best = Math.max(best, l.r - Math.hypot(x - l.x, y - l.y));
  return best;
}

export interface Dot {
  x: number;
  y: number;
  /** Depth inside the body (px): small at the rim, large in the middle. */
  s: number;
  /** -1 at the top of the body ... +1 at its bottom. */
  ny: number;
}

/**
 * Scatters `count` dots over the body: inside always, a little beyond the rim with falling probability, never closer
 * than `spacing` px to another dot and never nearer than `margin` px to the cell border.
 */
export function scatterDots(lobes: readonly Lobe[], w: number, h: number, rng: Rng, count: number, margin: number, spacing: number, overhang: number): Dot[] {
  const out: Dot[] = [];
  let top = h;
  let bot = 0;
  for (const l of lobes) {
    top = Math.min(top, l.y - l.r);
    bot = Math.max(bot, l.y + l.r);
  }
  const cy = (top + bot) / 2;
  const half = Math.max(1, (bot - top) / 2);
  const sp2 = spacing * spacing;
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const x = margin + rng() * (w - 2 * margin);
    const y = margin + rng() * (h - 2 * margin);
    const s = depthIn(lobes, x, y);
    const p = s > 0 ? 1 : s > -overhang ? (1 + s / overhang) * 0.5 : 0;
    if (rng() >= p) continue;
    let ok = true;
    for (let i = out.length - 1; i >= 0 && ok; i--) {
      const o = out[i]!;
      const dx = o.x - x;
      const dy = o.y - y;
      if (dx * dx + dy * dy < sp2) ok = false;
    }
    if (ok) out.push({ x, y, s, ny: (y - cy) / half });
  }
  // interior first, rim last: the outermost dots lie on top and keep their whole outline
  out.sort((a, b) => b.s - a.s);
  return out;
}

// ---- strokes and shapes -------------------------------------------------------------------------------------------------

/** A thin branch: a slightly curved, tapering stroke, dark with a lighter side. */
export function twig(g: Ctx2D, x0: number, y0: number, x1: number, y1: number, w: number, dark: C3, light: C3, bend = 0): void {
  const mx = (x0 + x1) / 2 + (y1 - y0) * bend;
  const my = (y0 + y1) / 2 - (x1 - x0) * bend;
  g.lineCap = 'round';
  g.strokeStyle = css(dark);
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(mx, my, x1, y1);
  g.stroke();
  g.strokeStyle = css(light, 0.55);
  g.lineWidth = Math.max(1, w * 0.35);
  g.beginPath();
  g.moveTo(x0 - w * 0.15, y0 - w * 0.15);
  g.quadraticCurveTo(mx - w * 0.15, my - w * 0.15, x1 - w * 0.15, y1 - w * 0.15);
  g.stroke();
}

/** One leaf pointing along +x from its base at (x, y): `len` long, `wid` wide, with a midrib and a lit upper edge. */
export function leaf(
  g: Ctx2D, x: number, y: number, len: number, wid: number, rot: number, col: C3,
  shape: 'oval' | 'pointed' | 'round' = 'oval', vein = 0.22,
): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  if (shape === 'pointed') {
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.42, -wid * 0.95, len, 0);
    g.quadraticCurveTo(len * 0.42, wid * 0.95, 0, 0);
  } else if (shape === 'round') {
    g.ellipse(len * 0.5, 0, len * 0.5, wid * 0.5, 0, 0, TAU);
  } else {
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.12, -wid * 0.75, len * 0.7, -wid * 0.7, len, 0);
    g.bezierCurveTo(len * 0.7, wid * 0.7, len * 0.12, wid * 0.75, 0, 0);
  }
  g.closePath();
  g.fillStyle = css(col);
  g.fill();
  // lit upper edge and the midrib
  g.lineWidth = Math.max(1, wid * 0.1);
  g.strokeStyle = css(tint3(col, 1.28), 0.5);
  g.stroke();
  if (vein > 0) {
    g.lineWidth = Math.max(1, wid * 0.07);
    g.strokeStyle = css(tint3(col, 0.62), vein);
    g.beginPath();
    g.moveTo(len * 0.04, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
  }
  g.restore();
}

/** A curved, tapering blade of grass from (x0, y0) to its tip (x1, y1); `bend` pushes the middle sideways. */
export function blade(g: Ctx2D, x0: number, y0: number, x1: number, y1: number, bend: number, w0: number, base: C3, tip: C3): void {
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const pts: [number, number, number][] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1, w0 * 0.5 * Math.pow(1 - t, 0.8)]);
  }
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i]!;
    g[i === 0 ? 'moveTo' : 'lineTo'](p[0] + nx * p[2], p[1] + ny * p[2]);
  }
  for (let i = n; i >= 0; i--) {
    const p = pts[i]!;
    g.lineTo(p[0] - nx * p[2], p[1] - ny * p[2]);
  }
  g.closePath();
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, css(base));
  gr.addColorStop(1, css(tip));
  g.fillStyle = gr;
  g.fill();
}

/** A round soft-edged flower of `n` petals (cosmos, pansy, nemophila, daisy): petals are ellipses around the centre. */
export function flower(
  g: Ctx2D, x: number, y: number, R: number, rot: number, n: number, petal: C3, centre: C3, o: { wide?: number; rim?: C3; dot?: C3 } = {},
): void {
  const wide = o.wide ?? 0.46;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineWidth = Math.max(1, R * 0.07);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    g.beginPath();
    g.ellipse(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.5, R * wide * (5 / n) ** 0.5 * 0.9, a, 0, TAU);
    g.fillStyle = css(petal);
    g.fill();
    if (o.rim) {
      g.strokeStyle = css(o.rim, 0.55);
      g.stroke();
    }
  }
  g.beginPath();
  g.arc(0, 0, R * 0.2, 0, TAU);
  g.fillStyle = css(centre);
  g.fill();
  if (o.dot) {
    g.fillStyle = css(o.dot, 0.9);
    g.beginPath();
    g.arc(0, 0, R * 0.09, 0, TAU);
    g.fill();
  }
  g.restore();
}
