import { expect, test } from '@playwright/test';
import { advanceClock, collect, dailyGreeting, festivalOpen, festivalReward, friendship, newLife, nextDay, readLife, schedule } from '../src/gameplay/calendar';
import { newProgress, parseProgress } from '../src/gameplay/state';

test('older saves gain a clock and relationships without losing the active errand', () => {
  const current = newProgress(); current.greeted = ['resident-0']; current.errand = { resident: 'resident-0' };
  const { life: _life, ...previous } = current;
  const migrated = parseProgress(JSON.stringify({ ...previous, version: 2 }))!;
  expect(migrated.errand).toEqual(current.errand); expect(migrated.money).toBe(1200); expect(migrated.life).toEqual(newLife());
  expect(parseProgress(JSON.stringify(migrated))).toEqual(migrated);
});

test('clock rollovers renew pickups and deterministic weather while retaining relationships', () => {
  const l = newLife(); dailyGreeting(l, 'resident-0'); collect(l, 'petal-0'); l.minute = 1439.5;
  advanceClock(l, 1); expect(l.day).toBe(2); expect(l.minute).toBeCloseTo(.5); expect(l.collected).toEqual([]); expect(l.petals).toBe(1);
  expect(l.relations['resident-0']!.points).toBe(2);
  advanceClock(l, NaN); advanceClock(l, -100); expect(l.minute).toBe(.5);
  nextDay(l); expect(l.minute).toBe(480); expect(readLife(l)).toEqual(l);
});

test('daily greetings increase friendship once per resident per day and schedules include home time', () => {
  const l = newLife();
  for (let i = 0; i < 100; i++) dailyGreeting(l, 'resident-1');
  expect(l.relations['resident-1']!.points).toBe(2);
  for (let day = 0; day < 4; day++) { nextDay(l); dailyGreeting(l, 'resident-1'); }
  expect(friendship(l, 'resident-1')).toBe('顔なじみ');
  expect(schedule(23 * 60, 1).outside).toBe(false); expect(schedule(8 * 60, 1).activity).toBe('通勤・通学');
  expect(schedule(12 * 60, 1).pace).toBeLessThan(schedule(15 * 60, 1).pace);
});

test('collectibles and the festival cannot duplicate rewards, consume missing items or overflow the wallet', () => {
  const p = newProgress(), l = p.life;
  collect(l, 'petal-0'); expect(collect(l, 'petal-0').ok).toBe(false);
  expect(festivalReward(p).ok).toBe(false);
  collect(l, 'petal-1'); collect(l, 'petal-2');
  for (const id of ['resident-0', 'resident-1', 'resident-2']) dailyGreeting(l, id);
  p.money = 999401; expect(festivalReward(p).ok).toBe(false); expect(l.petals).toBe(3);
  p.money = 1200; expect(festivalReward(p).ok).toBe(true); expect(p.money).toBe(1800); expect(p.inventory.tea).toBe(1); expect(l.petals).toBe(0);
  collect(l, 'petal-3'); collect(l, 'petal-4'); collect(l, 'petal-5'); expect(festivalReward(p).ok).toBe(false);
  nextDay(l); expect(festivalOpen(l)).toBe(false); expect(festivalReward(p).ok).toBe(false);
});

test('malformed life state cannot introduce invalid clocks, relationships or collectibles', () => {
  const l = newLife();
  for (const change of [{ day: 0 }, { minute: 1440 }, { minute: NaN }, { weather: 'storm' }, { volume: -1 }, { petals: -1 }, { collected: ['<script>'] }, { relations: { 'resident-01': { points: 9, greetedDay: 1 } } }, { relations: { 'resident-0': { points: 101, greetedDay: 1 } } }, { festivalDay: 2 }]) expect(readLife({ ...l, ...change })).toBeNull();
});
