import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { DEC3_Y } from './ctx';
import { roadClearance } from './site';
import { heightAt } from './terrain';
import { clamp, hex, makeRng, mix, type RGB, type V3 } from './util';

type P3 = [number, number, number];
type Face = readonly [number, number, number];

const TRUNK = hex(0x6a4b3b);
const LEAF: RGB[] = [0x6cc060, 0x59b052, 0x7ccb6a, 0x4c9f4f].map(hex);

// ---- cherry colours (base albedo) -----------------------------------------------------------
/** Dark grey-brown bark: darker at the foot, a little lighter and warmer towards the twigs. */
const BARK_FOOT = hex(0x362e2b);
const BARK_TRUNK = hex(0x433834);
const BARK_LIMB = hex(0x54463f);
const BARK_TWIG = hex(0x66534a);
/** Blossom tones, from near-white pink on sunlit tops to deep pink in the shade underneath. */
const BLOSSOM_TOP: readonly [RGB, RGB] = [hex(0xfffafc), hex(0xfff0f6)];
const BLOSSOM_MID: readonly [RGB, RGB] = [hex(0xffdce9), hex(0xffc4da)];
const BLOSSOM_DEEP: readonly [RGB, RGB] = [hex(0xffa8cc), hex(0xf68cb8)];
/** Fallen petals. */
const PETAL_DEEP = hex(0xefaec5);
const PETAL_MID = hex(0xf6c8d8);
const PETAL_PALE = hex(0xfbdfe8);
const PETAL_WHITE = hex(0xfff1f5);

/** Fallen petals lie just above the other ground decals (DEC3_Y is the road-marking layer). */
const PETAL_Y = DEC3_Y + 0.15;

// ---- small vector helpers -------------------------------------------------------------------
const sub = (a: V3, b: V3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: V3, b: V3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Unit direction from an azimuth and an elevation (radians above the horizon). */
const dirOf = (az: number, el: number): P3 => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
const rad = (deg: number): number => (deg * Math.PI) / 180;
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const clampRGB = (c: RGB): RGB => [clamp(c[0], 0, 1), clamp(c[1], 0, 1), clamp(c[2], 0, 1)];
const tint = (c: RGB, m: number): RGB => clampRGB([c[0] * m, c[1] * m, c[2] * m]);

/** Deterministic per-tree random numbers (does not touch the shared stream, see addCherry). */
function treeRng(x: number, z: number): () => number {
  return makeRng((Math.imul(Math.round(x * 8) | 0, 73856093) ^ Math.imul(Math.round(z * 8) | 0, 19349663) ^ 0x2f1b3c5d) >>> 0);
}

// ---- indexed geometry -------------------------------------------------------------------------
/**
 * Smooth-shaded vertices are appended to the batch with shared indices (a vertex costs far less than the
 * three-vertices-per-triangle of the flat-shaded helpers). Returns the index of the first new vertex.
 */
function addVerts(b: MeshBatch, pos: readonly V3[], nor: readonly V3[], col: readonly RGB[]): number {
  const base = b.vertexCount;
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i]!;
    const n = nor[i]!;
    const c = col[i]!;
    b.pos.push(p[0], p[1], p[2]);
    b.nor.push(n[0], n[1], n[2]);
    b.col.push(c[0], c[1], c[2], 1);
    b.surf.push(0); // keeps the per-vertex surface tags aligned with the vertices
    if (b.withUV) b.uvs.push(0, 0);
  }
  return base;
}

/**
 * Adds a triangle between vertices i, j, k (relative to `base`). `ref` is a point inside the solid: the winding is
 * chosen like MeshBatch.tri does, so that the face is a front face when seen from outside.
 */
function addFace(b: MeshBatch, base: number, pos: readonly V3[], f: Face, ref: V3): void {
  const a = pos[f[0]]!;
  const bb = pos[f[1]]!;
  const c = pos[f[2]]!;
  const n = cross(sub(bb, a), sub(c, a));
  const cen: P3 = [(a[0] + bb[0] + c[0]) / 3 - ref[0], (a[1] + bb[1] + c[1]) / 3 - ref[1], (a[2] + bb[2] + c[2]) / 3 - ref[2]];
  if (dot(n, cen) > 0) b.idx.push(base + f[0], base + f[2], base + f[1]);
  else b.idx.push(base + f[0], base + f[1], base + f[2]);
}

