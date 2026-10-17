import { expect, test } from '@playwright/test';
import { createWalkingSegmentCheck, walkingRoute } from '../src/gameplay/routes';

/** Like Babylon Vector3, these coordinates are getters rather than enumerable fields. */
class AccessorPoint {
  constructor(private readonly px: number, private readonly pz: number) {}
  get x(): number { return this.px; }
  get z(): number { return this.pz; }
}

test('direct routes copy getter-based player and destination coordinates into ordinary waypoints', () => {
  const route = walkingRoute(new AccessorPoint(-20, 20), new AccessorPoint(70, 20), [], () => 0);
  expect(route).toEqual([{ x: -20, z: 20 }, { x: 70, z: 20 }]);
  expect(Object.keys(route[0]!).sort()).toEqual(['x', 'z']);
});

test('getter-based positions retain their actual start while routing around a building', () => {
  const obstacles = [{ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }];
  const land = (x: number, z: number) => x >= -80 && x <= 180 && z >= -80 && z <= 180;
  const route = walkingRoute(new AccessorPoint(-20, 40), new AccessorPoint(140, 40), obstacles, () => 0, land);
  expect(route[0]).toEqual({ x: -20, z: 40 });
  expect(route.at(-1)).toEqual({ x: 140, z: 40 });
  expect(route.length).toBeGreaterThan(2);
  expect(route.some(p => p.z <= -4 || p.z >= 104)).toBe(true);
  expect(route.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
  const clear = createWalkingSegmentCheck(obstacles, () => 0, land);
  for (let i = 1; i < route.length; i++) expect(clear(route[i - 1]!, route[i]!)).toBe(true);
});

test('being eight units from a valid corner does not permit an arrow shortcut through the wall', () => {
  const clear = createWalkingSegmentCheck([{ minX: 0, maxX: 100, minZ: 0, maxZ: 107 }], () => 0);
  const player = { x: -14, z: 104 }, corner = { x: -14, z: 112 }, next = { x: 112, z: 112 };
  expect(Math.hypot(player.x - corner.x, player.z - corner.z)).toBe(8);
  expect(clear(player, corner)).toBe(true);
  expect(clear(corner, next)).toBe(true);
  // An early turn intersects the solid wall at x=0, z≈104.89.
  expect(clear(player, next)).toBe(false);
});

test('guide segments enforce player width, shore boundaries and the same climbable slopes as routes', () => {
  const obstacle = [{ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }];
  const clear = createWalkingSegmentCheck(obstacle, () => 0);
  expect(clear({ x: -20, z: 103 }, { x: 120, z: 103 })).toBe(false);
  expect(clear({ x: -20, z: 105 }, { x: 120, z: 105 })).toBe(true);
  const shore = createWalkingSegmentCheck([], () => 0, (_x, z) => z <= 0);
  expect(shore({ x: -20, z: -10 }, { x: 20, z: 10 })).toBe(false);
  const gentleSlope = createWalkingSegmentCheck([], x => x * .25);
  expect(gentleSlope({ x: 0, z: 0 }, { x: 40, z: 0 })).toBe(true);
  const cliff = createWalkingSegmentCheck([], x => x < 10 ? 0 : 12);
  expect(cliff({ x: 0, z: 0 }, { x: 40, z: 0 })).toBe(false);
});

test('invalid waypoints or unknown ground never produce a walkable guide segment', () => {
  const clear = createWalkingSegmentCheck([], () => 0);
  for (const point of [{ x: NaN, z: 0 }, { x: 0, z: Infinity }]) {
    expect(clear({ x: 0, z: 0 }, point)).toBe(false);
    expect(walkingRoute(point, { x: 40, z: 0 }, [], () => 0)).toEqual([]);
  }
  expect(createWalkingSegmentCheck([], () => NaN)({ x: 0, z: 0 }, { x: 40, z: 0 })).toBe(false);
});
