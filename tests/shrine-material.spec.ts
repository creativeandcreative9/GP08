import { expect, test } from '@playwright/test';
import { SURF } from '../src/surface';
import { ChunkedBatch, MeshBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { buildSummit } from '../src/town/summit';
import { SUMMIT_XZ, heightAt } from '../src/town/terrain';
import { hex } from '../src/town/util';

test('shrine lacquer bypasses brick patterns while wood and lantern stone retain their own finish', () => {
  const c = { main: new ChunkedBatch(900), dec1: new MeshBatch(), obstacles: [] } as unknown as Ctx;
  const batch = c.main.at(SUMMIT_XZ.x, SUMMIT_XZ.z);
  buildSummit(c);
  const red = hex(0xc94932), wood = hex(0x9f7953), stone = hex(0xaaa99e);
  let paintedVertices = 0, woodVertices = 0, stoneVertices = 0;
  const toriiRedHeights: number[] = [], y0 = heightAt(SUMMIT_XZ.x, SUMMIT_XZ.z);
  for (let i = 0; i < batch.vertexCount; i++) {
    const [r, g, b] = batch.col.slice(i * 4, i * 4 + 3) as [number, number, number];
    const tag = batch.surf[i]!;
    // Shade variations keep the pigment ratios, so this also checks beam caps and undersides.
    if (Math.abs(r / g - red[0] / red[1]) < 1e-6 && Math.abs(g / b - red[1] / red[2]) < 1e-6) {
      expect(tag).toBeGreaterThanOrEqual(SURF.paintedMetal);
      expect(tag).toBeLessThan(200);
      paintedVertices++;
      if (Math.abs(batch.pos[i * 3 + 2]! - (SUMMIT_XZ.z - 34)) < 5) toriiRedHeights.push(batch.pos[i * 3 + 1]! - y0);
    }
    if ([r, g, b].every((n, j) => Math.abs(n - wood[j]!) < 1e-6)) {
      expect(tag % 10).toBe(SURF.plain); woodVertices++;
    }
    if ([r, g, b].every((n, j) => Math.abs(n - stone[j]!) < 1e-6)) {
      expect(tag % 10).toBe(SURF.plain); stoneVertices++;
    }
  }
  expect(paintedVertices).toBeGreaterThan(300);
  expect(woodVertices).toBeGreaterThan(100);
  expect(stoneVertices).toBeGreaterThan(100);
  // The red taper starts above the black foot, avoiding intersecting red and black skins.
  expect(Math.min(...toriiRedHeights)).toBeCloseTo(7.7);
  expect(batch.surface).toBe(SURF.plain);
});
