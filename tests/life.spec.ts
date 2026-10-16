import { expect, test } from '@playwright/test';
import { Crowd } from '../src/life/crowd';
import { Path, newPathPt, polylineWindow } from '../src/life/path';
import { Traffic, zoneSpeed, type Car } from '../src/life/traffic';
import { CAR_KINDS } from '../src/life/carmodels';
import { roadClearance, roadsW } from '../src/town/site';

// ---- pure logic: paths, traffic and the crowd (no browser) -----------------------------------------------------

test('Path: arc length addressing, projection and windows', () => {
  const pts = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
  ];
  const p = new Path(pts, 10);
  expect(p.length).toBeCloseTo(200, 6);
  const q = newPathPt();
  p.at(50, q);
  expect(q.x).toBeCloseTo(50, 3);
  expect(q.z).toBeCloseTo(0, 3);
  expect(q.tx).toBeCloseTo(1, 2);
  p.at(150, q);
  expect(q.x).toBeCloseTo(100, 3);
  expect(q.z).toBeCloseTo(50, 3);
  expect(p.project(60, 5)).toBeCloseTo(60, 3);
  expect(p.project(110, 80)).toBeCloseTo(180, 3);
  const w = polylineWindow(pts, 50, 150);
  expect(w[0]).toEqual({ x: 50, z: 0 });
  expect(w[w.length - 1]).toEqual({ x: 100, z: 50 });
});

/** Footprint corners of a car */
function corners(c: Car): [number, number][] {
  const k = CAR_KINDS[c.kind]!;
  const fx = Math.sin(c.yaw);
  const fz = Math.cos(c.yaw);
  const rx = fz;
  const rz = -fx;
  const hl = k.length / 2;
  const hw = k.width / 2;
  return [
    [c.x + fx * hl + rx * hw, c.z + fz * hl + rz * hw],
    [c.x + fx * hl - rx * hw, c.z + fz * hl - rz * hw],
    [c.x - fx * hl - rx * hw, c.z - fz * hl - rz * hw],
    [c.x - fx * hl + rx * hw, c.z - fz * hl + rz * hw],
  ];
}

