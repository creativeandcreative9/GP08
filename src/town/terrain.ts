import { Color3, Mesh, StandardMaterial, VertexData, type Scene } from '@babylonjs/core';
import { COAST, MOUNTAIN_FOOT, SUMMIT, mapToWorld } from './layout';
import { hash2, hex, lerp, mix, smoothstep01, type RGB } from './util';

/** Width (world units) of the sand strip south of the coast line. */
export const BEACH_WIDTH = 40;
/** Sea surface height. */
export const SEA_Y = -2.2;
const BEACH_LOW = -2.5;
const SEA_DEPTH = -14;
const PLATEAU_R = 110;

// --- coast ------------------------------------------------------------------------------------
const coastPts = (() => {
  const p = COAST.map(([x, y]) => mapToWorld(x, y));
  const first = p[0]!;
  const last = p[p.length - 1]!;
  const prev = p[p.length - 2]!;
  const slope = (last.z - prev.z) / (last.x - prev.x);
  return [
    { x: -80000, z: first.z },
    ...p,
    { x: last.x + 3980, z: last.z + slope * 3980 },
    { x: 80000, z: last.z + slope * 3980 },
  ];
})();

/** Coast line z for a given x (the sea is north of it). */
export function coastZ(x: number): number {
  const p = coastPts;
  if (x <= p[0]!.x) return p[0]!.z;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    if (x <= b.x) return lerp(a.z, b.z, (x - a.x) / (b.x - a.x));
  }
  return p[p.length - 1]!.z;
}
/** Vertical offset north of the coast line (negative = land side). */
export const coastS = (x: number, z: number): number => z - coastZ(x);
export const coastVertexXs: number[] = coastPts.map((p) => p.x).filter((x) => Math.abs(x) < 20000);

function beachHeight(s: number): number {
  if (s <= -BEACH_WIDTH) return 0;
  if (s <= 0) return lerp(0, BEACH_LOW, (s + BEACH_WIDTH) / BEACH_WIDTH);
  if (s >= 8000) return -3000;
  if (s >= 1500) return lerp(-200, -3000, (s - 1500) / 6500);
  if (s >= 150) return lerp(SEA_DEPTH, -200, (s - 150) / 1350);
  return lerp(BEACH_LOW, SEA_DEPTH, s / 150);
}

// --- mountain ---------------------------------------------------------------------------------
const FOOT = [
  { x: -700, y: 560 },
  ...MOUNTAIN_FOOT.map(([x, y]) => ({ x, y })).slice(0, -1),
  { x: MOUNTAIN_FOOT[MOUNTAIN_FOOT.length - 2]![0], y: 1700 },
  { x: -700, y: 1700 },
].map((p) => mapToWorld(p.x, p.y));
export const SUMMIT_XZ = mapToWorld(SUMMIT.x, SUMMIT.y);

function footRadius(dx: number, dz: number): number {
  // distance from the summit to the foot outline along direction (dx,dz)
  const sx = SUMMIT_XZ.x;
  const sz = SUMMIT_XZ.z;
  let best = Infinity;
  for (let i = 0; i < FOOT.length; i++) {
    const a = FOOT[i]!;
    const b = FOOT[(i + 1) % FOOT.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - sx) * ez - (a.z - sz) * ex) / den;
    const u = ((a.x - sx) * dz - (a.z - sz) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

/** 0 at the foot outline, 1 on the summit plateau. */
export function mountainT(x: number, z: number): number {
  const dx = x - SUMMIT_XZ.x;
  const dz = z - SUMMIT_XZ.z;
  const r = Math.hypot(dx, dz);
  if (r <= PLATEAU_R) return 1;
  // quick reject: the whole mountain lies south-west of the town
  if (x > 0 || z > 0) return 0;
  const R = footRadius(dx / r, dz / r);
  if (!(R < Infinity) || r >= R) return 0;
  return 1 - (r - PLATEAU_R) / (R - PLATEAU_R);
}

export function mountainHeight(x: number, z: number): number {
  const t = mountainT(x, z);
  if (t <= 0) return 0;
  const g = smoothstep01(t);
  const n =
    Math.sin(x * 0.0021 + 1.3) * Math.sin(z * 0.0017 + 0.4) * 0.6 +
    Math.sin((x + z) * 0.0043 + 2.0) * 0.4 +
    Math.sin(x * 0.0089) * Math.sin(z * 0.0071) * 0.25;
  // ridges and gullies: zero at the foot and on the summit plateau
  const env = smoothstep01(t / 0.25) * (1 - smoothstep01((t - 0.6) / 0.3));
  return SUMMIT.height * g + 60 * n * env;
}

/** Ground height at (x,z): flat town (0), beach and sea floor, mountain. */
export function heightAt(x: number, z: number): number {
  return beachHeight(coastS(x, z)) + mountainHeight(x, z);
}

// --- colours ----------------------------------------------------------------------------------
const GRASS = hex(0x93c46b);
const GRASS_DARK = hex(0x7fb35c);
const SAND = hex(0xf0dcaa);
const WET_SAND = hex(0xcdb88a);
const SHALLOW = hex(0x9fd6cf);
const DEEP = hex(0x2f6f9f);
const FOREST = hex(0x3e8a45);
const FOREST_HIGH = hex(0x56a050);

function groundColor(x: number, z: number): RGB {
  const s = coastS(x, z);
  const n = 0.5 + 0.25 * Math.sin(x * 0.0013 + 1.0) + 0.25 * Math.sin(z * 0.0017 + x * 0.0004 + 2.0);
  const jitter = 0.97 + hash2(Math.floor(x / 250), Math.floor(z / 250)) * 0.05;
  if (s > 0) return mix(SHALLOW, DEEP, smoothstep01(s / 160));
  if (s > -10) return mix(WET_SAND, SHALLOW, smoothstep01((s + 10) / 10) * 0.5);
  if (s > -BEACH_WIDTH) return mix(SAND, WET_SAND, smoothstep01((s + 22) / 12));
  let c = mix(GRASS_DARK, GRASS, n);
  const t = mountainT(x, z);
  if (t > 0) {
    const forest = mix(FOREST, FOREST_HIGH, smoothstep01(t) * 0.8 + n * 0.2);
    c = mix(c, forest, smoothstep01(t / 0.12));
  }
  return [c[0] * jitter, c[1] * jitter, c[2] * jitter];
}

// --- meshes -----------------------------------------------------------------------------------
function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let v = a; v < b - 1e-6; v += step) out.push(v);
  return out;
}

