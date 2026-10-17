import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { BEACH_WIDTH, coastS, coastVertexXs, coastZ, groundHeightAt, mountainT, SEA_Y } from './heights';
import { hash2, hex, mix, smoothstep01, type RGB } from './util';

export * from './heights';

// --- colours ----------------------------------------------------------------------------------
const GRASS = hex(0x9caf80);
const GRASS_DARK = hex(0x879b70);
const SAND = hex(0xf0dcaa);
const WET_SAND = hex(0xcdb88a);
const SHALLOW = hex(0x9fd6cf);
const DEEP = hex(0x2f6f9f);
const FOREST = hex(0x557951);
const FOREST_HIGH = hex(0x749268);

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
      const y = groundHeightAt(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const hx = groundHeightAt(x + e, z) - groundHeightAt(x - e, z);
      const hz = groundHeightAt(x, z + e) - groundHeightAt(x, z - e);
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
