import { expect, test } from '@playwright/test';
import { addNeighbourhoodDetails } from '../src/town/furniture';
import { ChunkedBatch, MeshBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { SURF } from '../src/surface';
import { roadClearance } from '../src/town/site';

test('frontage details retain the original random stream, geometry and walkable approaches', () => {
  const build = () => {
    const obstacle = { minX: 100, maxX: 140, minZ: 200, maxZ: 240 };
    const c = { main: new ChunkedBatch(900), signs: new ChunkedBatch(900, true), foliage: new ChunkedBatch(900, true), topiary: new ChunkedBatch(900),
      forest: new ChunkedBatch(1800), dec0: new MeshBatch(), dec1: new MeshBatch(), dec2: new MeshBatch(), dec3: new MeshBatch(),
      atlas: { uv: () => ({ u0: 0, u1: 1, v0: 0, v1: 1 }) }, obstacles: Object.freeze([obstacle]),
      home: { x: 30, z: 400 }, spots: { 'e-wagashi': { x: 160, z: -1000, fx: -1, fz: 0, hu: 40, hv: 20 }, shop: { x: 400, z: 300, fx: 0, fz: -1, hu: 40, hv: 20 } }, report: [],
      rnd: () => { throw new Error('Supplemental details consumed the existing town random stream'); } } as unknown as Ctx;
    const original = c.main.at(0, 0); original.surface = SURF.stone; original.box(2, 4, 0, 1, 2, 4, [.5, .5, .5]);
    const positions = [...original.pos], indices = [...original.idx], tags = [...original.surf], count = original.vertexCount;
    const stats = addNeighbourhoodDetails(c, { counts: {}, verts: {}, items: [] });
    expect(original.pos.slice(0, positions.length)).toEqual(positions); expect(original.idx.slice(0, indices.length)).toEqual(indices);
    expect(original.surf.slice(0, count)).toEqual(tags); expect(original.surface).toBe(SURF.stone);
    expect(c.obstacles).toEqual([obstacle]); expect(c.obstacles[0]).toBe(obstacle);
    expect(stats.items.length).toBeGreaterThan(8); expect(stats.items.length).toBeLessThanOrEqual(48);
    const vertices = c.main.vertexCount + c.signs.vertexCount + c.foliage!.vertexCount + c.topiary!.vertexCount - count;
    expect(vertices).toBeLessThan(14000);
    for (const item of stats.items) {
      expect(roadClearance(item.x, item.z).d).toBeGreaterThanOrEqual(16.99);
      expect(Math.hypot(item.x - c.home!.x, item.z - c.home!.z)).toBeGreaterThan(32);
      const shop = c.spots.shop!, u = -(item.x - shop.x), v = -(item.z - shop.z);
      expect(Math.abs(u) < 27 && v > shop.hv - 6 && v < shop.hv + 80).toBe(false);
    }
    return { items: stats.items, positions: c.main.all().map(([key, b]) => [key, b.pos]), vertices, report: c.report };
  };
  const first = build(), second = build();
  expect(first.report.some(line => /shopping street trees: [12]/.test(line))).toBe(true);
  expect(first.report.some(line => /avenue postal points: 1/.test(line))).toBe(true); expect(second.items).toEqual(first.items); expect(second.positions).toEqual(first.positions);
  console.log(JSON.stringify({ items: first.items.length, addedVertices: first.vertices, report: first.report }));
});