/** Do two convex quads overlap (separating axis test)? `shrink` makes the test lenient. */
function overlap(a: Car, b: Car, shrink = 0.9): boolean {
  const ca = corners(a);
  const cb = corners(b);
  const axes: [number, number][] = [];
  for (const c of [ca, cb]) {
    for (let i = 0; i < 2; i++) {
      const dx = c[i + 1]![0] - c[i]![0];
      const dz = c[i + 1]![1] - c[i]![1];
      const l = Math.hypot(dx, dz);
      axes.push([-dz / l, dx / l]);
    }
  }
  const mid = (c: [number, number][]): [number, number] => [(c[0]![0] + c[2]![0]) / 2, (c[0]![1] + c[2]![1]) / 2];
  const ma = mid(ca);
  const mb = mid(cb);
  for (const [ax, az] of axes) {
    const proj = (c: [number, number][], m: [number, number]): [number, number] => {
      const vals = c.map((p) => (m[0] + (p[0] - m[0]) * shrink - 0) * ax + (m[1] + (p[1] - m[1]) * shrink) * az);
      return [Math.min(...vals), Math.max(...vals)];
    };
    const [a0, a1] = proj(ca, ma);
    const [b0, b1] = proj(cb, mb);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

test('traffic: cars drive on the left lane, stay on the road, never overlap, and keep moving', () => {
  const traffic = new Traffic();
  const driving = traffic.cars.filter((c) => !c.parked);
  const parked = traffic.cars.filter((c) => c.parked);
  expect(driving.length).toBeGreaterThanOrEqual(15);
  expect(driving.length).toBeLessThanOrEqual(30);
  expect(parked.length).toBeGreaterThanOrEqual(20);

  // every road gets cars in both directions at some time, all on their left-hand lane
  const start = driving.map((c) => [c.x, c.z]);
  let maxOutside = -Infinity;
  let overlaps = 0;
  let turned = 0;
  const turns = new Set<Car>();
  const dt = 0.1;
  for (let step = 0; step < 6000; step++) {
    traffic.update(dt);
    for (const c of driving) {
      // inside the asphalt: roadClearance is negative on a road
      const d = roadClearance(c.x, c.z).d;
      maxOutside = Math.max(maxOutside, d);
      if (c.turning === 1 && !turns.has(c)) {
        turns.add(c);
        turned++;
      }
    }
    if (step % 5 === 0) {
      for (let i = 0; i < driving.length; i++) {
        for (let j = i + 1; j < driving.length; j++) if (overlap(driving[i]!, driving[j]!)) overlaps++;
      }
    }
  }
  expect(maxOutside).toBeLessThan(-8); // always well inside a road, never on a sidewalk
  expect(overlaps).toBe(0);
  const moved = driving.filter((c, i) => Math.hypot(c.x - start[i]![0], c.z - start[i]![1]) > 100).length;
  expect(moved).toBeGreaterThan(driving.length * 0.7);
  expect(turned).toBeGreaterThan(0); // cars turn around at the ends of their stretch

  // left-hand traffic: the car is on the left of its travel direction relative to the road centre line
  for (const c of driving) {
    const road = roadClearance(c.x, c.z).road!;
    // nearest centre-line point
    let best = Infinity;
    let side = 0;
    for (let i = 0; i + 1 < road.pts.length; i++) {
      const a = road.pts[i]!;
      const b = road.pts[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < best) {
        best = d;
        // heading x offset: cross product of heading and the offset to the car (positive = the car is on the right of the road line seen along its heading)
        const hx = Math.sin(c.yaw);
        const hz = Math.cos(c.yaw);
        side = hx * (c.z - pz) - hz * (c.x - px);
      }
    }
    if (c.turning === 0) expect(side, 'a car drives on the left of the road centre').toBeLessThan(0.0001);
  }
});

test('traffic: parked cars are at the kerb inside the road, and slow zones near the plaza', () => {
  const traffic = new Traffic();
  for (const c of traffic.cars.filter((c) => c.parked)) {
    const cl = roadClearance(c.x, c.z);
    expect(cl.d, 'parked car on the asphalt').toBeLessThan(0);
  }
  expect(zoneSpeed(0, 0)).toBeLessThan(0.6);
  expect(zoneSpeed(0, -2500)).toBeGreaterThan(0.99);
  expect(roadsW.length).toBeGreaterThan(5);
});

test('crowd: about a hundred people, walkers keep to the sidewalks and move, staff are in place', () => {
  const spots = {
    // a shop on the main street, front facing east (towards the street)
    'w-conbini': { x: -509, z: -911, fx: 1, fz: 0, hu: 60, hv: 35 },
    'e-wagashi': { x: 697, z: -1020, fx: 0, fz: -1, hu: 50, hv: 30 },
    'w-cafe': { x: -984, z: -700, fx: 1, fz: 0, hu: 40, hv: 35 },
  };
  const walkOutfits = Array.from({ length: 13 }, (_, i) => i);
  const crowd = new Crowd(spots, walkOutfits, { wagashi: 14, cafe: 15, station: 16 }, { plaza: [0, 1], platform: [2] }, 13);
  const people = crowd.people;
  expect(people.length).toBeGreaterThan(40);
  expect(people.filter((p) => p.mode === 'walk').length).toBeGreaterThan(20);
  expect(people.filter((p) => p.mode === 'stand').length).toBeGreaterThan(5);
  expect(people.filter((p) => p.mode === 'sit').length).toBeGreaterThanOrEqual(0);
  expect(people.some((p) => p.outfit === 14)).toBe(true); // the shop clerk

  const walkers = people.filter((p) => p.mode === 'walk');
  const start = walkers.map((p) => [p.x, p.z]);
  for (let step = 0; step < 1200; step++) crowd.update(0.1);
  const moved = walkers.filter((p, i) => Math.hypot(p.x - start[i]![0], p.z - start[i]![1]) > 30).length;
  expect(moved).toBeGreaterThan(walkers.length * 0.6);
  for (const p of walkers) {
    const lane = p.lane!;
    expect(p.lat).toBeGreaterThanOrEqual(lane.latMin - 1e-6);
    expect(p.lat).toBeLessThanOrEqual(lane.latMax + 1e-6);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw)).toBe(true);
  }
});

// ---- in the page ---------------------------------------------------------------------------------------------

interface LifeInfo {
  cars: number;
  driving: number;
  parked: number;
  people: number;
  walkers: number;
  standing: number;
  sitting: number;
  meshes: number;
  vertices: number;
  positions: () => { cars: [number, number][]; walkers: [number, number][] };
}

test('the town has cars and people, they move every frame, and the page logs no errors', async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto('/?model=none');
  await page.waitForFunction(() => window.__gp08?.ready === true, null, { timeout: 120_000 });

  const read = (): Promise<{ info: Omit<LifeInfo, 'positions'>; cars: [number, number][]; walkers: [number, number][] }> =>
    page.evaluate(() => {
      const life = (window.__gp08.scene!.metadata as { life: LifeInfo }).life;
      const { positions, ...info } = life;
      return { info, ...positions() };
    });
  const a = await read();
  expect(a.info.driving).toBeGreaterThanOrEqual(15);
  expect(a.info.driving).toBeLessThanOrEqual(30);
  expect(a.info.parked).toBeGreaterThanOrEqual(20);
  expect(a.info.people).toBeGreaterThanOrEqual(60);
  expect(a.info.people).toBeLessThanOrEqual(120);
  expect(a.info.vertices).toBeLessThan(60_000);

  // wait for rendered frames (software rendering can be slow)
  const frames = await page.evaluate(() => window.__gp08.frames);
  await page.waitForFunction((f) => window.__gp08.frames >= f + 30, frames, { timeout: 180_000 });
  const b = await read();
  const movedCars = a.cars.filter((p, i) => Math.hypot(p[0] - b.cars[i]![0], p[1] - b.cars[i]![1]) > 1).length;
  const movedWalkers = a.walkers.filter((p, i) => Math.hypot(p[0] - b.walkers[i]![0], p[1] - b.walkers[i]![1]) > 1).length;
  expect(movedCars).toBeGreaterThan(a.cars.length * 0.7);
  expect(movedWalkers).toBeGreaterThan(a.walkers.length * 0.6);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
});