/** Smooth vertex normals of a closed-ish solid, pointing away from `centre`. */
function smoothNormals(pos: readonly V3[], faces: readonly Face[], centre: V3): P3[] {
  const acc: P3[] = pos.map(() => [0, 0, 0]);
  for (const f of faces) {
    const n = cross(sub(pos[f[1]]!, pos[f[0]]!), sub(pos[f[2]]!, pos[f[0]]!));
    for (const i of f) {
      acc[i]![0] += n[0];
      acc[i]![1] += n[1];
      acc[i]![2] += n[2];
    }
  }
  return acc.map((n, i) => {
    const u = norm(n);
    const out = sub(pos[i]!, centre);
    return dot(u, out) < 0 ? [-u[0], -u[1], -u[2]] : u;
  });
}

// ---- limbs: tapered, smooth-shaded prisms along a polyline -----------------------------------
/**
 * A tapered prism along a polyline. Neighbouring segments share their rings (each ring is perpendicular to the
 * averaged tangent), so a bent limb has no cracks and costs only `sides` vertices per point. No end caps.
 */
function limb(b: MeshBatch, pts: readonly V3[], radii: readonly number[], sides: number, cols: readonly RGB[], r: () => number): void {
  const n = pts.length;
  const pos: P3[] = [];
  const nor: P3[] = [];
  const col: RGB[] = [];
  let u: P3 | undefined;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const c = pts[Math.min(n - 1, i + 1)]!;
    const t = norm(sub(c, a));
    if (!u) u = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    // parallel transport of the frame along the limb
    const d = dot(u, t);
    u = norm([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]);
    const v = cross(t, u);
    const base = cols[Math.min(i, cols.length - 1)]!;
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const co = Math.cos(ang);
      const si = Math.sin(ang);
      const nn: P3 = [u[0] * co + v[0] * si, u[1] * co + v[1] * si, u[2] * co + v[2] * si];
      pos.push([pts[i]![0] + nn[0] * radii[i]!, pts[i]![1] + nn[1] * radii[i]!, pts[i]![2] + nn[2] * radii[i]!]);
      nor.push(nn);
      // vertical streaks of slightly different brightness: rough bark
      col.push(tint(base, 0.9 + r() * 0.2));
    }
  }
  const first = addVerts(b, pos, nor, col);
  for (let i = 0; i + 1 < n; i++) {
    const ref = mixP(pts[i]!, pts[i + 1]!, 0.5);
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      const a = i * sides + j;
      const bb = i * sides + j1;
      const c = (i + 1) * sides + j1;
      const d = (i + 1) * sides + j;
      addFace(b, first, pos, [a, bb, c], ref);
      addFace(b, first, pos, [a, c, d], ref);
    }
  }
}

function mixP(a: V3, b: V3, t: number): P3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---- blossom clusters: lumpy, smooth-shaded icospheres ---------------------------------------
interface Solid {
  v: readonly P3[];
  f: readonly Face[];
}

