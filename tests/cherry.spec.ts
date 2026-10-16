import { expect, test } from '@playwright/test';
import { ChunkedBatch, MeshBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { roadClearance, roadsW } from '../src/town/site';
import { addCherry, addRoundTree } from '../src/town/trees';
import { makeRng } from '../src/town/util';

// Geometry checks for the cherry trees (no browser, no rendering): the shapes the visual evaluation relies on.

function makeCtx(seed = 5): { c: Ctx; draws: () => number } {
  const rnd = makeRng(seed);
  let n = 0;
  const c = {
    main: new ChunkedBatch(100000),
    dec3: new MeshBatch(),
    rnd: () => {
      n++;
      return rnd();
    },
  } as unknown as Ctx;
  return { c, draws: () => n };
}

/** Pink (blossom) vertices of a batch: far brighter and redder than the dark bark. */
function blossomStats(b: MeshBatch, x: number, z: number): { width: number; lowest: number; top: number } {
  let rMax = 0;
  let lowest = Infinity;
  let top = 0;
  for (let i = 0; i < b.vertexCount; i++) {
    const r = b.col[i * 4]!;
    const g = b.col[i * 4 + 1]!;
    const bl = b.col[i * 4 + 2]!;
    if (r > 0.6 && g > 0.4 && bl > 0.5 && r - g > 0.06) {
      rMax = Math.max(rMax, Math.hypot(b.pos[i * 3]! - x, b.pos[i * 3 + 2]! - z));
      lowest = Math.min(lowest, b.pos[i * 3 + 1]!);
      top = Math.max(top, b.pos[i * 3 + 1]!);
    }
  }
  return { width: rMax * 2, lowest, top };
}

test('a cherry tree is a wide, high umbrella: blossoms stay above head height, the canopy is 110-150 units wide', () => {
  const widths: number[] = [];
  for (let k = 0; k < 24; k++) {
    const { c } = makeCtx(k + 1);
    const x = 2000 + k * 400;
    const z = -900 - (k % 5) * 90;
    addCherry(c, x, z, 1);
    const b = c.main.at(x, z);
    const s = blossomStats(b, x, z);
    expect(s.lowest, `tree ${k}: lowest blossom`).toBeGreaterThanOrEqual(30); // head height is ~20 units
    expect(s.top, `tree ${k}: top`).toBeGreaterThan(70);
    expect(s.top, `tree ${k}: top`).toBeLessThan(135);
    widths.push(s.width);
  }
  widths.sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  expect(median).toBeGreaterThanOrEqual(110);
  expect(median).toBeLessThanOrEqual(150);
});

test('garden trees (small scale) keep their blossoms above head height too, and stay cheap', () => {
  for (const scale of [0.7, 0.8, 0.9]) {
    const { c } = makeCtx(3);
    addCherry(c, 3000, -1000, scale);
    const b = c.main.at(3000, -1000);
    expect(blossomStats(b, 3000, -1000).lowest).toBeGreaterThanOrEqual(30);
    expect(b.vertexCount + c.dec3.vertexCount).toBeLessThan(700);
  }
});

test('a cherry tree stays within its vertex budget and its mesh data is consistent', () => {
  for (const scale of [0.7, 1, 1.2, 1.4]) {
    const { c } = makeCtx(9);
    addCherry(c, 2500, -1200, scale);
    for (const b of [c.main.at(2500, -1200), c.dec3]) {
      expect(b.pos.length).toBe(b.vertexCount * 3);
      expect(b.nor.length).toBe(b.vertexCount * 3);
      expect(b.col.length).toBe(b.vertexCount * 4);
      expect(b.idx.length % 3).toBe(0);
      expect(Math.max(...b.idx)).toBeLessThan(b.vertexCount);
      expect(b.pos.every(Number.isFinite)).toBe(true);
      expect(b.nor.every(Number.isFinite)).toBe(true);
    }
    const total = c.main.vertexCount + c.dec3.vertexCount;
    expect(total).toBeLessThan(scale >= 0.95 ? 2600 : 700);
  }
});

test('the trees draw from the shared random stream exactly as the old ones did (so the rest of the town is unchanged)', () => {
  const a = makeCtx();
  addCherry(a.c, 2000, -1000, 1);
  expect(a.draws()).toBe(10);
  const b = makeCtx();
  addRoundTree(b.c, 2000, -1000, 1);
  expect(b.draws()).toBe(1);
});

test('the petal carpet piles up against the kerb: it hardly reaches onto the road', () => {
  // a tree on the sidewalk side of the mountain street, placed as the avenue does (22 units beyond the road edge)
  const road = roadsW.find((r) => r.id === 'mountain-street')!;
  const p0 = road.pts[0]!;
  const p1 = road.pts[road.pts.length - 1]!;
  const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const dx = (p1.x - p0.x) / len;
  const dz = (p1.z - p0.z) / len;
  const x = p0.x + dx * 900 - dz * (road.width / 2 + 22);
  const z = p0.z + dz * 900 + dx * (road.width / 2 + 22);
  const { c } = makeCtx(2);
  addCherry(c, x, z, 1.1);
  const d = c.dec3;
  expect(d.vertexCount).toBeGreaterThan(60);
  let minClear = Infinity;
  let maxDist = 0;
  for (let i = 0; i < d.vertexCount; i++) {
    const px = d.pos[i * 3]!;
    const pz = d.pos[i * 3 + 2]!;
    minClear = Math.min(minClear, roadClearance(px, pz).d);
    maxDist = Math.max(maxDist, Math.hypot(px - x, pz - z));
    expect(d.pos[i * 3 + 1]!).toBeLessThan(2); // flat on the ground
  }
  expect(minClear).toBeGreaterThan(-12); // at most a drift's width past the road edge
  expect(maxDist).toBeLessThan(220);
});

test('falling petals: they exist around an eye-level viewer, are off high above the town, and raise no errors', async ({ page }) => {
  test.setTimeout(240_000); // the whole town is built and rendered in software
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?model=none&view=street');
  await page.waitForFunction(() => window.__gp08?.ready === true, null, { timeout: 120_000 });
  // wait (by frames, not by time: software rendering is slow) until the first petals exist
  await page.waitForFunction(
    () => (window.__gp08.scene!.particleSystems.find((p) => p.name === 'fallingPetals')?.getActiveCount() ?? 0) > 0,
    null,
    { timeout: 120_000 },
  );
  const frames = await page.evaluate(() => window.__gp08.frames);
  await page.waitForFunction((f) => window.__gp08.frames >= f + 5, frames, { timeout: 120_000 });
  const info = await page.evaluate(() => {
    const scene = window.__gp08.scene!;
    const ps = scene.particleSystems.find((p) => p.name === 'fallingPetals');
    return ps ? { active: ps.getActiveCount(), rate: ps.emitRate, hasTexture: !!ps.particleTexture } : null;
  });
  expect(info).not.toBeNull();
  expect(info!.hasTexture).toBe(true);
  expect(info!.rate).toBeGreaterThan(0); // the eye-level view is low enough
  expect(info!.active).toBeGreaterThan(100);
  expect(info!.active).toBeLessThanOrEqual(900);

  // lift the camera far above the town (like the aerial views): the petals are switched off and the old ones go
  await page.evaluate(() => {
    const cam = window.__gp08.scene!.activeCamera as unknown as { position: { clone(): { y: number } }; setPosition(p: unknown): void };
    const p = cam.position.clone();
    p.y += 4000;
    cam.setPosition(p);
  });
  const f2 = await page.evaluate(() => window.__gp08.frames);
  await page.waitForFunction((f) => window.__gp08.frames >= f + 4, f2, { timeout: 120_000 });
  const high = await page.evaluate(() => {
    const ps = window.__gp08.scene!.particleSystems.find((p) => p.name === 'fallingPetals')!;
    return { rate: ps.emitRate, active: ps.getActiveCount() };
  });
  expect(high.rate).toBe(0);
  expect(high.active).toBe(0);
  expect(errors).toEqual([]);
});
