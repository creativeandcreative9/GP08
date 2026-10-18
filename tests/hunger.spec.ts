import { expect, test } from '@playwright/test';
import { advanceHunger, readHunger, relieveHunger } from '../src/gameplay/hunger';
import { consume, homeMeal, ITEM_IDS, ITEMS, newProgress, parseProgress } from '../src/gameplay/state';

for (const version of [1, 2, 3] as const) test(`version-${version} saves without hunger migrate full without changing the prior progress`, () => {
  const expected = newProgress();
  expected.money = 0; expected.inventory.tea = 2; expected.greeted = ['resident-0'];
  if (version === 3) {
    expected.life.day = 3; expected.life.minute = 1020; expected.life.weather = 'rain';
    expected.preferences = { wayfinding: false, destination: 'home', nightHintDay: 2 };
  }
  const legacy: Record<string, unknown> = { ...expected, version };
  delete legacy.hunger;
  if (version < 3) delete legacy.life;
  if (version === 1) { delete legacy.errand; delete legacy.completedErrands; }
  const restored = parseProgress(JSON.stringify(legacy));
  expect(restored).toEqual(expected);
  expect(restored!.hunger).toBe(0);
});

test('fractional hunger and both boundaries survive save/reload; explicit corrupted values never become full', () => {
  const progress = newProgress();
  for (const hunger of [0, 1 / 12, 73.625, 100]) {
    progress.hunger = hunger;
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
  }
  for (const hunger of [null, -0.01, 100.01, '25', true, {}, [], NaN, Infinity, -Infinity]) {
    expect(parseProgress(JSON.stringify({ ...progress, hunger }))).toBeNull();
    expect(readHunger(hunger)).toBeNull();
  }
  expect(readHunger(undefined)).toBe(0);
});

test('active elapsed time is frame independent and running raises hunger without touching the rest of progress', () => {
  const walking = newProgress(), running = newProgress(), fineFrames = newProgress();
  const before = newProgress();
  advanceHunger(walking, 60);
  advanceHunger(running, 60, 3);
  for (let frame = 0; frame < 3600; frame++) advanceHunger(fineFrames, 1 / 60);
  expect(walking.hunger).toBe(5);
  expect(running.hunger).toBe(20);
  expect(fineFrames.hunger).toBeCloseTo(walking.hunger, 8);
  expect({ ...walking, hunger: 0 }).toEqual(before);
  expect({ ...running, hunger: 0 }).toEqual(before);
});

test('hunger saturates without death, lost money, time skips or inventory changes', () => {
  const walking = newProgress(), running = newProgress();
  const before = newProgress();
  for (let minute = 0; minute < 20; minute++) advanceHunger(walking, 60);
  for (let minute = 0; minute < 5; minute++) advanceHunger(running, 60, 3);
  expect(walking.hunger).toBe(100);
  expect(running.hunger).toBe(100);
  advanceHunger(running, 60, 3);
  expect(running.hunger).toBe(100);
  expect({ ...walking, hunger: 0 }).toEqual(before);
  expect({ ...running, hunger: 0 }).toEqual(before);
});

test('invalid elapsed inputs cannot drain hunger and extreme frames or run multipliers are bounded', () => {
  const progress = newProgress(); progress.hunger = 10;
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) advanceHunger(progress, dt, 3);
  expect(progress.hunger).toBe(10);
  advanceHunger(progress, 999999, 999999);
  expect(progress.hunger).toBe(30); // Same cap as a 60-second multiplier-3 tick.
  for (const multiplier of [-1, NaN, Infinity, -Infinity]) advanceHunger(progress, 12, multiplier);
  expect(progress.hunger).toBe(34);
  for (const amount of [0, -1, NaN, Infinity, -Infinity]) expect(relieveHunger(progress, amount)).toBe(0);
  expect(progress.hunger).toBe(34);
});

test('each real food consumes exactly one item and relieves its documented hunger amount once', () => {
  for (const id of ITEM_IDS) {
    const progress = newProgress();
    progress.hunger = 80; progress.inventory[id] = 2;
    const money = progress.money, minute = progress.life.minute;
    expect(consume(progress, id).ok).toBe(true);
    expect(progress.hunger).toBe(80 - ITEMS[id].hungerRelief);
    expect(progress.inventory[id]).toBe(1);
    expect(progress.money).toBe(money);
    expect(progress.life.minute).toBe(minute);
    expect(consume(progress, id).ok).toBe(true);
    expect(progress.hunger).toBe(Math.max(0, 80 - ITEMS[id].hungerRelief * 2));
    expect(progress.inventory[id]).toBe(0);
    const after = JSON.stringify(progress);
    expect(consume(progress, id).ok).toBe(false);
    expect(JSON.stringify(progress)).toBe(after);
  }
});

test('near-full eating never goes negative and a full player can still earn the existing first-walk milestone', () => {
  const progress = newProgress();
  progress.hunger = .25; progress.inventory.onigiri = 1;
  expect(consume(progress, 'onigiri').ok).toBe(true);
  expect(progress.hunger).toBe(0);
  progress.inventory.dango = 1; progress.boughtDango = true; progress.greeted = ['resident-0'];
  const money = progress.money;
  expect(consume(progress, 'dango').ok).toBe(true);
  expect(progress.hunger).toBe(0);
  expect(progress.ateDango).toBe(true);
  expect(progress.rewarded).toBe(true);
  expect(progress.money).toBe(money + 500);
});

test('a free home meal remains available at zero money and preserves every other saved field', () => {
  const progress = newProgress();
  progress.money = 0; progress.hunger = 100;
  progress.life.day = 4; progress.life.minute = 1320;
  progress.greeted = ['resident-0']; progress.errand = { resident: 'resident-0' };
  progress.inventory.tea = 2;
  progress.preferences = { wayfinding: false, destination: 'home', nightHintDay: 4 };
  const expected = { ...structuredClone(progress), hunger: 0 };
  expect(homeMeal(progress).ok).toBe(true);
  expect(progress).toEqual(expected);
  expect(homeMeal(progress).ok).toBe(true);
  expect(progress).toEqual(expected);
  expect(parseProgress(JSON.stringify(progress))).toEqual(expected);
});
