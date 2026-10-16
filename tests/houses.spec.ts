import { expect, test } from '@playwright/test';
import { ChunkedBatch, MeshBatch } from '../src/town/batch';
import type { Ctx } from '../src/town/ctx';
import { Frame } from '../src/town/frame';
import { addApartment, addHouse, addHouseLite } from '../src/town/houses';
import { makeRng, type Rect } from '../src/town/util';

// Pure-function checks (no browser): the detailed houses stay inside the ground they claim, produce sane geometry
// and keep to their vertex budget. The ground a building claims is its footprint grown by the margins of
// `reach()` in src/town/infill.ts plus the gap (GAP = 5) that infill keeps free around every plot.
const GAP = 5;
const REACH = {
  lite: { front: 12, back: 0, side: 5 },
  full: { front: 12, back: 9, side: 9 },
  apart: { front: 6, back: 6, side: 0 },
};

/** A town context holding only what the house builders touch. */
function makeCtx(draws: number[]): Ctx {
  const rnd = makeRng(1234);
  let i = 0;
  return {
    scene: undefined,
    main: new ChunkedBatch(1e9),
    forest: new ChunkedBatch(1e9),
    signs: new ChunkedBatch(1e9, true),
    dec0: new MeshBatch(),
    dec1: new MeshBatch(),
    dec2: new MeshBatch(),
    dec3: new MeshBatch(),
    atlas: { uv: () => ({ u0: 0, u1: 1, v0: 0, v1: 1 }) },
    obstacles: [],
    spots: {},
    report: [],
    // the first draws are fixed (to keep trees out of the picture), the rest come from a normal generator
    rnd: () => (i < draws.length ? draws[i++]! : rnd()),
  } as unknown as Ctx;
}

const FRAMES: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

interface Extent {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  maxY: number;
  vertices: number;
  bad: number;
}

/** Extent of everything a builder has drawn, in the local frame of the building. */
function extent(c: Ctx, f: Frame): Extent {
  const e: Extent = { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity, maxY: 0, vertices: 0, bad: 0 };
  const batches: MeshBatch[] = [...c.main.all().map(([, b]) => b), ...c.signs.all().map(([, b]) => b), c.dec1, c.dec2];
  for (const b of batches) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i]!;
      const y = b.pos[i + 1]!;
      const z = b.pos[i + 2]!;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) e.bad++;
      const u = (x - f.cx) * f.rx + (z - f.cz) * f.rz;
      const v = (x - f.cx) * f.fx + (z - f.cz) * f.fz;
      e.minU = Math.min(e.minU, u);
      e.maxU = Math.max(e.maxU, u);
      e.minV = Math.min(e.minV, v);
      e.maxV = Math.max(e.maxV, v);
      e.maxY = Math.max(e.maxY, y);
    }
    for (const k of b.idx) if (k >= b.vertexCount) e.bad++;
    for (const n of b.nor) if (!Number.isFinite(n)) e.bad++;
    e.vertices += b.vertexCount;
  }
  return e;
}

const rect = (f: Frame, hu: number, hv: number): Rect => {
  const hx = f.fx === 0 ? hu : hv;
  const hz = f.fx === 0 ? hv : hu;
  return { minX: f.cx - hx, maxX: f.cx + hx, minZ: f.cz - hz, maxZ: f.cz + hz };
};

test('infill houses stay inside the ground they claim, with sane geometry and a bounded vertex count', () => {
  const rnd = makeRng(99);
  let total = 0;
  let n = 0;
  for (let k = 0; k < 120; k++) {
    const [fx, fz] = FRAMES[k % 4]!;
    const f = new Frame(1000 + k * 7, -500 + k * 3, fx, fz);
    const hu = 26 + rnd() * 38;
    const hv = 24 + rnd() * 26;
    const floors = rnd() < 0.7 ? 2 : 1;
    // wall, roof, ridge, door side, door colour, tree (none), tree side
    const c = makeCtx([rnd(), rnd(), rnd(), rnd(), rnd(), 0.9, rnd()]);
    addHouseLite(c, rect(f, hu, hv), f, hu, hv, floors);
    const e = extent(c, f);
    expect(e.bad, `house ${k}: finite positions and normals, valid indices`).toBe(0);
    expect(e.minU, `house ${k} left`).toBeGreaterThanOrEqual(-hu - REACH.lite.side - GAP);
    expect(e.maxU, `house ${k} right`).toBeLessThanOrEqual(hu + REACH.lite.side + GAP);
    expect(e.minV, `house ${k} back`).toBeGreaterThanOrEqual(-hv - REACH.lite.back - GAP);
    expect(e.maxV, `house ${k} front`).toBeLessThanOrEqual(hv + REACH.lite.front + GAP);
    expect(e.maxY, `house ${k} height`).toBeLessThan(160);
    expect(c.obstacles.length).toBe(1);
    total += e.vertices;
    n++;
  }
  // vertices are the cost of the town (about 1,100 of these): keep the average house within its budget
  expect(total / n).toBeLessThan(420);
  expect(total / n).toBeGreaterThan(150);
});

