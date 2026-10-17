import { expect, test } from '@playwright/test';
import { Crowd } from '../src/life/crowd';
import { walkingRoute } from '../src/gameplay/routes';
import { blocked } from '../src/gameplay/world';

test('a resident reaches a daily destination, rests at midday and returns along the same sidewalk', () => {
  const crowd = new Crowd({}, { walkers: [0, 1], jogger: 2, wagashi: 3, cafe: 4, station: 5, sitters: { low: [0], high: [1] } });
  const p = crowd.people.find(p => p.mode === 'walk' && !p.buddy && p.s1 < p.lane!.path.length * 100)!;
  const run = (hour: number, fraction: number): void => {
    crowd.setTime(hour * 60);
    for (let i = 0; i < 6000; i++) crowd.update(.1);
    expect(p.s).toBeCloseTo(p.s0 + (p.s1 - p.s0) * fraction, -1);
    expect(p.swing).toBe(0); expect(p.speed).toBe(0);
  };
  run(8, .9); run(12, .5); run(19, .08);
});

test('walking routes go around buildings without crossing walls or cutting diagonal corners', () => {
  const walls = [{ minX: 35, maxX: 65, minZ: -30, maxZ: 30 }];
  const start = { x: 0, z: 0 }, end = { x: 100, z: 0 };
  const route = walkingRoute(start, end, walls, () => 0);
  expect(route[0]).toEqual(start); expect(route.at(-1)).toEqual(end); expect(route.length).toBeGreaterThan(2);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    for (let j = 0; j <= 100; j++) expect(blocked(a.x + (b.x - a.x) * j / 100, a.z + (b.z - a.z) * j / 100, walls)).toBe(false);
  }
});

test('routes reject inaccessible endpoints, sea and abrupt height changes rather than drawing an unsafe shortcut', () => {
  const a = { x: 0, z: 0 }, b = { x: 70, z: 0 };
  expect(walkingRoute(a, b, [{ minX: 60, maxX: 80, minZ: -10, maxZ: 10 }], () => 0)).toEqual([]);
  const land = (x: number, z: number): boolean => x >= -20 && x <= 90 && Math.abs(z) < 20 && !(x > 28 && x < 42);
  expect(walkingRoute(a, b, [], () => 0, land)).toEqual([]);
  expect(walkingRoute(a, b, [], x => x > 35 ? 30 : 0, (x, z) => x >= -20 && x <= 90 && Math.abs(z) < 20)).toEqual([]);
});
