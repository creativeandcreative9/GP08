import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { makeRng } from './town/util';

/** Sky colours: a pale hazy horizon rising to a clear spring blue. */
export const HORIZON = new Color3(0.84, 0.9, 0.97);
const MID = new Color3(0.6, 0.76, 0.95);
const ZENITH = new Color3(0.33, 0.57, 0.91);

function unlit(scene: Scene, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.White();
  m.backFaceCulling = false;
  m.fogEnabled = false;
  return m;
}

/** Gradient sky dome that follows the camera. */
function createDome(scene: Scene): Mesh {
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 56000, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  const pos = sky.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const e = Math.max(0, pos[i + 1]! / 28000); // sine of the elevation
    const c = e < 0.18 ? Color3.Lerp(HORIZON, MID, Math.pow(e / 0.18, 0.8)) : Color3.Lerp(MID, ZENITH, Math.min(1, Math.pow((e - 0.18) / 0.62, 0.7)));
    colors.push(c.r, c.g, c.b, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors, true);
  sky.material = unlit(scene, 'skyMat');
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  sky.alwaysSelectAsActiveMesh = true;
  return sky;
}

/** Paints translucent spring cloud filaments; opacity fades continuously through the wispy edges. */
function cloudTexture(scene: Scene, seed: number): DynamicTexture {
  const W = 512;
  const H = 256;
  const tex = new DynamicTexture(`cloudTex${seed}`, { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  const g = tex.getContext() as CanvasRenderingContext2D;
  g.clearRect(0, 0, W, H);
  const r = makeRng(seed);
  const base = H * 0.78;
  const puffs: [number, number, number][] = [];
  const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = W * (0.12 + 0.76 * t) + (r() - 0.5) * 30;
    const hump = Math.sin(t * Math.PI); // taller in the middle
    const rad = 34 + hump * (40 + r() * 34);
    puffs.push([x, base - rad * (0.55 + r() * 0.35), rad]);
  }
  // A coherent density field breaks up the silhouette and shades smaller billows inside it.
  // This is painted once; it adds no per-frame noise or cloud geometry.
  const grid = Array.from({ length: 64 * 32 }, () => r());
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (dx: number, dy: number): number => grid[((iy + dy) & 31) * 64 + ((ix + dx) & 63)]!;
    return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
  };
  const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const pixels = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const coarse = noise(x / 24, y / 24), fine = noise(x / 7, y / 7);
    let density = 0;
    for (const [px, py, radius] of puffs) {
      const dx = (x - px) / radius;
      const curl = Math.sin(x / 65 + px / 43) * (4 + fine * 4);
      const dy = (y - py - curl - (x - W * .5) * .12) / (radius * .22);
      density += Math.exp(-dx * dx * 1.8 - dy * dy * 1.6);
    }
    // Wind stretches the small density changes into filaments rather than circular puffs.
    const filaments = .75 * noise(x / 48 + y / 35, y / 3.8) + .25 * noise(x / 19, y / 1.9);
    const alpha = Math.min(.95, (1 - Math.exp(-density * .9)) * (.35 + .65 * coarse) * (.65 + .35 * filaments) * 1.12)
      * (1 - smooth(base - 10, base + 18, y));
    const under = smooth(base - 90, base + 8, y), billow = .7 * coarse + .3 * fine;
    const light = .99 - under * .05 - (1 - billow) * .025;
    const i = (y * W + x) * 4;
    pixels.data[i] = 255 * light - under * 6;
    pixels.data[i + 1] = 255 * light - under * 2;
    pixels.data[i + 2] = Math.min(255, 255 * light + under * 7);
    pixels.data[i + 3] = alpha * 245;
  }
  g.putImageData(pixels, 0, 0);
  tex.update(true);
  return tex;
}

