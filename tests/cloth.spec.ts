import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { ClothBanners } from '../src/town/cloth';
import { ChunkedBatch } from '../src/town/batch';
import { HeightPass } from '../src/town/height-pass';
import type { Ctx } from '../src/town/ctx';

test('cloth preserves its fixed top and pole edge, atlas region and conservative animated bounds', () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial('cloth-test', scene);
  try {
    const cloth = new ClothBanners(), uv = { u0: .1, u1: .3, v0: .2, v1: .8 };
    cloth.panel([[10, 5, 20], [16, 5, 20], [16, 28, 20], [10, 28, 20]], [0, 0, 1], uv, -1);
    const meshes = cloth.build(scene, material);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!, positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const weights = mesh.getVerticesData('gp08Cloth')!, tex = mesh.getVerticesData(VertexBuffer.UVKind)!;
    expect(positions.length / 3).toBeLessThanOrEqual(64);
    let free = 0;
    const bounds = mesh.getBoundingInfo().boundingBox;
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!, weight = weights[i * 4 + 2]!;
      if (y === 28 || x === 10) expect(weight).toBe(0);
      else if (weight > 0) free++;
      expect(weight).toBeGreaterThanOrEqual(0); expect(weight).toBeLessThanOrEqual(.90001);
      expect(x - weight).toBeGreaterThanOrEqual(bounds.minimum.x); expect(x + weight).toBeLessThanOrEqual(bounds.maximum.x);
      expect(z - weight).toBeGreaterThanOrEqual(bounds.minimum.z); expect(z + weight).toBeLessThanOrEqual(bounds.maximum.z);
      expect(tex[i * 2]!).toBeGreaterThan(uv.u0); expect(tex[i * 2]!).toBeLessThan(uv.u1);
      expect(tex[i * 2 + 1]!).toBeGreaterThan(uv.v0); expect(tex[i * 2 + 1]!).toBeLessThan(uv.v1);
    }
    expect(free).toBeGreaterThan(8); expect(mesh.isPickable).toBe(false);
    expect(material.pluginManager!.getPlugin('GP08ClothWind')).toBeTruthy();
  } finally { scene.dispose(); engine.dispose(); }
});

test('shop height adjustment moves cloth with its lintel and does not resize earlier or later geometry', () => {
  const cloth = new ClothBanners(), batches = () => new ChunkedBatch(900, true);
  const c = { main: batches(), signs: batches(), glass: batches(), cloth } as unknown as Ctx;
  const pass = new HeightPass(c);
  cloth.panel([[0, 10, 0], [8, 10, 0], [8, 34, 0], [0, 34, 0]], [0, 0, 1], { u0: 0, u1: 1, v0: 0, v1: 1 });
  pass.applyAbove(4, .82);
  const b = cloth.batches.all()[0]![1], ys = b.pos.filter((_, i) => i % 3 === 1);
  expect(Math.max(...ys)).toBeCloseTo(28.6); expect(Math.min(...ys)).toBeCloseTo(8.92);
  const before = [...b.pos]; pass.applyAbove(4, .82); expect(b.pos).toEqual(before);
});

test('both printable sides of a pole banner have identical wind weights and phase', () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial('two-sided-cloth', scene);
  try {
    const cloth = new ClothBanners(), uv = { u0: 0, u1: 1, v0: 0, v1: 1 };
    cloth.panel([[10.2, 5, 20], [10.2, 5, 26], [10.2, 28, 26], [10.2, 28, 20]], [1, 0, 0], uv, -1);
    cloth.panel([[9.8, 5, 26], [9.8, 5, 20], [9.8, 28, 20], [9.8, 28, 26]], [-1, 0, 0], uv, 1);
    const mesh = cloth.build(scene, material)[0]!, positions = mesh.getVerticesData(VertexBuffer.PositionKind)!, weights = mesh.getVerticesData('gp08Cloth')!;
    const front = new Map<string, number[]>();
    for (let i = 0; i < positions.length / 3; i++) if (positions[i * 3]! > 10) front.set(`${positions[i * 3 + 1]},${positions[i * 3 + 2]}`, Array.from(weights.slice(i * 4, i * 4 + 4)));
    let compared = 0;
    for (let i = 0; i < positions.length / 3; i++) if (positions[i * 3]! < 10) {
      expect(Array.from(weights.slice(i * 4, i * 4 + 4))).toEqual(front.get(`${positions[i * 3 + 1]},${positions[i * 3 + 2]}`)); compared++;
    }
    expect(compared).toBeGreaterThan(16);
  } finally { scene.dispose(); engine.dispose(); }
});

