import { expect, test } from '@playwright/test';
import { RoadPath, findArms, freeRuns, ivMerge, ivMinus, inPlaza } from '../src/town/roadpath';
import { roadClearance, roadsW } from '../src/town/site';
import { distPointPolyline } from '../src/town/util';

// Pure-function checks (no browser) of the road geometry behind the street surface (kerbs, crossings, stop lines).
// They are written against properties, not against numbers, so that they keep holding when the map is edited.
// Worst cases are collected in loops and asserted once (thousands of expect() calls would make these slow).
const paths = roadsW.map((r) => new RoadPath(r));

test('lateral offsets are exact: a point at offset o is |o| from the centre line, also across the polyline joints', () => {
  let checked = 0;
  let straightErr = 0; // worst deviation away from joints
  let jointErr = 0; // at the joints the mitre point of a slightly bent road is a hair farther out (1 / cos(half the turn))
  let tooClose = 0; // a point can never be nearer than |o|
  for (const p of paths) {
    const joints = p.segs.slice(1).map((g) => g.s0);
    for (let s = 0; s <= p.total; s += 40) {
      const nearJoint = joints.some((j) => Math.abs(j - s) < 1);
      for (const o of [-p.hw - 13, -p.hw, p.hw, p.hw + 2, p.hw + 13]) {
        const [x, z] = p.at(s, o);
        const dev = distPointPolyline(x, z, p.road.pts) - Math.abs(o);
        tooClose = Math.min(tooClose, dev);
        if (nearJoint) jointErr = Math.max(jointErr, dev / Math.abs(o));
        else straightErr = Math.max(straightErr, Math.abs(dev));
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(500);
  expect(tooClose).toBeGreaterThan(-0.01);
  expect(straightErr).toBeLessThan(0.01);
  expect(jointErr).toBeLessThan(0.01);
});

test('at a polyline joint the offset point is mitred: exactly |o| from both adjoining straight pieces', () => {
  let joints = 0;
  let worst = 0;
  for (const p of paths) {
    p.segs.forEach((g, i) => {
      if (i === 0) return;
      const prev = p.segs[i - 1]!;
      for (const o of [-p.hw - 13, -p.hw, p.hw, p.hw + 13]) {
        const [x, z] = p.at(g.s0, o);
        for (const q of [prev, g]) worst = Math.max(worst, Math.abs(Math.abs((x - q.ax) * q.nx + (z - q.az) * q.nz) - Math.abs(o)));
      }
      joints++;
    });
  }
  expect(joints).toBeGreaterThan(0);
  expect(worst).toBeLessThan(0.005);
});

test('arc length is continuous: points at consecutive s are as far apart as the step along the centre line', () => {
  let worst = 0;
  for (const p of paths) {
    let [px, pz] = p.at(0, 0);
    for (let s = 5; s <= p.total; s += 5) {
      const [x, z] = p.at(s, 0);
      worst = Math.max(worst, Math.abs(Math.hypot(x - px, z - pz) - 5));
      px = x;
      pz = z;
    }
  }
  expect(worst).toBeLessThan(0.02); // (a chord across a slight bend is a hair shorter)
});

test('interval maths: merge and subtract', () => {
  expect(ivMerge([[5, 8], [0, 3], [2, 4], [10, 12]])).toEqual([[0, 4], [5, 8], [10, 12]]);
  expect(ivMinus([[0, 100]], [[10, 20], [15, 30], [90, 120]], 1)).toEqual([[0, 10], [30, 90]]);
  expect(ivMinus([[0, 10]], [[-5, 3]], 1)).toEqual([[3, 10]]);
  expect(ivMinus([[0, 10]], [[0, 9.5]], 1)).toEqual([]); // what is left is shorter than the minimum
});

test('kerb lines keep clear of every other road, with the boundary found to a fraction of a unit', () => {
  const margin = 1.5;
  let runs = 0;
  let minClear = Infinity;
  let loose = 0; // run ends that are not really at a blockage
  for (const p of paths) {
    for (const side of [1, -1]) {
      const o = side * (p.hw + 1);
      const free = freeRuns(p, o, (x, z) => roadClearance(x, z, p.road.id).d < margin || inPlaza(x, z, 1.02), 4);
      for (const [a, b] of free) {
        runs++;
        for (let s = a; s <= b; s += 20) {
          const [x, z] = p.at(s, o);
          minClear = Math.min(minClear, roadClearance(x, z, p.road.id).d);
        }
        const [ex, ez] = p.at(b, o);
        minClear = Math.min(minClear, roadClearance(ex, ez, p.road.id).d);
        // the runs are as long as they can be: just outside a run the line is blocked (or the road ends)
        for (const s of [a - 0.2, b + 0.2]) {
          if (s <= 0 || s >= p.total) continue;
          const [x, z] = p.at(s, o);
          if (!(roadClearance(x, z, p.road.id).d < margin + 0.05 || inPlaza(x, z, 1.02))) loose++;
        }
      }
    }
  }
  expect(runs).toBeGreaterThan(10);
  expect(minClear).toBeGreaterThan(margin - 0.05);
  expect(loose).toBe(0);
});

test('every place where a road runs through another road has junction arms next to it', () => {
  const arms = findArms(paths);
  expect(arms.length).toBeGreaterThan(0);
  const missing: string[] = [];
  for (const p of paths) {
    const mine = arms.filter((a) => a.path === p);
    for (let s = 7; s < p.total - 6; s += 5) {
      const [x, z] = p.at(s, 0);
      const other = roadClearance(x, z, p.road.id);
      if (other.d >= 0 || !other.road) continue; // the centre line is inside another road's asphalt here
      // an arm must meet this junction (within the width of the road it runs into)
      if (!mine.some((a) => Math.abs(a.sj - s) <= other.road!.width + 5)) missing.push(`${p.road.id} at s=${s} inside ${other.road.id}`);
    }
  }
  expect(missing).toEqual([]);
});

test('junction arms are well formed: they lie on the road, start at the other road and stop lines go to the narrower road', () => {
  const arms = findArms(paths);
  const bad: string[] = [];
  for (const a of arms) {
    const p = a.path;
    // traffic travels along +s when the arm is before the junction: the arm spans sj - len .. sj, else sj .. sj + len
    const far = a.toward === 1 ? a.sj - a.len : a.sj + a.len;
    if (a.sj < 0 || a.sj > p.total || a.len <= 1 || far < -1e-6 || far > p.total + 1e-6) bad.push(`${p.road.id}: arm out of range`);
    if (a.stop) {
      // at the arm's end the centre line meets another road, which is at least as wide
      const [x, z] = p.at(a.sj, 0);
      const other = roadClearance(x, z, p.road.id);
      if (!other.road || other.road.width < p.road.width - 0.5 || other.d > 1) bad.push(`${p.road.id}: stop arm does not meet a road that is at least as wide`);
    }
  }
  expect(bad).toEqual([]);
});
