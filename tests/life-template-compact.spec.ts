import { expect, test } from '@playwright/test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { MeshBatch } from '../src/town/batch';
import { smoothBevels } from '../src/town/smooth';
import { compactLifeTemplate } from '../src/life/compact-template';
import { Instances } from '../src/life/inst';
import { buildPerson, buildFused, buildSeated } from '../src/life/people';
import { OUTFITS, STAFF } from '../src/life/outfits';
import { buildDog } from '../src/life/animals';
import { buildWheel, CAR_KINDS } from '../src/life/carmodels';

const CHANNELS = [['pos', 3], ['nor', 3], ['col', 4], ['surf', 1]] as const;
function snapshot(batch: MeshBatch): { corners: Uint32Array[]; bounds: number[]; indices: number } {
  const channels: readonly (readonly ['pos' | 'nor' | 'col' | 'surf' | 'uvs', number])[] = batch.withUV ? [...CHANNELS, ['uvs', 2]] : CHANNELS;
  const corners = channels.map(([key, size]) => {
    const bits = new Uint32Array(new Float32Array(batch[key]).buffer);
    const expanded = new Uint32Array(batch.idx.length * size);
    batch.idx.forEach((index, corner) => {
      for (let k = 0; k < size; k++) expanded[corner * size + k] = bits[index * size + k]!;
    });
    return expanded;
  });
  const positions = new Float32Array(batch.pos), bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    bounds[i % 3] = Math.min(bounds[i % 3]!, positions[i]!);
    bounds[i % 3 + 3] = Math.max(bounds[i % 3 + 3]!, positions[i]!);
  }
  return { corners, bounds, indices: batch.idx.length };
}
function verify(batch: MeshBatch): void {
  const before = snapshot(batch);
  compactLifeTemplate(batch);
  assert.deepEqual(snapshot(batch), before);
  expect(batch.idx.every(index => Number.isInteger(index) && index >= 0 && index < batch.vertexCount)).toBe(true);
  let invalidNormals = 0;
  for (let i = 0; i < batch.nor.length; i += 3) {
    const length = Math.hypot(...batch.nor.slice(i, i + 3));
    if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) invalidNormals++;
  }
  expect(invalidNormals).toBe(0);
}

test('life compaction preserves GPU triangle attributes, UV/surface/colour/normal seams and signed zero', () => {
  const batch = new MeshBatch(true);
  const points = [[1, 0, 1], [1, 0, 2], [2, 0, 2], [2, 0, 1]] as const;
  const uv = [[0, 0], [0, 1], [1, 1], [1, 0]] as const;
  batch.card(points, [.5, .5, .5], [0, 1, 0], uv);
  batch.card(points.map(([x, y, z]) => [x + 1e-10, y, z]) as unknown as typeof points, [.5, .5, .5], [0, 1, 0], uv);
  batch.card(points, [.5, .5, .5], [0, -1, 0], uv);
  batch.card(points, [.6, .5, .5], [0, 1, 0], uv);
  batch.card(points, [.5, .5, .5], [0, 1, 0], [[.5, 0], [.5, 1], [1, 1], [1, 0]]);
  batch.surface = 9;
  batch.card(points, [.5, .5, .5], [0, 1, 0], uv);
  batch.surface = 0;
  batch.card(points.map(([x, , z]) => [x, -0, z]) as unknown as typeof points, [.5, .5, .5], [0, 1, 0], uv);
  verify(batch);
  expect(batch.vertexCount).toBe(22); // duplicate cards and the two unchanged UV corners merge
});

test('different complete attributes remain separate even when their 32-bit hashes collide', () => {
  const batch = new MeshBatch();
  let prefix = 2166136261;
  for (const value of new Uint32Array(new Float32Array([1, 0, 1, 0, 1, 0, .5, .5, .5]).buffer)) prefix = Math.imul(prefix ^ value, 16777619);
  const alpha = new Uint32Array(new Float32Array([1, .5]).buffer);
  const surfaceBits = (Math.imul(prefix ^ alpha[0]!, 16777619) ^ Math.imul(prefix ^ alpha[1]!, 16777619)) >>> 0;
  const otherSurface = new Float32Array(new Uint32Array([surfaceBits]).buffer)[0]!;
  expect(Number.isFinite(otherSurface)).toBe(true);
  for (const alternate of [false, true, false, true]) {
    batch.pos.push(1, 0, 1); batch.nor.push(0, 1, 0); batch.col.push(.5, .5, .5, alternate ? .5 : 1); batch.surf.push(alternate ? otherSurface : 0);
  }
  batch.idx = [0, 1, 2, 3, 0, 1];
  verify(batch);
  expect(batch.vertexCount).toBe(2);
});

test('all current life templates retain every triangle corner and bounds after smoothing and compaction', () => {
  const batches: MeshBatch[] = [];
  for (const outfit of OUTFITS) {
    const parts = buildPerson(outfit);
    batches.push(parts.body, parts.leg, parts.arm);
    if (parts.armHold) batches.push(parts.armHold);
  }
  for (const outfit of Object.values(STAFF)) batches.push(buildFused(outfit));
  for (const [id, height] of [['casual_woman_pink', 6.2], ['office_woman', 6.2], ['schoolgirl_blazer', 6.2], ['elder_man', 7.2], ['office_man_gray', 7.2]] as const) {
    batches.push(buildSeated(OUTFITS.find(outfit => outfit.id === id)!, height));
  }
  batches.push(buildDog());
  for (const kind of CAR_KINDS) for (const palette of kind.palettes) {
    const batch = new MeshBatch(); kind.build(batch, palette); batches.push(batch);
  }
  const wheel = new MeshBatch(); buildWheel(wheel); batches.push(wheel);
  for (const batch of batches) { smoothBevels(batch); verify(batch); }
});

test('Instances uploads compacted life geometry after the original normal smoothing pass', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const batch = buildDog(), reference = buildDog();
    smoothBevels(reference);
    const expected = snapshot(reference);
    const instances = new Instances('life_compact_test', batch, new StandardMaterial('test', scene), scene, 1);
    expect(snapshot(batch)).toEqual(expected);
    expect(instances.vertexCount).toBe(batch.vertexCount);
    expect(instances.vertexCount).toBeLessThan(reference.vertexCount);
    expect(instances.mesh.getIndices()?.length).toBe(reference.idx.length);
  } finally { scene.dispose(); engine.dispose(); }
});