test('the actual GPU cloth shader moves the free hem while its top and rigid signs stay fixed', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const { ClothBanners } = await load('/src/town/cloth.ts'), { MeshBatch } = await load('/src/town/batch.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine);
    scene.clearColor.set(0, 0, 0, 1);
    const camera = new FreeCamera('camera', new Vector3(0, 8, -20), scene); camera.setTarget(new Vector3(0, 8, 0));
    camera.mode = 1; camera.minZ = .1; camera.orthoLeft = -8; camera.orthoRight = 8; camera.orthoTop = 8; camera.orthoBottom = -8;
    const material = new StandardMaterial('shared-atlas-test', scene); material.disableLighting = true;
    material.emissiveColor.set(1, 1, 1); material.backFaceCulling = false;
    const cloth = new ClothBanners();
    cloth.panel([[-4, 2, 0], [4, 2, 0], [4, 14, 0], [-4, 14, 0]], [0, 0, -1], { u0: 0, u1: 1, v0: 0, v1: 1 });
    cloth.build(scene, material);
    const rigid = new MeshBatch(); rigid.quad([5.4, 4, 0], [7.4, 4, 0], [7.4, 7, 0], [5.4, 7, 0], [1, 1, 1], [0, 0, -1]);
    rigid.toMesh('rigid-sign', scene, material);
    scene.onBeforeRenderObservable.clear();
    const wind = material.pluginManager.getPlugin('GP08ClothWind');
    const sample = async (time: number) => {
      wind.time = time; scene.render(); await scene.whenReadyAsync(); scene.render();
      const rgba = new Uint8Array(256 * 256 * 4), gl = engine._gl;
      gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return { rgba, image: canvas.toDataURL('image/png') };
    };
    const a = await sample(0), b = await sample(1.6);
    let changed = 0, topChanged = 0, rigidChanged = 0, topPixels = 0, rigidPixels = 0;
    let bottomA = 0, bottomB = 0, countA = 0, countB = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4, onA = a.rgba[i]! > 128, onB = b.rgba[i]! > 128, moved = onA !== onB;
      if (moved) changed++;
      if (y >= 222 && x < 205) { if (onA) topPixels++; if (moved) topChanged++; }
      if (x > 210) { if (onA) rigidPixels++; if (moved) rigidChanged++; }
      if (y < 90 && x < 205) { if (onA) { bottomA += x; countA++; } if (onB) { bottomB += x; countB++; } }
    }
    const bottomShift = Math.abs(bottomA / countA - bottomB / countB);
    scene.dispose(); engine.dispose(); canvas.remove();
    return { changed, topChanged, rigidChanged, topPixels, rigidPixels, bottomShift, images: [a.image, b.image] };
  });
  fs.mkdirSync('screenshots', { recursive: true });
  result.images.forEach((image, i) => fs.writeFileSync(`screenshots/cloth-motion-${i}.png`, Buffer.from(image.split(',')[1]!, 'base64')));
  const { images: _images, ...stats } = result; console.log(JSON.stringify({ ...stats, errors }));
  expect(errors).toEqual([]); expect(result.changed).toBeGreaterThan(50); expect(result.bottomShift).toBeGreaterThan(.2);
  expect(result.topPixels).toBeGreaterThan(50); expect(result.topChanged).toBeLessThanOrEqual(8);
  expect(result.rigidPixels).toBeGreaterThan(100); expect(result.rigidChanged).toBe(0);
});
