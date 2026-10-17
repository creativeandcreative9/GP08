import { expect, test } from '@playwright/test';
import { MeshBatch } from '../src/town/batch';
import { buildTrain, TRAIN } from '../src/town/train';

test('train windows are transparent inside their openings and the furnished carriage keeps its footprint', () => {
  const body = new MeshBatch(), glass = new MeshBatch(true);
  // TRAIN.length describes the shell; the existing cab coupler extends another 1.6 units.
  const original = new MeshBatch(); buildTrain(original);
  const originalX = original.pos.filter((_, i) => i % 3 === 0);
  buildTrain(body, glass);
  expect(glass.vertexCount).toBeGreaterThan(100);
  for (let i = 0; i < glass.vertexCount; i++) {
    expect(glass.col[i * 4 + 3]).toBeGreaterThan(0);
    expect(glass.col[i * 4 + 3]).toBeLessThan(1);
    expect(glass.pos[i * 3 + 1]).toBeGreaterThanOrEqual(19);
    expect(glass.pos[i * 3 + 1]).toBeLessThanOrEqual(32);
    expect(Math.abs(glass.pos[i * 3 + 2]! - TRAIN.z)).toBeCloseTo(17.5);
  }
  for (const mesh of [body, glass]) {
    expect(mesh.surf).toHaveLength(mesh.vertexCount);
    expect(mesh.pos.every(Number.isFinite)).toBe(true);
    expect(mesh.nor.every(Number.isFinite)).toBe(true);
    expect(Math.max(...mesh.idx)).toBeLessThan(mesh.vertexCount);
    const xs = mesh.pos.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(Math.min(...originalX));
    expect(Math.max(...xs)).toBeLessThanOrEqual(Math.max(...originalX));
  }
  expect(glass.uvs).toHaveLength(glass.vertexCount * 2);
});
