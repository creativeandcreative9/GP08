import { expect, test } from '@playwright/test';
import { heightAt } from '../src/town/heights';
import { PLATFORM, platformObstacles } from '../src/town/platform';
import { GATES, OFFICE, stationObstacles } from '../src/town/stationplan';
import { SPAWN } from '../src/town/layout';

// Pure-function checks (no browser): the station platforms are walkable, continuous and solid.
const RADIUS = 4; // same body radius as src/player/player.ts
const obstacles = platformObstacles();
const blocked = (x: number, z: number): boolean =>
  obstacles.some((o) => x > o.minX - RADIUS && x < o.maxX + RADIUS && z > o.minZ - RADIUS && z < o.maxZ + RADIUS);

/** Walks like the player does (slide along obstacles) and returns the largest height step actually taken. */
function walk(sx: number, sz: number, tx: number, tz: number, step = 1): { maxJump: number; x: number; z: number; h: number } {
  let x = sx;
  let z = sz;
  let h = heightAt(x, z);
  let maxJump = 0;
  const n = Math.ceil(Math.hypot(tx - sx, tz - sz) / step);
  for (let i = 0; i < n; i++) {
    const nx = x + ((tx - sx) / n);
    const nz = z + ((tz - sz) / n);
    if (!blocked(nx, nz)) {
      x = nx;
      z = nz;
    } else if (!blocked(nx, z)) x = nx;
    else if (!blocked(x, nz)) z = nz;
    const nh = heightAt(x, z);
    maxJump = Math.max(maxJump, Math.abs(nh - h));
    h = nh;
  }
  return { maxJump, x, z, h };
}

test('heightAt is continuous along the route plaza -> station -> platform (2-unit samples)', () => {
  const route: [number, number][] = [
    [SPAWN.x, SPAWN.z], [290, 460], [290, 566], [290, 628], [290, 700], [500, 700],
  ];
  let prev = heightAt(route[0]![0], route[0]![1]);
  let maxJump = 0;
  let samples = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, az] = route[i]!;
    const [bx, bz] = route[i + 1]!;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let k = 1; k <= n; k++) {
      const h = heightAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      maxJump = Math.max(maxJump, Math.abs(h - prev));
      prev = h;
      samples++;
    }
  }
  expect(samples).toBeGreaterThan(100);
  expect(maxJump).toBeLessThanOrEqual(1.5);
  expect(prev).toBe(PLATFORM.h);
});

test('platform tops return the platform height, track bed and ground return 0', () => {
  expect(heightAt(400, 700)).toBe(PLATFORM.h);
  expect(heightAt(400, 900)).toBe(PLATFORM.h);
  expect(heightAt(400, 804)).toBe(0); // track bed
  expect(heightAt(0, 429)).toBe(0); // plaza
  expect(heightAt(-600, 700)).toBeGreaterThan(0); // on the west ramp
  expect(heightAt(-600, 700)).toBeLessThan(PLATFORM.h);
});

test('the player can walk from the plaza ramp onto the near platform', () => {
  const up = walk(290, 540, 290, 700);
  expect(up.maxJump).toBeLessThanOrEqual(1.5);
  expect(up.h).toBe(PLATFORM.h);
});

test('the player can reach the far platform through the west end ramp', () => {
  const a = walk(-720, 900, -400, 900);
  expect(a.maxJump).toBeLessThanOrEqual(1.5);
  expect(a.h).toBe(PLATFORM.h);
});

test('platform edges are solid: no height step > 1.5 when walking at them from any side', () => {
  const targets: [number, number, number, number][] = [
    [200, 800, 200, 700], // from the track bed towards the south platform
    [200, 804, 200, 900], // from the track bed towards the north platform
    [200, 600, 200, 700], // from the plaza side onto the south platform, away from the ramp
    [200, 1100, 200, 900], // from the north side onto the north platform
    [900, 700, 500, 700], // from the east end
    [900, 900, 500, 900],
    [400, 700, 400, 500], // off the platform towards the plaza
    [400, 900, 400, 1100], // off the north platform
    [400, 750, 400, 800], // off the south platform onto the track
    [400, 900, 400, 804], // off the north platform onto the track
  ];
  for (const [sx, sz, tx, tz] of targets) {
    const r = walk(sx, sz, tx, tz);
    expect(r.maxJump, `walk ${sx},${sz} -> ${tx},${tz}`).toBeLessThanOrEqual(1.5);
  }
});

test('random walks around the station never step more than 1.5 units', () => {
  let seed = 12345;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let maxJump = 0;
  for (let k = 0; k < 400; k++) {
    const sx = -800 + rnd() * 1700;
    const sz = 450 + rnd() * 650;
    if (blocked(sx, sz)) continue;
    const a = rnd() * Math.PI * 2;
    const r = walk(sx, sz, sx + Math.cos(a) * 300, sz + Math.sin(a) * 300);
    maxJump = Math.max(maxJump, r.maxJump);
  }
  expect(maxJump).toBeLessThanOrEqual(1.5);
});

