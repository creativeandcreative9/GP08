import { expect, test } from '@playwright/test';
import { buildWheel, CAR_KINDS, WHEEL_R, WHEEL_W } from '../src/life/carmodels';
import { numberPlate } from '../src/life/cardetail';
import { MeshBatch } from '../src/town/batch';

function assertGeometry(batch: MeshBatch): void {
  expect(batch.vertexCount).toBeGreaterThan(0);
  expect(batch.pos.every(Number.isFinite)).toBe(true);
  expect(batch.nor.every(Number.isFinite)).toBe(true);
  expect(batch.col.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  expect(batch.nor.length).toBe(batch.pos.length);
  expect(batch.col.length).toBe(batch.vertexCount * 4);
  expect(batch.surf.length).toBe(batch.vertexCount);
  expect(batch.idx.every(i => Number.isInteger(i) && i >= 0 && i < batch.vertexCount)).toBe(true);
  let maxNormalError = 0;
  for (let i = 0; i < batch.nor.length; i += 3) {
    maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(batch.nor[i]!, batch.nor[i + 1]!, batch.nor[i + 2]!) - 1));
  }
  expect(maxNormalError).toBeLessThan(1e-6);
  // All emitted triangles must have area and agree with Babylon's left-handed winding.
  let badTriangles = 0;
  for (let i = 0; i < batch.idx.length; i += 3) {
    const a = batch.idx[i]! * 3, b = batch.idx[i + 1]! * 3, c = batch.idx[i + 2]! * 3;
    const ab = [0, 1, 2].map(j => batch.pos[b + j]! - batch.pos[a + j]!);
    const ac = [0, 1, 2].map(j => batch.pos[c + j]! - batch.pos[a + j]!);
    const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    if (Math.hypot(...normal) < 1e-9 || normal.reduce((sum, n, j) => sum + n * batch.nor[a + j]!, 0) >= 0) badTriangles++;
  }
  expect(badTriangles).toBe(0);
}

test('all car colourways keep valid opaque batch geometry within the existing traffic envelope and a bounded triangle budget', () => {
  for (const kind of CAR_KINDS) for (const palette of kind.palettes) {
    const batch = new MeshBatch(); kind.build(batch, palette);
    assertGeometry(batch);
    expect(batch.triangleCount, kind.id).toBeLessThan(1600);
    let outsideEnvelope = 0;
    for (let i = 0; i < batch.pos.length; i += 3) {
      // Existing bodies allow mirror housings beyond the lane width and bumpers beyond the nominal length.
      if (Math.abs(batch.pos[i]!) > kind.width / 2 + 1.8 || Math.abs(batch.pos[i + 2]!) > kind.length / 2 + 1.35
        || batch.pos[i + 1]! < 2 || batch.pos[i + 1]! > 25) outsideEnvelope++;
    }
    expect(outsideEnvelope, kind.id).toBe(0);
    expect(kind.wheelR).toBe(WHEEL_R); expect(kind.wheelW).toBe(WHEEL_W);
    expect(kind.axle.rear).toBeLessThan(0); expect(kind.axle.front).toBeGreaterThan(0);
    expect(Math.max(Math.abs(kind.axle.front), Math.abs(kind.axle.rear)) + kind.wheelR).toBeLessThan(kind.length / 2);
  }
});

test('car generation is deterministic without changing the six shared traffic kinds or their palette counts', () => {
  expect(CAR_KINDS.map(kind => [kind.id, kind.palettes.length])).toEqual([
    ['compact', 3], ['kei', 3], ['retro', 2], ['van', 2], ['taxi', 2], ['truck', 2],
  ]);
  for (const kind of CAR_KINDS) {
    const first = new MeshBatch(), second = new MeshBatch();
    kind.build(first, kind.palettes[0]!); kind.build(second, kind.palettes[0]!);
    expect(second.pos).toEqual(first.pos);
    expect(second.nor).toEqual(first.nor);
    expect(second.col).toEqual(first.col);
    expect(second.idx).toEqual(first.idx);
  }
});

test('rounded shared tyres preserve ground contact, axle radius and width for wheel rotation', () => {
  for (const [radius, width] of [[WHEEL_R, WHEEL_W], [2.9, 1.5]] as const) {
    const wheel = new MeshBatch(); buildWheel(wheel, radius, width);
    assertGeometry(wheel);
    expect(wheel.triangleCount).toBeLessThanOrEqual(360);
    let minY = Infinity, maxY = -Infinity, maxRadius = 0, maxX = 0;
    for (let i = 0; i < wheel.pos.length; i += 3) {
      minY = Math.min(minY, wheel.pos[i + 1]!); maxY = Math.max(maxY, wheel.pos[i + 1]!);
      maxRadius = Math.max(maxRadius, Math.hypot(wheel.pos[i + 1]!, wheel.pos[i + 2]!));
      maxX = Math.max(maxX, Math.abs(wheel.pos[i]!));
    }
    expect(minY + radius).toBeCloseTo(0, 8);
    expect(maxY).toBeCloseTo(radius, 8);
    expect(maxRadius).toBeCloseTo(radius, 8);
    expect(maxX).toBeLessThanOrEqual(width / 2 + .081);
  }
});

test('both outward-facing number plates read 20–08 with a 2 rather than a mirrored 5', () => {
  const projections: string[][] = [];
  for (const side of [-1, 1]) {
    const batch = new MeshBatch(); numberPlate(batch, side * 25, 5.6, 2, false, false);
    const isInk = (vertex: number): boolean => batch.col[vertex * 4] === .13 && batch.col[vertex * 4 + 1] === .25;
    const point = (vertex: number): [number, number] => [-side * batch.pos[vertex * 3]!, batch.pos[vertex * 3 + 1]! - 5.6];
    const projection = [];
    for (let i = 0; i < batch.vertexCount; i++) if (isInk(i)) projection.push(point(i).map(v => v.toFixed(6)).join(','));
    projections.push(projection.sort());
    const covers = (x: number, y: number): boolean => {
      for (let i = 0; i < batch.idx.length; i += 3) {
        if (!isInk(batch.idx[i]!)) continue;
        const tri = [point(batch.idx[i]!), point(batch.idx[i + 1]!), point(batch.idx[i + 2]!)];
        const cross = tri.map((p, j) => {
          const q = tri[(j + 1) % 3]!;
          return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
        });
        if (cross.every(v => v >= -1e-8) || cross.every(v => v <= 1e-8)) return true;
      }
      return false;
    };
    // A legible first digit 2 has an upper-right/lower-left stroke, unlike a 5.
    expect(covers(-1.05, .12)).toBe(true);
    expect(covers(-1.45, -.38)).toBe(true);
    expect(covers(-1.45, .12)).toBe(false);
    expect(covers(-1.05, -.38)).toBe(false);
  }
  expect(projections[0]).toEqual(projections[1]);
});
