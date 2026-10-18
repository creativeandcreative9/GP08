import { expect, test } from '@playwright/test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { BlossomClouds } from '../src/town/blossoms';
import { ChunkedBatch, MeshBatch } from '../src/town/batch';
import { addCherry } from '../src/town/trees';
import { heightAt } from '../src/town/terrain';
import { makeRng } from '../src/town/util';
import type { Ctx } from '../src/town/ctx';

function tree(x: number, z: number, seed: number, scale = 1) {
  let draws = 0;
  const random = makeRng(seed);
  const main = new ChunkedBatch(100000), foliage = new ChunkedBatch(100000, true), blossoms = new BlossomClouds();
  const context = { main, foliage, blossoms, dec3: new MeshBatch(), rnd: () => { draws++; return random(); } } as unknown as Ctx;
  addCherry(context, x, z, scale);
  return { main: main.at(x, z), foliage, flowers: foliage.at(x, z), blossoms, draws };
}

test('full production cherry crowns retain varied volume and headroom on the compact low-quality path', () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial('foliage-test', scene);
  try {
    for (const scale of [.8, 1, 1.2]) {
      const x = 2500, z = -1200, ground = heightAt(x, z), built = tree(x, z, 9, scale);
      const meshes = built.blossoms.build(scene, built.foliage, material, false);
      const clouds = meshes.filter(mesh => mesh.name.startsWith('blossom-cloud-'));
      const matrices = clouds.flatMap(mesh => mesh.thinInstanceGetWorldMatrices());
      expect(matrices.length).toBeGreaterThan(0);
      const proportions: number[] = [];
      for (const matrix of matrices) {
        const m = matrix.m, width = Math.hypot(m[0]!, m[1]!, m[2]!), height = Math.hypot(m[4]!, m[5]!, m[6]!);
        expect(height).toBeGreaterThan(0);
        expect(m[13]! - height - ground).toBeGreaterThanOrEqual(30);
        proportions.push(height / width);
      }
      // Thick flower bunches must remain optimized; raising their aspect must not silently
      // send all of them back to the many-triangle stationary shadow representation.
      expect(Math.max(...proportions)).toBeGreaterThan(.65);
      const drawnTriangles = meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3 * Math.max(1, mesh.thinInstanceCount), 0);
      expect(drawnTriangles).toBeLessThan(built.flowers.triangleCount * .7);
      expect(meshes.every(mesh => !mesh.metadata?.blossomShadow)).toBe(true);
      expect(built.main.vertexCount).toBeLessThan(scale < .95 ? 200 : 650);
      expect(built.draws).toBe(10);
      for (const mesh of meshes) mesh.dispose(false, false);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('the rendered tree shape is deterministic and does not depend on the town random stream', () => {
  const first = tree(2200, -950, 1), second = tree(2200, -950, 938);
  expect(first.main.pos).toEqual(second.main.pos);
  expect(first.main.nor).toEqual(second.main.nor);
  expect(first.flowers.pos).toEqual(second.flowers.pos);
  expect(first.flowers.uvs).toEqual(second.flowers.uvs);
  expect(first.draws).toBe(10);
  expect(second.draws).toBe(10);
  for (const batch of [first.main, first.flowers]) {
    expect(batch.pos.every(Number.isFinite)).toBe(true);
    expect(batch.nor.every(Number.isFinite)).toBe(true);
    expect(batch.col).toHaveLength(batch.vertexCount * 4);
    expect(Math.max(...batch.idx)).toBeLessThan(batch.vertexCount);
  }
});