// --- the station concourse ---------------------------------------------------------------------------------------
// The building stands on the platform: its floor is at platform height, the plaza side is reached by a short ramp in
// front of the doors, the gate line separates the concourse from the platform side, and every wall is solid.
const hall = [...platformObstacles(), ...stationObstacles()];
const hallBlocked = (x: number, z: number): boolean =>
  hall.some((o) => x > o.minX - RADIUS && x < o.maxX + RADIUS && z > o.minZ - RADIUS && z < o.maxZ + RADIUS);

function walkHall(sx: number, sz: number, tx: number, tz: number, step = 1): { maxJump: number; x: number; z: number; h: number } {
  let x = sx;
  let z = sz;
  let h = heightAt(x, z);
  let maxJump = 0;
  const n = Math.ceil(Math.hypot(tx - sx, tz - sz) / step);
  for (let i = 0; i < n; i++) {
    const nx = x + (tx - sx) / n;
    const nz = z + (tz - sz) / n;
    if (!hallBlocked(nx, nz)) {
      x = nx;
      z = nz;
    } else if (!hallBlocked(nx, z)) x = nx;
    else if (!hallBlocked(x, nz)) z = nz;
    const nh = heightAt(x, z);
    maxJump = Math.max(maxJump, Math.abs(nh - h));
    h = nh;
  }
  return { maxJump, x, z, h };
}

test('the concourse floor is at platform height and the entrance ramp rises smoothly to it', () => {
  for (const [x, z] of [[0, 640], [-100, 700], [100, 625], [180, 650], [0, 619]] as [number, number][]) {
    expect(heightAt(x, z), `floor at ${x},${z}`).toBe(PLATFORM.h);
  }
  expect(heightAt(0, PLATFORM.entrance.z0 - 1)).toBe(0);
  let prev = 0;
  let maxJump = 0;
  for (let z = PLATFORM.entrance.z0 - 10; z <= PLATFORM.hall.z0 + 10; z += 0.5) {
    const h = heightAt(10, z);
    maxJump = Math.max(maxJump, Math.abs(h - prev));
    prev = h;
  }
  expect(maxJump).toBeLessThanOrEqual(0.5);
  expect(prev).toBe(PLATFORM.h);
});

test('the player can walk from the plaza through the entrance doors to the gate line', () => {
  const r = walkHall(0, 540, 0, 660);
  expect(r.maxJump).toBeLessThanOrEqual(1.5);
  expect(r.h).toBe(PLATFORM.h);
  expect(r.z).toBeGreaterThan(655);
});

test('every gate lane and the wide lane can be walked through to the platform side', () => {
  for (const x of [...GATES.laneX, (GATES.wide.x0 + GATES.wide.x1) / 2]) {
    const r = walkHall(x, 650, x, 700);
    expect(r.maxJump, `lane ${x}`).toBeLessThanOrEqual(1.5);
    expect(r.z, `lane ${x}`).toBeGreaterThan(695);
  }
});

test('from the gates the player reaches the platform through the doorways in the back wall', () => {
  for (const x of [-60, 0]) {
    // Use the central lane, then turn behind the office towards either platform doorway.
    const gate = walkHall(0, 650, 0, 699);
    const across = walkHall(gate.x, gate.z, x, 699);
    const r = walkHall(across.x, across.z, x, 760);
    expect(Math.max(gate.maxJump, across.maxJump, r.maxJump), `x ${x}`).toBeLessThanOrEqual(1.5);
    expect(r.z, `x ${x}`).toBeGreaterThan(740);
    expect(r.h).toBe(PLATFORM.h);
  }
});

test('walls, gate machines, booth and fences are solid', () => {
  // the front wall beside the doors and the solid wings
  expect(walkHall(60, 570, 60, 660).z).toBeLessThan(618);
  expect(walkHall(150, 740, 150, 640).z).toBeGreaterThan(710);
  expect(walkHall(-150, 740, -150, 640).z).toBeGreaterThan(710);
  // the gate machines and the fences close the line except for the lanes
  expect(walkHall(-10, 650, -10, 700).z).toBeLessThan(672);
  expect(walkHall(90, 650, 90, 700).z).toBeLessThan(680);
  expect(walkHall(-95, 650, -95, 700).z).toBeLessThan(680);
  expect(walkHall(60, 650, 60, 700).z).toBeLessThan(672);
  // no height step anywhere while bumping around inside
  let seed = 4242;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let maxJump = 0;
  for (let k = 0; k < 300; k++) {
    const sx = -190 + rnd() * 380;
    const sz = 560 + rnd() * 200;
    if (hallBlocked(sx, sz)) continue;
    const a = rnd() * Math.PI * 2;
    maxJump = Math.max(maxJump, walkHall(sx, sz, sx + Math.cos(a) * 200, sz + Math.sin(a) * 200).maxJump);
  }
  expect(maxJump).toBeLessThanOrEqual(1.5);
});


test('the new office counter is solid and leaves a route from the entrance through the central gates', () => {
  const x = (OFFICE.x0 + OFFICE.x1) / 2;
  expect(walkHall(x, 640, x, 700).z).toBeLessThanOrEqual(OFFICE.z0);
  const through = walkHall(0, 640, 0, 700);
  expect(through.z).toBeGreaterThan(699);
  expect(through.maxJump).toBeLessThanOrEqual(1.5);
});