/** Painted cumulus clouds around the horizon (camera-facing cards, never fogged). */
function createClouds(scene: Scene): TransformNode {
  const root = new TransformNode('clouds', scene);
  const mats = [11, 23, 37, 51].map((seed, i) => {
    const m = unlit(scene, `cloudMat${i}`);
    m.diffuseTexture = cloudTexture(scene, seed);
    m.emissiveTexture = m.diffuseTexture;
    m.useAlphaFromDiffuseTexture = true;
    m.diffuseTexture.hasAlpha = true;
    m.alpha = 0.98;
    return m;
  });
  const rnd = makeRng(4242);
  for (let i = 0; i < 32; i++) {
    // A sparse middle layer makes the sky readable from every street direction.
    const middle = i >= 26;
    const a = middle ? .35 + (i - 26) * Math.PI / 3 : rnd() * Math.PI * 2;
    const dist = middle ? 18000 : 9000 + rnd() * 14000;
    const elev = middle ? .26 : .06 + Math.pow(rnd(), 1.6) * .32;
    const w = middle ? 6500 : 2600 + rnd() * 3800;
    const card = MeshBuilder.CreatePlane(`cloud${i}`, { width: w, height: w / (i % 3 === 0 ? 4.2 : 2.7) }, scene);
    card.position = new Vector3(400 + Math.cos(a) * dist, 600 + Math.tan(elev) * dist, 100 + Math.sin(a) * dist);
    // Rotate the geometry in its own plane: billboard orientation keeps the fine slant in every view.
    const points = card.getVerticesData(VertexBuffer.PositionKind)!;
    const angle = .18 * Math.sin(i * 2.39 + 1.2), ca = Math.cos(angle), sa = Math.sin(angle);
    for (let k = 0; k < points.length; k += 3) {
      const x = points[k]!, y = points[k + 1]!;
      points[k] = x * ca - y * sa; points[k + 1] = x * sa + y * ca;
    }
    card.setVerticesData(VertexBuffer.PositionKind, points); card.refreshBoundingInfo();
    card.billboardMode = Mesh.BILLBOARDMODE_ALL;
    card.material = mats[i % mats.length]!;
    card.applyFog = false;
    card.isPickable = false;
    card.parent = root;
  }
  return root;
}

/** Hazy blue ridges far away on the land side (south, east and west), for depth behind the town. */
function createFarMountains(scene: Scene): Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rnd = makeRng(777);
  const top = new Color3(0.56, 0.66, 0.78);
  const foot = HORIZON;
  // azimuth measured from +X towards +Z; the sea lies north (+Z), so ridges run through the south
  const a0 = Math.PI * 0.92;
  const a1 = Math.PI * 2.08;
  const steps = 160;
  const waves = [0.0, 0.0, 0.0].map(() => [rnd() * 6.28, 3 + rnd() * 5, rnd() * 6.28] as const);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    let h = 700;
    h += 650 * Math.max(0, Math.sin(a * waves[0]![1] + waves[0]![0]));
    h += 380 * Math.sin(a * 11 + waves[1]![0]) + 160 * Math.sin(a * 27 + waves[2]![2]);
    // lower towards both ends, where the coast is
    const edge = Math.min(1, (a - a0) / 0.5, (a1 - a) / 0.5);
    h = Math.max(120, h * (0.35 + 0.65 * edge));
    const R = 17000;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pos.push(400 + ca * R, -200, 100 + sa * R, 400 + ca * (R + 1500), h, 100 + sa * (R + 1500));
    col.push(foot.r, foot.g, foot.b, 1, top.r, top.g, top.b, 1);
    if (i < steps) {
      const k = i * 2;
      idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  const m = new Mesh('farMountains', scene);
  const vd = new VertexData();
  vd.positions = pos;
  vd.colors = col;
  vd.indices = idx;
  vd.normals = [];
  VertexData.ComputeNormals(pos, idx, vd.normals);
  vd.applyToMesh(m);
  m.material = unlit(scene, 'farMountainMat');
  m.applyFog = false;
  m.isPickable = false;
  m.alwaysSelectAsActiveMesh = true;
  return m;
}

/** Sky dome, painted clouds and distant ridges. */
export function createSky(scene: Scene): void {
  createDome(scene);
  createFarMountains(scene);
  createClouds(scene);
}
