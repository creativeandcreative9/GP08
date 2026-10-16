import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
  type Scene,
} from '@babylonjs/core';
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
  sky.setVerticesData(VertexBuffer.ColorKind, colors);
  sky.material = unlit(scene, 'skyMat');
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  sky.alwaysSelectAsActiveMesh = true;
  return sky;
}

/** Paints a soft cumulus cloud (white tops, blue-grey flat bottoms) into a transparent texture. */
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
  // body: overlapping soft discs
  for (const [x, y, rad] of puffs) {
    const gr = g.createRadialGradient(x, y - rad * 0.2, rad * 0.1, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.65, 'rgba(250,251,255,0.95)');
    gr.addColorStop(1, 'rgba(240,244,252,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // shade the lower part and cut a soft flat bottom
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, base - 90, 0, base + 10);
  sh.addColorStop(0, 'rgba(160,175,205,0)');
  sh.addColorStop(1, 'rgba(160,175,205,0.55)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, base - 6, 0, base + 18);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, base - 6, W, H - base + 6);
  g.globalCompositeOperation = 'source-over';
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
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = 9000 + rnd() * 14000;
    const elev = 0.06 + Math.pow(rnd(), 1.6) * 0.32; // mostly low over the horizon
    const w = 2600 + rnd() * 3800;
    const card = MeshBuilder.CreatePlane(`cloud${i}`, { width: w, height: w / 2 }, scene);
    card.position = new Vector3(400 + Math.cos(a) * dist, 600 + Math.tan(elev) * dist, 100 + Math.sin(a) * dist);
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