test('named-lot and main-street houses stay inside their ground', () => {
  const rnd = makeRng(5);
  let total = 0;
  for (let k = 0; k < 60; k++) {
    const [fx, fz] = FRAMES[k % 4]!;
    const f = new Frame(-2000 + k * 11, 800 - k * 5, fx, fz);
    const hu = 34 + rnd() * 40;
    const hv = 36 + rnd() * 26;
    const floors = rnd() < 0.8 ? 2 : 3;
    // wall, roof, ridge, chimney, door side, door colour, balcony; then the garden's tree draw is kept clear of trees
    const c = makeCtx([rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), 0.9, 0.9]);
    addHouse(c, rect(f, hu, hv), f, hu, hv, floors);
    const e = extent(c, f);
    expect(e.bad, `house ${k}`).toBe(0);
    expect(e.minU).toBeGreaterThanOrEqual(-hu - REACH.full.side - GAP);
    expect(e.maxU).toBeLessThanOrEqual(hu + REACH.full.side + GAP);
    expect(e.minV).toBeGreaterThanOrEqual(-hv - REACH.full.back - GAP);
    expect(e.maxV).toBeLessThanOrEqual(hv + REACH.full.front + GAP);
    total += e.vertices;
  }
  expect(total / 60).toBeLessThan(1300);
});

test('apartment blocks keep their balconies, corridors and stairs inside the footprint', () => {
  const rnd = makeRng(17);
  for (let k = 0; k < 40; k++) {
    const [fx, fz] = FRAMES[k % 4]!;
    const f = new Frame(500 + k * 13, 2000 - k * 9, fx, fz);
    const hu = 50 + rnd() * 90;
    const hv = 50 + rnd() * 40;
    const floors = 3 + Math.floor(rnd() * 3);
    const c = makeCtx([rnd(), rnd()]);
    addApartment(c, rect(f, hu, hv), f, hu, hv, floors, 'アパート');
    const e = extent(c, f);
    expect(e.bad, `block ${k}`).toBe(0);
    expect(e.minU).toBeGreaterThanOrEqual(-hu - GAP);
    expect(e.maxU).toBeLessThanOrEqual(hu + GAP);
    expect(e.minV).toBeGreaterThanOrEqual(-hv - REACH.apart.back - GAP);
    expect(e.maxV).toBeLessThanOrEqual(hv + REACH.apart.front + GAP);
  }
});

test('the shared random stream is consumed exactly as before, so the town layout does not move', () => {
  // Every builder keeps the number and order of its draws from the shared generator (c.rnd); everything new in a house
  // comes from its own generator. If these counts change, every building placed afterwards moves.
  const count = (draws: number[], run: (c: Ctx) => void): number => {
    let calls = 0;
    const c = makeCtx(draws);
    const inner = c.rnd;
    c.rnd = () => {
      calls++;
      return inner();
    };
    run(c);
    return calls;
  };
  const f = new Frame(0, 0, 0, 1);
  // infill house: wall, roof, ridge, door side, door colour, tree (0.9 = none), tree side
  expect(count([0.3, 0.3, 0.3, 0.3, 0.3, 0.9, 0.3], (c) => addHouseLite(c, rect(f, 40, 36), f, 40, 36, 2))).toBe(7);
  // detailed house: wall, roof, ridge, chimney, door side, door colour, [balcony], tree (none), tree side
  expect(count([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.9, 0.3], (c) => addHouse(c, rect(f, 50, 45), f, 50, 45, 2))).toBe(9);
  expect(count([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.9, 0.3], (c) => addHouse(c, rect(f, 50, 45), f, 50, 45, 1))).toBe(8);
  // apartment block: wall, band, then three rooftop items of three draws each
  expect(count([], (c) => addApartment(c, rect(f, 90, 60), f, 90, 60, 4, 'マンション'))).toBe(11);
});
