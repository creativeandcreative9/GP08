/** Polylines addressed by arc length, for cars and pedestrians (pure maths, no Babylon). */

export interface Pt {
  x: number;
  z: number;
}

/** Scratch result of {@link Path.at}: position and unit tangent (the direction of increasing arc length). */
export interface PathPt {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

export const newPathPt = (): PathPt => ({ x: 0, z: 0, tx: 1, tz: 0 });

/**
 * A polyline resampled at most `step` apart with smoothed tangents, addressed by arc length from its start.
 * The left-hand normal of the travel direction is (-tz, tx), the same convention as `samplePolyline` in the town.
 */
export class Path {
  readonly n: number;
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  readonly ss: Float64Array;
  readonly length: number;

  constructor(pts: readonly Pt[], step = 20) {
    // resample, keeping the original vertices
    const px: number[] = [];
    const pz: number[] = [];
    const ps: number[] = [];
    let s = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const k = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < k; j++) {
        px.push(a.x + ((b.x - a.x) * j) / k);
        pz.push(a.z + ((b.z - a.z) * j) / k);
        ps.push(s + (len * j) / k);
      }
      s += len;
    }
    const last = pts[pts.length - 1]!;
    px.push(last.x);
    pz.push(last.z);
    ps.push(s);
    const n = px.length;
    this.n = n;
    this.xs = Float64Array.from(px);
    this.zs = Float64Array.from(pz);
    this.ss = Float64Array.from(ps);
    this.length = s;
    this.tx = new Float64Array(n);
    this.tz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let dx = px[b]! - px[a]!;
      let dz = pz[b]! - pz[a]!;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
    }
  }

  /** Index i of the sample interval [ss[i], ss[i+1]] holding s (clamped). `hint` is a previous result: searching starts there. */
  find(s: number, hint = 0): number {
    const ss = this.ss;
    let i = hint < 0 ? 0 : hint > this.n - 2 ? this.n - 2 : hint;
    while (i > 0 && ss[i]! > s) i--;
    while (i < this.n - 2 && ss[i + 1]! <= s) i++;
    return i;
  }

  /** Position and tangent at arc length s (clamped to the path) written to `out`. Returns the interval index (a hint for the next call). */
  at(s: number, out: PathPt, hint = 0): number {
    const i = this.find(s, hint);
    const s0 = this.ss[i]!;
    const d = this.ss[i + 1]! - s0;
    let u = d > 1e-9 ? (s - s0) / d : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    out.x = this.xs[i]! + (this.xs[i + 1]! - this.xs[i]!) * u;
    out.z = this.zs[i]! + (this.zs[i + 1]! - this.zs[i]!) * u;
    let tx = this.tx[i]! + (this.tx[i + 1]! - this.tx[i]!) * u;
    let tz = this.tz[i]! + (this.tz[i + 1]! - this.tz[i]!) * u;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.tx = tx;
    out.tz = tz;
    return i;
  }

  /** Arc length of the point of the path nearest to (x,z). */
  project(x: number, z: number): number {
    let best = Infinity;
    let bs = 0;
    for (let i = 0; i + 1 < this.n; i++) {
      const ax = this.xs[i]!;
      const az = this.zs[i]!;
      const dx = this.xs[i + 1]! - ax;
      const dz = this.zs[i + 1]! - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) {
        best = d;
        bs = this.ss[i]! + (this.ss[i + 1]! - this.ss[i]!) * t;
      }
    }
    return bs;
  }
}

/** The part of a polyline between arc lengths s0 and s1 (both clamped), with interpolated end points. */
export function polylineWindow(pts: readonly Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const e = s + len;
    if (e > s0 && s < s1 && len > 0) {
      const u0 = Math.max(0, (s0 - s) / len);
      const u1 = Math.min(1, (s1 - s) / len);
      if (out.length === 0) out.push({ x: a.x + (b.x - a.x) * u0, z: a.z + (b.z - a.z) * u0 });
      out.push({ x: a.x + (b.x - a.x) * u1, z: a.z + (b.z - a.z) * u1 });
    }
    s = e;
  }
  return out;
}

export function polylineLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z);
  return s;
}
