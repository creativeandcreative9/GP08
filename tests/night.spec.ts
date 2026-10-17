import { expect, test } from '@playwright/test';
import { advanceClock, newLife, nextDay, restUntilMorning } from '../src/gameplay/calendar';
import { newPreferences, nightEpisode, readPreferences } from '../src/gameplay/preferences';

test('one evening hint covers both sides of midnight, while the next evening has a new episode', () => {
  expect(nightEpisode(1, 18 * 60)).toBe(2);
  expect(nightEpisode(1, 1439)).toBe(2);
  expect(nightEpisode(2, 0)).toBe(2);
  expect(nightEpisode(2, 359.9)).toBe(2);
  expect(nightEpisode(2, 360)).toBe(0);
  expect(nightEpisode(2, 1079.9)).toBe(0);
  expect(nightEpisode(2, 1080)).toBe(3);
  expect(nightEpisode(1, 1)).toBe(1);
  expect(newPreferences().nightHintDay).toBe(0);
});

test('the final supported evening token remains saveable and invalid episodes remain unset', () => {
  const token = nightEpisode(9999, 23 * 60);
  expect(token).toBe(10000);
  expect(readPreferences({ ...newPreferences(), nightHintDay: token })?.nightHintDay).toBe(token);
  expect(readPreferences({ ...newPreferences(), nightHintDay: token + 1 })).toBeNull();
  expect(readPreferences({ ...newPreferences(), nightHintDay: -1 })).toBeNull();
  for (const [day, minute] of [[0, 0], [10000, 0], [1, -1], [1, 1440], [1, NaN]]) expect(nightEpisode(day!, minute!)).toBe(0);
});

test('resting at 23:59 reaches the next morning and renews the date exactly once', () => {
  const life = newLife();
  life.day = 3; life.minute = 1439; life.collected = ['petal-0'];
  life.relations['resident-0'] = { points: 8, greetedDay: 3 }; life.petals = 7;
  const expected = structuredClone(life); nextDay(expected);
  restUntilMorning(life);
  expect(life).toEqual(expected);
  expect(life.day).toBe(4); expect(life.minute).toBe(480);
  expect(life.collected).toEqual([]);
  expect(life.petals).toBe(7);
  expect(life.relations['resident-0']).toEqual({ points: 8, greetedDay: 3 });
});

test('resting after 00:01 retains today, its weather and pickups instead of skipping the festival date', () => {
  const life = newLife();
  life.day = 3; life.minute = 1439;
  advanceClock(life, 2);
  expect(life.day).toBe(4); expect(life.minute).toBe(1);
  life.collected = ['petal-0', 'shell-0']; life.petals = 4; life.shells = 2;
  life.relations['resident-0'] = { points: 8, greetedDay: 4 };
  const before = structuredClone(life);
  restUntilMorning(life);
  expect(life).toEqual({ ...before, minute: 480 });
  expect(life.day % 3).toBe(1);
});

test('early morning rest waits until 08:00 and rest at or after 08:00 reaches tomorrow', () => {
  for (const minute of [0, 1, 359, 479.9]) {
    const life = newLife(); life.day = 2; life.minute = minute;
    restUntilMorning(life);
    expect({ day: life.day, minute: life.minute }).toEqual({ day: 2, minute: 480 });
  }
  for (const minute of [480, 720, 1080]) {
    const life = newLife(); life.day = 2; life.minute = minute;
    restUntilMorning(life);
    expect({ day: life.day, minute: life.minute }).toEqual({ day: 3, minute: 480 });
  }
});