const PHI = (1 + Math.sqrt(5)) / 2;
function icosphere(level: number): Solid {
  const v: P3[] = ([[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]).map(norm);
  let f: Face[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map<number, number>();
    const mid = (i: number, j: number): number => {
      const key = i < j ? i * 4096 + j : j * 4096 + i;
      let m = cache.get(key);
      if (m === undefined) {
        m = v.length;
        v.push(norm(mixP(v[i]!, v[j]!, 0.5)));
        cache.set(key, m);
      }
      return m;
    };
    const nf: Face[] = [];
    for (const [a, bb, c] of f) {
      const ab = mid(a, bb);
      const bc = mid(bb, c);
      const ca = mid(c, a);
      nf.push([a, ab, ca], [bb, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  return { v, f };
}
/** Level 0: 12 vertices (small bunches); level 1: 42 vertices (big masses). */
const SOLIDS: readonly Solid[] = [icosphere(0), icosphere(1)];

interface Tones {
  top: RGB;
  mid: RGB;
  deep: RGB;
}

/**
 * One lumpy blossom cluster: a low-poly sphere stretched into a flattened ellipsoid, pushed in and out by a few
 * smooth waves so that it looks like a cauliflower of flowers, with smooth shading. Vertex colours run from deep
 * pink underneath to near-white on top, with a little mottling. `sun` (0..1) sets how bright the cluster is overall
 * (clusters low and inside the canopy are deeper pink).
 */
function lump(
  b: MeshBatch, cx: number, cy: number, cz: number, radius: number, flat: number, level: 0 | 1,
  tones: Tones, sun: number, r: () => number,
): void {
  const solid = SOLIDS[level]!;
  const turn = r() * Math.PI * 2;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const rough = level === 1 ? 0.24 : 0.3;
  const waves = [0, 1, 2].map((i) => ({
    k: scl(norm([r() - 0.5, r() - 0.5, r() - 0.5]), 2 + r() * 1.8),
    p: r() * Math.PI * 2,
    a: rough * [0.55, 0.3, 0.2][i]!,
  }));
  const stretch = 0.78 + r() * 0.44;
  const pos: P3[] = solid.v.map((q) => {
    let d = 1;
    for (const w of waves) d += w.a * Math.sin(dot(w.k, q) + w.p);
    const x = q[0] * radius * d * stretch;
    const y = q[1] * radius * d * flat;
    const z = q[2] * radius * d / stretch;
    return [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs];
  });
  const centre: P3 = [cx, cy, cz];
  const nor = smoothNormals(pos, solid.f, centre);
  const base = sun < 0.5 ? mix(tones.deep, tones.mid, sun * 2) : mix(tones.mid, tones.top, (sun - 0.5) * 2);
  const under = mix(tones.deep, base, 0.4);
  const col: RGB[] = nor.map((n) => {
    const lit = smooth(-0.75, 0.55, n[1]);
    const c0 = mix(under, base, lit);
    const c1 = mix(c0, tones.top, smooth(0.45, 1, n[1]) * 0.6);
    // scattered whiter and deeper spots, like single flowers standing out of the bunch
    const spot = r();
    const c2 = spot < 0.22 ? mix(c1, tones.top, 0.45) : spot > 0.82 ? mix(c1, tones.deep, 0.35) : c1;
    return tint(c2, 0.92 + r() * 0.14);
  });
  const first = addVerts(b, pos, nor, col);
  for (const f of solid.f) addFace(b, first, pos, f, centre);
}

// ---- fallen petals on the ground ------------------------------------------------------------
/** Adds flat, upward-facing triangles over already added vertices (winding as MeshBatch.tri gives for UP). */
function addFlatFace(b: MeshBatch, base: number, pos: readonly V3[], f: Face): void {
  const a = pos[f[0]]!;
  const bb = pos[f[1]]!;
  const c = pos[f[2]]!;
  const cy = (bb[2] - a[2]) * (c[0] - a[0]) - (bb[0] - a[0]) * (c[2] - a[2]);
  if (Math.abs(cy) < 1e-9) return;
  if (cy >= 0) b.idx.push(base + f[0], base + f[2], base + f[1]);
  else b.idx.push(base + f[0], base + f[1], base + f[2]);
}

/** A petal colour: `deep` is the share of deeper pink (0..1), the rest is paler. */
const petalTone = (r: () => number, deep: number): RGB => {
  const t = r();
  const base = t < deep * 0.6 ? PETAL_DEEP : t < 0.25 + deep * 0.5 ? PETAL_MID : t < 0.8 ? PETAL_PALE : PETAL_WHITE;
  return tint(base, 0.96 + r() * 0.08);
};

/** Keeps a point on the near side of the kerb: (px, pz) -> (px, pz). */
type Clamp = (px: number, pz: number) => [number, number];

const GROUND_ASPHALT = hex(0x4a4d57);
const GROUND_SIDEWALK = hex(0xc9c6bd);
const GROUND_GRASS = hex(0x93c46b);
/**
 * Colour of the ground at (x, z) (the road, its sidewalk or grass) and how far a petal pile fades into it at its rim.
 * Over the dark road the fade is slight, otherwise the pile would get a dirty edge.
 */
function groundTint(x: number, z: number): [RGB, number] {
  const d = roadClearance(x, z).d;
  return d < 0 ? [GROUND_ASPHALT, 0.08] : d < 13 ? [GROUND_SIDEWALK, 0.2] : [GROUND_GRASS, 0.2];
}

/**
 * An irregular, soft-looking blotch of petals: a core fading through a middle band into a pale, ragged rim (the
 * colours are blended per vertex, so there are no flat rings). `tone` 0..1 runs from deep pink to pale; `along` and
 * `stretch` elongate it (kerb drifts); `clamp` keeps it off the road.
 */
function blotch(
  b: MeshBatch, cx: number, cz: number, radius: number, sides: number, r: () => number,
  o: { along?: [number, number]; stretch?: number; clamp?: Clamp; tone?: number; y?: number } = {},
): void {
  const stretch = o.stretch ?? 1;
  const [tx, tz] = o.along ?? [1, 0];
  const nx = -tz;
  const nz = tx;
  const tone = o.tone ?? r();
  const lift = PETAL_Y + (o.y ?? 0);
  const at = (px: number, pz: number): P3 => {
    const [qx, qz] = o.clamp ? o.clamp(px, pz) : [px, pz];
    return [qx, heightAt(qx, qz) + lift, qz];
  };
  const turn = r() * Math.PI * 2;
  const pos: P3[] = [at(cx, cz)];
  const col: RGB[] = [mix(PETAL_DEEP, PETAL_PALE, clamp(tone * 0.9 + (r() - 0.5) * 0.2, 0, 1))];
  const inner: P3[] = [];
  const innerCol: RGB[] = [];
  const outer: P3[] = [];
  const outerCol: RGB[] = [];
  let m = 0.85 + r() * 0.3;
  for (let k = 0; k < sides; k++) {
    const a = turn + (k / sides) * Math.PI * 2 + (r() - 0.5) * 0.8;
    m = clamp(m + (r() - 0.5) * 0.9, 0.4, 1.4);
    let ux = Math.cos(a) * radius * m;
    let uz = Math.sin(a) * radius * m;
    const along = ux * tx + uz * tz;
    const across = ux * nx + uz * nz;
    ux = tx * along * stretch + nx * across;
    uz = tz * along * stretch + nz * across;
    const f = 0.46 + r() * 0.16;
    inner.push(at(cx + ux * f, cz + uz * f));
    innerCol.push(petalTone(r, 0.7 - tone * 0.6));
    const rim = at(cx + ux, cz + uz);
    outer.push(rim);
    // the rim fades into whatever lies underneath (asphalt, paving or grass), which makes the edge look soft
    const [under, fade] = groundTint(rim[0], rim[2]);
    outerCol.push(mix(mix(petalTone(r, 0.15), PETAL_PALE, 0.4), under, fade));
  }
  const all: P3[] = [...pos, ...inner, ...outer];
  const nor: P3[] = all.map(() => [0, 1, 0]);
  const first = addVerts(b, all, nor, [...col, ...innerCol, ...outerCol]);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    const i0 = 1 + k;
    const i1 = 1 + k1;
    const o0 = 1 + sides + k;
    const o1 = 1 + sides + k1;
    addFlatFace(b, first, all, [0, i0, i1]);
    addFlatFace(b, first, all, [i0, o0, o1]);
    addFlatFace(b, first, all, [i0, o1, i1]);
  }
}

/** Single petals: tiny flat triangles, scattered with a density that falls off from (cx, cz). */
function scatterPetals(b: MeshBatch, cx: number, cz: number, radius: number, count: number, r: () => number, clampTo?: Clamp): void {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    // denser near the trunk
    const d = radius * Math.pow(r(), 1.6);
    const [px, pz] = clampTo ? clampTo(cx + Math.cos(a) * d, cz + Math.sin(a) * d) : [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
    const y = heightAt(px, pz) + PETAL_Y + 0.12 + r() * 0.05;
    const s = 0.9 + r() * 1.1;
    const th = r() * Math.PI * 2;
    b.tri(
      [px + Math.cos(th) * s, y, pz + Math.sin(th) * s],
      [px + Math.cos(th + 2.3) * s * 0.7, y, pz + Math.sin(th + 2.3) * s * 0.7],
      [px + Math.cos(th - 2.3) * s * 0.7, y, pz + Math.sin(th - 2.3) * s * 0.7],
      petalTone(r, 0.3), [0, 1, 0],
    );
  }
}

/**
 * The petal carpet under a cherry tree: many ragged blotches of petals in two or three tones (one big, pale-rimmed
 * pile under the trunk, the others strewn around it), single petals (densest at the trunk) and, where a road runs
 * close by, drifts piled along the kerb. The carpet stops at the kerb instead of covering the road.
 */
function petalCarpet(b: MeshBatch, x: number, z: number, s: number, big: boolean, r: () => number): void {
  const nr = roadClearance(x, z);
  // direction from the tree towards the road, and the distance to the kerb (road edge)
  let kdx = 0;
  let kdz = 0;
  let kerb = Infinity;
  if (nr.road && nr.d < 70) {
    const len = Math.hypot(nr.px - x, nr.pz - z) || 1;
    kdx = (nr.px - x) / len;
    kdz = (nr.pz - z) / len;
    kerb = Math.max(nr.d, 4) + 4;
  }
  const clampTo: Clamp = (px, pz) => {
    const over = (px - x) * kdx + (pz - z) * kdz - kerb;
    return over > 0 ? [px - kdx * over, pz - kdz * over] : [px, pz];
  };
  const R = (big ? 66 : 38) * s;
  const n = big ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = i === 0 ? R * 0.1 : R * Math.pow(r(), 0.8);
    const br = i === 0 ? R * 0.36 : R * (0.12 + r() * 0.17);
    blotch(b, x + Math.cos(a) * d, z + Math.sin(a) * d, br, i === 0 ? 11 : 8, r, { clamp: clampTo, tone: i === 0 ? 0.3 : r(), y: i * 0.03 });
  }
  scatterPetals(b, x, z, R * 1.7, big ? 34 : 12, r, clampTo);
  // drifts along the kerb
  if (big && kerb < 50) {
    const tx = -kdz;
    const tz = kdx;
    const ex = x + kdx * (kerb - 4); // kerb point closest to the tree
    const ez = z + kdz * (kerb - 4);
    const nd = 2 + Math.floor(r() * 2);
    for (let i = 0; i < nd; i++) {
      const along = (r() - 0.5) * 2 * 70 * s * (0.4 + 0.6 * r());
      const off = -1 + r() * 4; // from just in the gutter to the sidewalk side
      blotch(b, ex + tx * along - kdx * off, ez + tz * along - kdz * off, (5 + r() * 4) * s, 7, r, { along: [tx, tz], stretch: 1.8 + r() * 0.9, tone: 0.4 + r() * 0.6, y: 0.06 });
    }
    for (let i = 0; i < 5; i++) {
      const along = (r() - 0.5) * 2 * 80 * s;
      const off = -1.5 + r() * 6;
      scatterPetals(b, ex + tx * along - kdx * off, ez + tz * along - kdz * off, 3, 1, r);
    }
  }
}

// ---- the tree ---------------------------------------------------------------------------------
/**
 * Cherry tree in full bloom: a dark, slightly leaning trunk that forks at about a third of the height into 3-5 limbs
 * spreading up and outwards, each with secondary branches, an umbrella of blossom clusters at the branch ends (light on
 * top, deep pink underneath) and a petal carpet on the ground. Trees with `scale` below 0.95 (house gardens) get a
 * cheaper version. The lowest blossoms stay above head height so that people can walk beneath.
 */
export function addCherry(c: Ctx, x: number, z: number, scale = 1): void {
  // The shared random stream is advanced exactly as the previous version did (10 draws), so that everything built
  // after the trees keeps its randomness; the tree itself uses its own position-seeded stream.
  for (let i = 0; i < 10; i++) c.rnd();
  const r = treeRng(x, z);
  const b = c.main.at(x, z);
  const y0 = heightAt(x, z);
  const big = scale >= 0.95;
  // garden trees (scale 0.7-0.95) are only a little smaller than avenue trees, they just have fewer branches and bunches
  const s = big ? scale : 0.86 + (scale - 0.7) * 0.45;

  const tone = r();
  const tones: Tones = {
    top: mix(BLOSSOM_TOP[0], BLOSSOM_TOP[1], tone),
    mid: mix(BLOSSOM_MID[0], BLOSSOM_MID[1], tone),
    deep: mix(BLOSSOM_DEEP[0], BLOSSOM_DEEP[1], tone),
  };

  // trunk: leans a little, flares at the foot, tapers to the fork
  const H = (big ? 31 * s + 8 : 31 * s + 6) * (0.92 + r() * 0.16);
  const R0 = (big ? 5.4 : 4.4) * Math.pow(s, 0.9);
  const lean = 0.025 + r() * 0.05;
  const la = r() * Math.PI * 2;
  const ldx = Math.cos(la) * lean;
  const ldz = Math.sin(la) * lean;
  const fork: P3 = [x + ldx * H, y0 + H, z + ldz * H];
  const trunkPts: P3[] = big
    ? [
        [x, y0 - 3, z],
        [x + ldx * 8, y0 + 8 * s, z + ldz * 8],
        [x + ldx * H * 0.34 + (r() - 0.5) * 1.6, y0 + H * 0.34, z + ldz * H * 0.34 + (r() - 0.5) * 1.6],
        [x + ldx * H * 0.67 + (r() - 0.5) * 1.6, y0 + H * 0.67, z + ldz * H * 0.67 + (r() - 0.5) * 1.6],
        fork,
      ]
    : [[x, y0 - 2, z], [x + ldx * H * 0.5, y0 + H * 0.5, z + ldz * H * 0.5], fork];
  const trunkRad = big ? [R0 * 1.22, R0, R0 * 0.9, R0 * 0.74, R0 * 0.55] : [R0 * 1.15, R0 * 0.8, R0 * 0.52];
  // bark: nearly black at the foot, bands of slightly different brightness up the trunk
  const barkCols: RGB[] = big
    ? [BARK_FOOT, BARK_TRUNK, tint(BARK_TRUNK, 1.14), tint(BARK_TRUNK, 0.94), BARK_LIMB]
    : [BARK_TRUNK, tint(BARK_TRUNK, 1.1), BARK_LIMB];
  limb(b, trunkPts, trunkRad, big ? 8 : 6, barkCols, r);

  const nLimb = big ? (r() < 0.12 ? 3 : r() < 0.72 ? 4 : 5) : 3;
  const a0 = r() * Math.PI * 2;
  const bloomLow = 34; // absolute: the lowest blossom edge stays above head height
  const top = y0 + (big ? 112 : 92) * s; // rough height of the crown, to tell sunny clusters from shaded ones
  /** Puts a blossom cluster; `sun` 0..1 is brightened for clusters high up in the crown. */
  const put = (p: V3, radius: number, flat: number, sun: number, level?: 0 | 1): void => {
    const cy = Math.max(p[1], y0 + bloomLow + radius * flat * 0.9);
    const high = clamp((cy - y0 - 40 * s) / (top - y0 - 40 * s), 0, 1);
    lump(b, p[0], cy, p[2], radius, flat, level ?? 0, tones, clamp(sun * 0.65 + high * 0.45, 0, 1), r);
  };
  /** Small bunches of blossom along a branch, sitting on top of it so that the wood stays visible below. */
  const bunches = (from: V3, to: V3, ts: readonly number[], r0: number, r1: number, outerLevel: 0 | 1 = 0): void => {
    const d = norm(sub(to, from));
    const side = norm(cross(d, [0, 1, 0]));
    ts.forEach((t, i) => {
      const rr = (r0 + (r1 - r0) * t) * s * (0.9 + r() * 0.3);
      const p = mixP(from, to, t);
      const off = (r() - 0.5) * rr * 1.1;
      // the outermost bunch of a branch forms the outline of the crown: it gets the smoother solid
      put([p[0] + side[0] * off, p[1] + rr * (0.35 + r() * 0.25), p[2] + side[2] * off], rr, 0.62 + r() * 0.25, r(), i === ts.length - 1 ? outerLevel : 0);
    });
  };
  /** Hanging tassels of deeper pink under the outer ends of a branch. */
  const tassels = (tp: V3, o: V3, n: number): void => {
    for (let i = 0; i < n; i++) {
      const rr = (4.6 + r() * 2.2) * s;
      const dx = (r() - 0.3) * 6 * s;
      const dz = (r() - 0.5) * 7 * s;
      put([tp[0] + o[0] * dx - o[2] * dz, tp[1] - (2.5 + r() * 3.5) * s, tp[2] + o[2] * dx + o[0] * dz], rr, 1.25 + r() * 0.3, 0.05 + r() * 0.3, 0);
    }
  };

  const knees: P3[] = [];
  const tipsAll: P3[] = [];
  for (let k = 0; k < nLimb; k++) {
    const az = a0 + (k + (r() - 0.5) * 0.45) * ((Math.PI * 2) / nLimb);
    const rb = (big ? 2.3 + r() * 0.5 : 1.6 + r() * 0.3) * Math.pow(s, 0.85);
    const out: P3 = [Math.cos(az), 0, Math.sin(az)];
    const start: P3 = [fork[0] + out[0] * rb * 0.6, fork[1] - 1.5 * s, fork[2] + out[2] * rb * 0.6];
    if (big) {
      const e1 = rad(62 + r() * 12);
      const L1 = (28 + r() * 6) * s;
      const knee = addv(start, scl(dirOf(az, e1), L1));
      const az2 = az + (r() - 0.5) * 0.55;
      const e2 = rad(22 + r() * 16);
      const L2 = (20 + r() * 5) * s;
      const dir2 = dirOf(az2, e2);
      const tip = addv(knee, scl(dir2, L2));
      limb(b, [start, knee, tip], [rb, rb * 0.7, rb * 0.46], 6, [BARK_LIMB, BARK_LIMB], r);

      // secondary branches: one leaving the knee to the side, one continuing past the tip, sometimes one more
      const secs: { from: P3; az: number; el: number; len: number; w: number }[] = [
        { from: knee, az: az + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), el: rad(24 + r() * 16), len: (20 + r() * 5) * s, w: 0.62 },
        { from: tip, az: az2 + (r() - 0.5) * 0.7, el: rad(4 + r() * 14), len: (18 + r() * 5) * s, w: 0.5 },
      ];
      if (r() < 0.6) secs.push({ from: addv(knee, scl(dir2, L2 * 0.5)), az: az2 + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), el: rad(12 + r() * 14), len: (15 + r() * 5) * s, w: 0.45 });
      knees.push(knee);
      tipsAll.push(tip);
      bunches(knee, tip, [0.55, 1], 9.5, 12);
      for (const sc of secs) {
        const e = addv(sc.from, scl(dirOf(sc.az, sc.el), sc.len));
        limb(b, [sc.from, e], [rb * sc.w, rb * 0.08], 5, [BARK_TWIG], r);
        // one or two thin twigs (three-sided, six vertices each) leaving the branch, mostly seen from underneath
        for (let t = 0; t < 1 + (r() < 0.25 ? 1 : 0); t++) {
          const base = mixP(sc.from, e, 0.3 + t * 0.3 + r() * 0.1);
          const side = (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.8);
          const tw = addv(base, scl(dirOf(sc.az + side, rad(10 + r() * 40)), (8 + r() * 6) * s));
          limb(b, [base, tw], [rb * 0.2, rb * 0.04], 3, [BARK_TWIG], r);
        }
        bunches(sc.from, e, [0.5, 1.02], 9, 12, 1);
        const o = norm([e[0] - fork[0], 0, e[2] - fork[2]]);
        if (r() < 0.7) tassels(e, o, 1 + (r() < 0.4 ? 1 : 0));
      }
      // the dome over the knee
      put([knee[0], knee[1] + 8 * s, knee[2]], (11.5 + r() * 3) * s, 0.7, 0.4 + r() * 0.5);
    } else {
      const e1 = rad(46 + r() * 16);
      const L1 = (26 + r() * 7) * s;
      const tip = addv(start, scl(dirOf(az, e1), L1));
      limb(b, [start, tip], [rb, rb * 0.5], 5, [BARK_LIMB], r);
      bunches(start, tip, [0.55], 9, 11);
      const o = norm([tip[0] - fork[0], 0, tip[2] - fork[2]]);
      put([tip[0] + o[0] * 2 * s, tip[1] + 3 * s, tip[2] + o[2] * 2 * s], (12 + r() * 3) * s, 0.75, 0.45 + r() * 0.5, 1);
    }
  }
  // fill the gaps between neighbouring limbs, so that the canopy is one umbrella and not a star of separate branches
  for (let k = 0; k < knees.length; k++) {
    const k2 = (k + 1) % knees.length;
    const kn = mixP(knees[k]!, knees[k2]!, 0.5);
    const tp = mixP(tipsAll[k]!, tipsAll[k2]!, 0.5);
    put([kn[0], kn[1] + 9 * s, kn[2]], (12 + r() * 3) * s, 0.7, 0.35 + r() * 0.5, 1);
    put([tp[0], tp[1] + 4 * s, tp[2]], (11 + r() * 3) * s, 0.65, 0.4 + r() * 0.55, 0);
    const lo = mixP(kn, tp, 0.55);
    put([lo[0], lo[1] - 1 * s, lo[2]], (8.5 + r() * 2.5) * s, 0.75, 0.05 + r() * 0.3, 0);
  }
  // crown: fills the top of the umbrella
  const nCrown = big ? 3 : 2;
  const crownY = fork[1] + (big ? 37 : 30) * s;
  for (let i = 0; i < nCrown; i++) {
    const a = (i / nCrown) * Math.PI * 2 + r() * 1.2;
    const d = (big ? 14 : 8) * s * (0.4 + r() * 0.6);
    put([fork[0] + Math.cos(a) * d, crownY + (r() - 0.3) * 8 * s, fork[2] + Math.sin(a) * d], (big ? 13 + r() * 3.5 : 11 + r() * 3) * s, 0.7, 0.7 + r() * 0.3, 1);
  }
  // a darker bunch inside the crown, below the top, for depth
  if (big) put([fork[0], fork[1] + 20 * s, fork[2]], 10 * s, 0.8, 0.1 + r() * 0.2, 0);

  petalCarpet(c.dec3, x, z, s, big, r);
}

/**
 * Plain green street/garden tree: a visible trunk that forks into two or three branches, each carrying a leafy
 * cluster, plus a bigger cluster in the middle (so it is a few overlapping masses on a trunk, not one ball).
 */
export function addRoundTree(c: Ctx, x: number, z: number, scale = 1): void {
  const col = LEAF[Math.floor(c.rnd() * LEAF.length)]!; // the only draw from the shared stream (as before)
  const r = treeRng(x, z);
  const b = c.main.at(x, z);
  const y0 = heightAt(x, z);
  const s = scale;
  const tones: Tones = { top: mix(col, hex(0xe6ffb0), 0.38), mid: col, deep: mix(col, hex(0x1f6a3c), 0.5) };

  const H = (24 + r() * 5) * s;
  const lean = (r() - 0.5) * 0.12;
  const la = r() * Math.PI * 2;
  const fork: P3 = [x + Math.cos(la) * lean * H, y0 + H, z + Math.sin(la) * lean * H];
  const bark = mix(TRUNK, BARK_LIMB, 0.35);
  limb(b, [[x, y0 - 1, z], [x + (fork[0] - x) * 0.5, y0 + H * 0.5, z + (fork[2] - z) * 0.5], fork], [3.4 * s, 2.7 * s, 2.1 * s], 6, [bark, bark, tint(bark, 1.12)], r);

  const n = 2 + (r() < 0.55 ? 1 : 0);
  const a0 = r() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const az = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const tip = addv(fork, scl(dirOf(az, rad(48 + r() * 18)), (15 + r() * 5) * s));
    limb(b, [[fork[0], fork[1] - 1 * s, fork[2]], tip], [1.7 * s, 0.7 * s], 5, [bark], r);
    const rr = (11 + r() * 4) * s;
    lump(b, tip[0], Math.max(tip[1] + 3 * s, y0 + 30 * s), tip[2], rr, 0.85, 0, tones, 0.3 + r() * 0.5, r);
  }
  lump(b, fork[0], fork[1] + (15 + r() * 4) * s, fork[2], (16 + r() * 4) * s, 0.85, 1, tones, 0.55 + r() * 0.4, r);
}

