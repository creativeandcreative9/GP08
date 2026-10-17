import { expect, test } from '@playwright/test';
import { SURF } from '../src/surface';
import { ChunkedBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { bicycle, postBox, vendingMachine, wasteBin } from '../src/town/fixtures';
import { Fx } from '../src/town/shapes';
import { hex } from '../src/town/util';

test('painted street fixtures never inherit plant or wood patterns and restore the surrounding material', () => {
  for (const kind of [0, 1, 2, 3, 4, 5, 6, 7]) for (const draw of [vendingMachine, wasteBin, postBox, (c: Ctx, fr: Fx, k: number) => bicycle(c, fr, hex([0x4a9a68, 0xc94a4a, 0xe0b040][k % 3]!))]) {
    const c = { main: new ChunkedBatch(1000), signs: new ChunkedBatch(1000, true), atlas: { uv: () => ({ u0: 0, u1: 1, v0: 0, v1: 1 }) } } as unknown as Ctx;
    const b = c.main.at(0, 0); b.surface = SURF.stone; b.box(-4, -3, 0, 1, 0, 1, [1, 1, 1]);
    const previous = [...b.surf], first = b.vertexCount;
    draw(c, new Fx(0, 0, 0, 0, 1), kind);
    expect(b.surf.slice(0, first)).toEqual(previous);
    expect(b.vertexCount).toBeGreaterThan(first);
    expect(new Set(b.surf.slice(first).map(tag => Math.floor(tag / 100)))).toEqual(new Set([SURF.paintedMetal / 100]));
    expect(b.surface).toBe(SURF.stone);
  }
});
