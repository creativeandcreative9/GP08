import { expect, test } from '@playwright/test';
import { SURF } from '../src/surface';
import { MeshBatch } from '../src/town/batch';
import { roundedFoliage } from '../src/town/topiary';

test('rounded shrubs are closed shared-vertex solids with outward unit normals and isolated surface tags', () => {
  const b = new MeshBatch(true); b.surface = SURF.stone; b.axis = 2;
  b.box(-3, -1, 0, 4, 0, 2, [.5, .5, .5]);
  const previous = { positions: [...b.pos], tags: [...b.surf] }, first = b.vertexCount, index = b.idx.length;
  roundedFoliage(b, 10, 20, 30, 3, 4, 2, [.3, .6, .2]);
  expect(b.pos.slice(0, first * 3)).toEqual(previous.positions); expect(b.surf.slice(0, first)).toEqual(previous.tags);
  expect(b.vertexCount - first).toBe(62); expect((b.idx.length - index) / 3).toBe(120);
  expect(b.surface).toBe(SURF.stone); expect(b.axis).toBe(2);
  expect(new Set(b.surf.slice(first))).toEqual(new Set([SURF.roundedFoliage]));
  expect(b.uvs.length).toBe(b.vertexCount * 2);
  for (let axis = 0; axis < 3; axis++) {
    const points = b.pos.slice(first * 3).filter((_, i) => i % 3 === axis);
    expect(Math.min(...points)).toBeCloseTo([7, 16, 28][axis]!); expect(Math.max(...points)).toBeCloseTo([13, 24, 32][axis]!);
  }
  const edges = new Map<string, number>();
  for (let i = index; i < b.idx.length; i += 3) {
    const tri = b.idx.slice(i, i + 3), points = tri.map(j => b.pos.slice(j * 3, j * 3 + 3));
    const a = points[0]!, u = points[1]!.map((n, j) => n - a[j]!), v = points[2]!.map((n, j) => n - a[j]!);
    const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    expect(Math.hypot(...cross)).toBeGreaterThan(.001);
    // Babylon front faces have the geometric cross product opposite the outward normal.
    expect(cross.reduce((sum, n, j) => sum + n * (a[j]! - [10, 20, 30][j]!), 0)).toBeLessThan(0);
    for (let j = 0; j < 3; j++) { const key = [tri[j]!, tri[(j + 1) % 3]!].sort((a, b) => a - b).join(':'); edges.set(key, (edges.get(key) ?? 0) + 1); }
  }
  expect([...edges.values()].every(n => n === 2)).toBe(true);
  for (let i = first; i < b.vertexCount; i++) {
    const normal = b.nor.slice(i * 3, i * 3 + 3); expect(Math.hypot(...normal)).toBeCloseTo(1);
    expect(normal.reduce((sum, n, j) => sum + n * (b.pos[i * 3 + j]! - [10, 20, 30][j]!), 0)).toBeGreaterThan(0);
  }
});
