import { expect, test } from '@playwright/test';
import { SURF } from '../src/surface';
import { MeshBatch } from '../src/town/batch';
import { canopyStructure, platformBench, platformCoping, railProfile, sleeperFasteners } from '../src/town/platform-detail';
import type { V3 } from '../src/town/util';

function consistent(b: MeshBatch): void {
  expect(b.pos.length).toBe(b.vertexCount * 3);
  expect(b.nor.length).toBe(b.vertexCount * 3);
  expect(b.col.length).toBe(b.vertexCount * 4);
  expect(b.surf.length).toBe(b.vertexCount);
  expect(b.pos.every(Number.isFinite)).toBe(true);
  expect(b.nor.every(Number.isFinite)).toBe(true);
  expect(b.idx.every(i => Number.isInteger(i) && i >= 0 && i < b.vertexCount)).toBe(true);
  for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(...b.nor.slice(i, i + 3))).toBeGreaterThan(.1);
}

test('detailed rails retain the original rail envelope and restore the caller material', () => {
  for (const end of [[40, 5, 0], [0, 5, 40], [24, 7, 32]] as V3[]) {
    const b = new MeshBatch(), start: V3 = [0, 5, 0];
    b.surface = SURF.bark; b.axis = 2;
    railProfile(b, start, end);
    const length = Math.hypot(end[0], end[2]), dx = end[0] / length, dz = end[2] / length;
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i]!, y = b.pos[i + 1]!, z = b.pos[i + 2]!;
      const along = x * dx + z * dz;
      expect(along).toBeGreaterThanOrEqual(-1e-8); expect(along).toBeLessThanOrEqual(length + 1e-8);
      expect(Math.abs(-x * dz + z * dx)).toBeLessThanOrEqual(.950001);
      expect(Math.abs(y - (5 + (end[1] - 5) * along / length))).toBeLessThanOrEqual(1.200001);
    }
    expect(b.surf.every(tag => tag === SURF.paintedMetal)).toBe(true);
    expect([b.surface, b.axis]).toEqual([SURF.bark, 2]);
    expect(b.vertexCount).toBeLessThanOrEqual(40);
    consistent(b);
  }
});

test('canopy fittings clear the walking height and keep low pieces beside existing posts', () => {
  for (const [zc, depth] of [[744, 64], [900, 110]]) {
    const b = new MeshBatch(); b.surface = SURF.stone; b.axis = 1;
    canopyStructure(b, zc!, depth!, -330, 330);
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i]!, y = b.pos[i + 1]!, z = b.pos[i + 2]!;
      expect(x).toBeGreaterThanOrEqual(-330); expect(x).toBeLessThanOrEqual(330);
      expect(z).toBeGreaterThanOrEqual(zc! - depth! / 2); expect(z).toBeLessThanOrEqual(zc! + depth! / 2);
      expect(y).toBeGreaterThanOrEqual(6);
      if (y < 32) expect([-210, 190].some(post => Math.hypot(x - post, z - (zc! + depth! / 2 - 6)) < 1.6)).toBe(true);
    }
    expect([b.surface, b.axis]).toEqual([SURF.stone, 1]);
    expect(b.vertexCount).toBeLessThan(1400);
    consistent(b);
  }
});

test('platform coping, seats and rail fasteners remain small consistent decorations', () => {
  const bench = new MeshBatch(); platformBench(bench, 100, 750);
  for (let i = 0; i < bench.pos.length; i += 3) {
    expect(bench.pos[i]!).toBeGreaterThanOrEqual(88); expect(bench.pos[i]!).toBeLessThanOrEqual(112);
    expect(bench.pos[i + 2]!).toBeGreaterThanOrEqual(750); expect(bench.pos[i + 2]!).toBeLessThanOrEqual(758);
    expect(bench.pos[i + 1]!).toBeGreaterThanOrEqual(6); expect(bench.pos[i + 1]!).toBeLessThanOrEqual(20);
  }
  const coping = new MeshBatch(); platformCoping(coping);
  for (let i = 0; i < coping.pos.length; i += 3) {
    const z = coping.pos[i + 2]!;
    expect(z >= 774.5 && z <= 779.8 || z >= 828.2 && z <= 833.5).toBe(true);
    expect(coping.pos[i + 1]!).toBeCloseTo(6.04);
  }
  const clips = new MeshBatch(); sleeperFasteners(clips, 0, .65, 0, 1, 0);
  expect(clips.vertexCount).toBeLessThanOrEqual(24);
  for (const b of [bench, coping, clips]) consistent(b);
  expect(bench.vertexCount + coping.vertexCount + clips.vertexCount).toBeLessThan(600);
});
