import { expect, test } from '@playwright/test';
import { navigationText, type MapPlace } from '../src/gameplay/map';
import { DESTINATIONS, newPreferences, readPreferences } from '../src/gameplay/preferences';
import { residentName } from '../src/gameplay/errands';
import { newProgress, parseProgress } from '../src/gameplay/state';

const player = { x: 0, y: 0, z: 0 };
const resident: MapPlace = { id: 'resident-0', name: residentName('resident-0'), kind: 'landmark', x: 20, y: 0, z: 0 };

test('all existing map destinations and canonical resident IDs survive a full save roundtrip', () => {
  for (const destination of [...DESTINATIONS, 'resident-0', 'resident-1', 'resident-9', 'resident-10', 'resident-9999']) {
    const progress = newProgress();
    progress.money = 795; progress.inventory.tea = 2;
    progress.preferences = { destination, wayfinding: false, nightHintDay: 2 };
    const restored = parseProgress(JSON.stringify(progress));
    expect(restored).not.toBeNull();
    expect(restored!.preferences).toEqual(progress.preferences);
    expect(restored!.money).toBe(795);
    expect(restored!.inventory).toEqual(progress.inventory);
  }
  expect(readPreferences(newPreferences())).toEqual(newPreferences());
});

test('malformed resident destinations are rejected without accepting names or injected coordinates', () => {
  for (const destination of ['resident-', 'resident-01', 'resident--1', 'resident-1.5', 'resident-10000',
    'resident-0 ', ' resident-0', 'Resident-0', 'resident-0<script>', '佐倉 はる', '', undefined, 0,
    { id: 'resident-0', x: 0, z: 0 }]) {
    expect(readPreferences({ ...newPreferences(), destination })).toBeNull();
    const progress = newProgress();
    expect(parseProgress(JSON.stringify({ ...progress, preferences: { ...progress.preferences, destination } }))).toBeNull();
  }
});

test('resident guidance reaches the conversation radius at 24 units, rather than the landmark radius of 55', () => {
  for (const x of [0, 23.9, 24]) {
    const text = navigationText(player, { ...resident, x }, { obstacles: [] });
    expect(text).toContain(`${resident.name}が近くにいます`);
    expect(text).toContain('話しかけよう');
    expect(text).not.toContain('買い物');
    expect(text).not.toContain('ひと休みして');
  }
  for (const x of [24.01, 30, 54.9]) {
    const text = navigationText(player, { ...resident, x }, { obstacles: [] });
    expect(text).toContain(`目的地：${resident.name}`);
    expect(text).not.toContain('近くにいます');
    expect(text).not.toContain('話しかけよう');
  }
  expect(navigationText(player, { ...resident, id: 'plaza', name: '駅前公園', x: 40 }, { obstacles: [] })).toContain('駅前公園に到着');
  expect(navigationText(player, { ...resident, id: 'w-cafe', name: '喫茶 はるいろ', kind: 'shop', x: 28 }, { obstacles: [] })).toContain('買い物');
});

test('nearby resident directions never promise conversation through a wall or across another floor', () => {
  const wall = [{ minX: 8, maxX: 12, minZ: -3, maxZ: 3 }];
  const blocked = navigationText(player, resident, { obstacles: wall });
  expect(blocked).toContain('目的地：');
  expect(blocked).not.toContain('近くにいます');
  expect(blocked).not.toContain('話しかけよう');
  for (const y of [-30, -16, 16, 30]) {
    const text = navigationText(player, { ...resident, y }, { obstacles: [] });
    expect(text).toContain('目的地：');
    expect(text).not.toContain('話しかけよう');
  }
  expect(navigationText(player, { ...resident, y: 15.9 }, { obstacles: [] })).toContain('話しかけよう');
  expect(navigationText(player, resident, { obstacles: [{ minX: 8, maxX: 12, minZ: 8, maxZ: 12 }] })).toContain('話しかけよう');
});

test('a moving resident receives fresh metres and compass direction without being treated as a shop', () => {
  const north = navigationText(player, { ...resident, x: 0, z: 100 }, { obstacles: [] });
  const west = navigationText(player, { ...resident, x: -200, z: 0 }, { obstacles: [] });
  expect(north).toContain('直線約8m · 北へ');
  expect(west).toContain('直線約16m · 西へ');
  expect(north).toContain(resident.name);
  expect(west).not.toContain('買い物');
});
