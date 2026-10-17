import { expect, test } from '@playwright/test';
import { ChunkedBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { Frame } from '../src/town/frame';
import type { Lot } from '../src/town/layout';
import { rooftopStuff } from '../src/town/parts';
import { addShop } from '../src/town/shops';
import { makeRng } from '../src/town/util';
import { SURF } from '../src/surface';

const context = (seed: number): Ctx => {
  const uv = { u0: 0, u1: 1, v0: 0, v1: 1 };
  return { main: new ChunkedBatch(900), signs: new ChunkedBatch(900, true), glass: new ChunkedBatch(900, true),
    atlas: { white: () => uv, uv: () => uv, has: () => true }, obstacles: [], rnd: makeRng(seed) } as unknown as Ctx;
};

test('pitched shop roofs omit covered equipment without shifting the town random stream or collision footprint', () => {
  const a = context(72), b = context(72), frame = new Frame(0, 0, 0, 1);
  rooftopStuff(a, frame, 60, 40, 80, 3); rooftopStuff(b, frame, 60, 40, 80, 3, false);
  expect(a.main.vertexCount).toBeGreaterThan(0); expect(b.main.vertexCount).toBe(0);
  expect(Array.from({ length: 16 }, () => a.rnd())).toEqual(Array.from({ length: 16 }, () => b.rnd()));
  let pitched = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const traditional = context(seed), modern = context(seed), rect = { minX: -60, maxX: 60, minZ: -40, maxZ: 40 };
    const lot = { id: 'roof-probe', label: '居酒屋', kind: 'shop', floors: 2 } as Lot;
    addShop(traditional, lot, rect, frame, 60, 40); addShop(modern, { ...lot, label: '洋服屋' }, rect, frame, 60, 40);
    expect(Array.from({ length: 16 }, () => traditional.rnd())).toEqual(Array.from({ length: 16 }, () => modern.rnd()));
    expect(traditional.obstacles).toEqual([rect]); expect(modern.obstacles).toEqual([rect]);
    const batches = traditional.main.all().map(([, batch]) => batch);
    if (batches.some(batch => batch.surf.some(tag => tag % 10 === SURF.roofTiles))) pitched++;
    for (const batch of batches) { expect(batch.pos.every(Number.isFinite)).toBe(true); expect(batch.nor.every(Number.isFinite)).toBe(true); }
  }
  expect(pitched).toBeGreaterThan(0);
});
