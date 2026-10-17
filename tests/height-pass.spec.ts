import { expect, test } from '@playwright/test';
import { ChunkedBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { HeightPass, SHOP_HEIGHT_SCALE } from '../src/town/height-pass';

test('shop proportions preserve existing geometry, floor levels and later furniture while keeping roof normals valid', () => {
  const c = { main: new ChunkedBatch(1000), signs: new ChunkedBatch(1000, true), glass: new ChunkedBatch(1000, true), foliage: new ChunkedBatch(1000, true) } as Ctx;
  const b = c.main.at(0, 0);
  b.box(-10, -5, 0, 50, 0, 8, [1, 1, 1]);
  const before = [...b.pos], pass = new HeightPass(c), first = b.vertexCount;
  b.box(0, 8, 4, 34, 0, 1, [1, 1, 1]); // a door starts on the unchanged shop floor
  const roof = b.vertexCount;
  b.quad([0, 4, 0], [8, 12, 0], [8, 12, 10], [0, 4, 10], [1, 1, 1], [-1, 1, 0]);
  const colors = [...b.col], triangles = [...b.idx];
  pass.applyAbove(4, SHOP_HEIGHT_SCALE);
  expect(b.pos.slice(0, before.length)).toEqual(before);
  const doorY = b.pos.slice(first * 3, roof * 3).filter((_, i) => i % 3 === 1);
  expect(Math.min(...doorY)).toBe(4);
  expect((Math.max(...doorY) - 4) * .08).toBeCloseTo(1.968); // about two metres
  const edge = [b.pos[(roof + 1) * 3]! - b.pos[roof * 3]!, b.pos[(roof + 1) * 3 + 1]! - b.pos[roof * 3 + 1]!, 0];
  for (let i = roof; i < b.vertexCount; i++) {
    const n = b.nor.slice(i * 3, i * 3 + 3);
    expect(Math.hypot(...n)).toBeCloseTo(1); expect(n[0]! * edge[0]! + n[1]! * edge[1]!).toBeCloseTo(0);
  }
  expect(b.col).toEqual(colors); expect(b.idx).toEqual(triangles);
  const signs = c.signs.at(0, 0); signs.box(0, 2, 4, 36, 0, 1, [1, 1, 1]);
  const scaledOnce = [...b.pos]; pass.applyAbove(4, SHOP_HEIGHT_SCALE);
  expect(b.pos).toEqual(scaledOnce); // a second architectural phase must not resize the first one again
  const chair = b.vertexCount; b.box(20, 28, 6, 12, 0, 8, [1, 1, 1]);
  expect(Math.max(...b.pos.slice(chair * 3).filter((_, i) => i % 3 === 1))).toBe(12);
});


test('lower shop fronts retain upper-storey heights and translate roof slopes intact', () => {
  const c = { main: new ChunkedBatch(1000), signs: new ChunkedBatch(1000, true), glass: new ChunkedBatch(1000, true) } as Ctx;
  const b = c.main.at(0, 0), pass = new HeightPass(c), floor = 3.5, ceiling = 45.5;
  b.box(0, 8, floor, 37.5, 0, 1, [1, 1, 1]);
  const upper = b.vertexCount; b.box(0, 8, ceiling, ceiling + 35, 0, 1, [1, 1, 1]);
  const roof = b.vertexCount;
  b.quad([0, 85, 0], [8, 91, 0], [8, 91, 10], [0, 85, 10], [1, 1, 1], [-.6, .8, 0]);
  const roofNormals = b.nor.slice(roof * 3);
  pass.applyAbove(floor, SHOP_HEIGHT_SCALE, ceiling);
  const ys = (start: number, end: number) => b.pos.slice(start * 3, end * 3).filter((_, i) => i % 3 === 1);
  const doorYs = ys(0, upper), upperYs = ys(upper, roof), roofYs = ys(roof, b.vertexCount);
  expect(Math.min(...doorYs)).toBe(floor);
  expect((Math.max(...doorYs) - floor) * .08).toBeCloseTo(2.2304);
  expect(Math.max(...upperYs) - Math.min(...upperYs)).toBeCloseTo(35);
  expect(Math.min(...upperYs)).toBeCloseTo(ceiling - 7.56);
  expect(Math.max(...roofYs) - Math.min(...roofYs)).toBeCloseTo(6);
  expect(b.nor.slice(roof * 3)).toEqual(roofNormals);
});