/** Cheap mountain trees go to the forest batch. */
export function addForestTree(c: Ctx, x: number, z: number, scale: number, kind: number): void {
  const b = c.forest.at(x, z);
  const y0 = heightAt(x, z) - 3;
  if (kind === 0) {
    const col: RGB = [0.16 + c.rnd() * 0.08, 0.38 + c.rnd() * 0.1, 0.2 + c.rnd() * 0.06];
    b.cylinder(x, z, y0, y0 + 30 * scale, 3 * scale, 2.5 * scale, 4, TRUNK, false);
    b.cylinder(x, z, y0 + 22 * scale, y0 + 78 * scale, 26 * scale, 0, 6, col, false);
    b.cylinder(x, z, y0 + 54 * scale, y0 + 118 * scale, 20 * scale, 0, 6, [col[0] * 1.08, col[1] * 1.08, col[2] * 1.08], false);
  } else if (kind === 1) {
    const col: RGB = [0.3 + c.rnd() * 0.1, 0.55 + c.rnd() * 0.12, 0.26 + c.rnd() * 0.06];
    b.cylinder(x, z, y0, y0 + 40 * scale, 3.5 * scale, 2.8 * scale, 4, TRUNK, false);
    b.blob(x, y0 + 68 * scale, z, 34 * scale, 32 * scale, 34 * scale, col, 0.07, x * 0.01 + z);
  } else {
    // wild cherry on the hillside
    const col = BLOSSOM_MID[Math.floor(c.rnd() * 2)]!;
    b.cylinder(x, z, y0, y0 + 38 * scale, 3.5 * scale, 2.8 * scale, 4, TRUNK, false);
    b.blob(x, y0 + 66 * scale, z, 34 * scale, 28 * scale, 34 * scale, col, 0.07, x * 0.01 + z);
  }
}
