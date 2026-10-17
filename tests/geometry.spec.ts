import { expect, test } from '@playwright/test';
import { MeshBatch } from '../src/town/batch';
import { HB } from '../src/town/housekit';
import { Frame } from '../src/town/frame';
import { SURF } from '../src/surface';
import { foliageCluster } from '../src/town/leaf';

test('planar quads share vertices with consistent winding, UVs and surface tags', () => {
  const b = new MeshBatch(true); b.surface = SURF.tile;
  b.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [1, 1, 1], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  expect(b.vertexCount).toBe(4); expect(b.triangleCount).toBe(2); expect(b.idx).toEqual([0, 2, 1, 0, 3, 2]); expect(b.surf).toEqual([2, 2, 2, 2]); expect(b.uvs).toHaveLength(8);
  const h = new HB(b, new Frame(0, 0, 0, 1));
  h.surf(SURF.concrete, () => h.wallV(0, 1, 0, 1, 0, 1, [1, 1, 1]));
  expect(b.surf.slice(4)).toEqual([7, 7, 7, 7]); expect(b.surf.length).toBe(b.vertexCount);
  const terrain = new MeshBatch(); terrain.quad([0, 0, 0], [1, 0, 0], [1, 1, 1], [0, 0, 1], [1, 1, 1]); expect(terrain.vertexCount).toBe(6);
});

test('foliage sprites retain finite normals and inset UVs within the 2048 atlas', () => {
  const b = new MeshBatch(true); foliageCluster(b, 0, 50, 0, 15, .7, 'bloomA', .3);
  expect(b.vertexCount).toBe(31); expect(b.triangleCount).toBe(26);
  expect(b.surf).toHaveLength(b.vertexCount); expect(b.nor.every(Number.isFinite)).toBe(true);
  expect(b.uvs.every(n => n > 0 && n < 1)).toBe(true); expect(Math.max(...b.idx)).toBeLessThan(b.vertexCount);
  for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(b.nor[i]!, b.nor[i + 1]!, b.nor[i + 2]!)).toBeCloseTo(1);
});

test('distant building geometry removes subpixel posts while retaining walls and aligned material tags', async () => {
  const { distantGeometry } = await import('../src/town/lod');
  const b = new MeshBatch(); b.surface = SURF.concrete;
  b.box(-50, 50, 0, 30, -20, 20, [.7, .7, .7]);
  for (let x = -45; x <= 45; x += 5) b.box(x - .3, x + .3, 0, 9, 23, 23.5, [.3, .3, .3]);
  const far = distantGeometry({ positions: b.pos, normals: b.nor, colors: b.col, indices: b.idx, surfaces: b.surf });
  expect(far.triangleCount).toBeLessThan(b.triangleCount * .7); expect(far.triangleCount).toBeGreaterThanOrEqual(10);
  expect(far.surf.length).toBe(far.vertexCount); expect(far.pos.every(Number.isFinite)).toBe(true);
  expect(far.nor.every(Number.isFinite)).toBe(true); expect(Math.max(...far.idx)).toBeLessThan(far.vertexCount);
  expect(Math.max(...far.pos.filter((_, i) => i % 3 === 0))).toBeCloseTo(50);
});

test('bevel smoothing retains geometry, unit normals and the hard corners of a box', async () => {
  const { smoothBevels } = await import('../src/town/smooth');
  const b = new MeshBatch(); b.box(-1, 1, 0, 2, -1, 1, [.5, .5, .5]);
  const vertices = [...b.pos], indices = [...b.idx], normals = [...b.nor]; smoothBevels(b);
  expect(b.pos).toEqual(vertices); expect(b.idx).toEqual(indices); expect(b.nor).toEqual(normals);
  for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(b.nor[i]!, b.nor[i + 1]!, b.nor[i + 2]!)).toBeCloseTo(1);
});

test('the public avatar keeps its shoes on the ground on every interactive seat height', async () => {
  const { NullEngine, Scene } = await import('@babylonjs/core');
  const { createPublicAvatar } = await import('../src/player/avatar');
  const engine = new NullEngine(), scene = new Scene(engine), avatar = createPublicAvatar(scene);
  for (const height of [6.5, 7, 8]) {
    avatar.gait.sit(0, height);
    const shoes = avatar.root.getChildMeshes().filter(m => m.name === 'player-shoe');
    expect(shoes).toHaveLength(2);
    for (const shoe of shoes) { shoe.computeWorldMatrix(true); expect(shoe.getBoundingInfo().boundingBox.minimumWorld.y).toBeCloseTo(0, 3); }
  }
  avatar.gait.update(0, 0);
  for (const shoe of avatar.root.getChildMeshes().filter(m => m.name === 'player-shoe')) { shoe.computeWorldMatrix(true); expect(shoe.getBoundingInfo().boundingBox.minimumWorld.y).toBeCloseTo(-.1, 3); }
  scene.dispose(); engine.dispose();
});


test('standing residents retain their world height and seated feet reach the floor for every body type', async () => {
  const { OUTFITS } = await import('../src/life/outfits');
  const { buildFused, buildSeated } = await import('../src/life/people');
  for (const [build, height] of [['man', 21.01], ['woman', 19.698], ['child', 15.37]] as const) {
    const base = OUTFITS.find(o => o.build === build)!;
    const outfit = { ...base, hair: { ...base.hair, style: 'none' as const }, hat: undefined, stoop: 0, bag: undefined, cane: undefined };
    const standing = buildFused(outfit), y = standing.pos.filter((_, i) => i % 3 === 1);
    expect(Math.min(...y), build).toBeCloseTo(0, 3);
    expect(Math.max(...y), build).toBeCloseTo(height, 3);
    for (const seat of [6.2, 7.2]) {
      const seated = buildSeated(outfit, seat), sy = seated.pos.filter((_, i) => i % 3 === 1);
      expect(Math.min(...sy) + seat, build).toBeCloseTo(0, 3);
      expect(seated.pos.every(Number.isFinite), build).toBe(true);
    }
  }
});