export interface TerrainMeshes {
  ground: Mesh;
  sea: Mesh;
  vertexCount: number;
}

export function createTerrainMeshes(scene: Scene): TerrainMeshes {
  const xs = [
    -80000, -40000, -20000, -12000,
    ...range(-9000, -7400, 400),
    ...range(-7400, -2000, 100),
    ...range(-2000, 4400, 200),
    ...range(4400, 10000, 400),
    14000, 20000, 40000, 80000,
    ...coastVertexXs,
  ];
  xs.sort((a, b) => a - b);
  const ux = xs.filter((v, i) => i === 0 || v - xs[i - 1]! > 1);

  const ss = [
    -80000, -40000, -20000, -12000,
    ...range(-11000, -7900, 400),
    ...range(-7900, -1400, 100),
    ...range(-1400, -200, 200),
    -120, -80, -44, -BEACH_WIDTH, -26, -12, 0, 30, 150, 600, 1500, 3000, 8000, 16000, 40000, 80000,
  ];
  ss.sort((a, b) => a - b);
  const us = ss.filter((v, i) => i === 0 || v - ss[i - 1]! > 0.5);

  const nx = ux.length;
  const ns = us.length;
  const pos = new Float32Array(nx * ns * 3);
  const nor = new Float32Array(nx * ns * 3);
  const col = new Float32Array(nx * ns * 4);
  const e = 15;
  for (let i = 0; i < nx; i++) {
    const x = ux[i]!;
    const c0 = coastZ(x);
    for (let j = 0; j < ns; j++) {
      const z = c0 + us[j]!;
      const k = i * ns + j;
      const y = heightAt(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const hx = heightAt(x + e, z) - heightAt(x - e, z);
      const hz = heightAt(x, z + e) - heightAt(x, z - e);
      const l = Math.hypot(hx / (2 * e), 1, hz / (2 * e));
      nor[k * 3] = -hx / (2 * e) / l;
      nor[k * 3 + 1] = 1 / l;
      nor[k * 3 + 2] = -hz / (2 * e) / l;
      const c = groundColor(x, z);
      col[k * 4] = c[0];
      col[k * 4 + 1] = c[1];
      col[k * 4 + 2] = c[2];
      col[k * 4 + 3] = 1;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i + 1 < nx; i++) {
    for (let j = 0; j + 1 < ns; j++) {
      const a = i * ns + j;
      const b = i * ns + j + 1;
      const c = (i + 1) * ns + j + 1;
      const d = (i + 1) * ns + j;
      idx.push(a, c, b, a, d, c);
    }
  }
  const ground = new Mesh('terrain', scene);
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nor;
  vd.colors = col;
  vd.indices = new Uint32Array(idx);
  vd.applyToMesh(ground);
  const gm = new StandardMaterial('terrainMat', scene);
  gm.specularColor = Color3.Black();
  ground.material = gm;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  ground.alwaysSelectAsActiveMesh = true;

  // Sea: a flat translucent plane following the coast, reaching far to the north.
  const sx = [-80000, ...coastVertexXs.filter((x) => x > -20000), 80000];
  const sp: number[] = [];
  const sn: number[] = [];
  const si: number[] = [];
  sx.forEach((x, i) => {
    const c0 = coastZ(x);
    sp.push(x, SEA_Y, c0 - 3, x, SEA_Y, c0 + 36000);
    sn.push(0, 1, 0, 0, 1, 0);
    if (i + 1 < sx.length) {
      const a = i * 2;
      si.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  });
  const sea = new Mesh('sea', scene);
  const sv = new VertexData();
  sv.positions = sp;
  sv.normals = sn;
  sv.indices = si;
  sv.applyToMesh(sea);
  const sm = new StandardMaterial('seaMat', scene);
  sm.diffuseColor = new Color3(0.27, 0.62, 0.88);
  sm.specularColor = new Color3(0.9, 0.95, 1);
  sm.specularPower = 90;
  sm.alpha = 0.8;
  sm.backFaceCulling = false;
  sea.material = sm;
  sea.isPickable = false;
  sea.freezeWorldMatrix();
  sea.alwaysSelectAsActiveMesh = true;

  return { ground, sea, vertexCount: nx * ns + sx.length * 2 };
}
