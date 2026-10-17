import { expect, test } from '@playwright/test';
import { newLife, nextDay } from '../src/gameplay/calendar';
import { newProgress, parseProgress } from '../src/gameplay/state';
import { JOURNEY_IDS, journeyCards, journeyCompletion, newJourney, nextJourneySuggestion, observeJourney, readJourney, residentReply, type JourneyContext } from '../src/gameplay/journey';

function context(change: Partial<JourneyContext> = {}): JourneyContext {
  return { life: newLife(), greeted: [], completedErrands: [], ...change };
}

test('an existing version-3 save gains memories without losing money, items, its active errand or friendships', () => {
  const progress = newProgress();
  progress.money = 875; progress.inventory.tea = 2; progress.greeted = ['resident-0'];
  progress.errand = { resident: 'resident-0' }; progress.life.relations['resident-0'] = { points: 2, greetedDay: 1 };
  const { journey: _journey, preferences: _preferences, ...legacy } = progress;
  const restored = parseProgress(JSON.stringify(legacy))!;
  expect(restored).toEqual(progress);
  restored.journey = observeJourney(restored.journey, context({ life: restored.life, greeted: restored.greeted })).state;
  expect(parseProgress(JSON.stringify(restored))).toEqual(restored);
  expect(parseProgress(JSON.stringify({ ...restored, journey: { memories: [{ id: 'hello', day: 2, minute: 480 }] } }))).toBeNull();
});

test('old saves start an empty memory book and malformed or duplicate memories are rejected', () => {
  expect(readJourney(undefined)).toEqual(newJourney());
  for (const value of [null, [], { memories: 'hello' }, { memories: [{ id: 'not-real', day: 1, minute: 840 }] },
    { memories: [{ id: 'hello', day: 0, minute: 840 }] }, { memories: [{ id: 'hello', day: 10000, minute: 840 }] },
    { memories: [{ id: 'hello', day: 1, minute: NaN }] }, { memories: [{ id: 'hello', day: 1, minute: 1440 }] },
    { memories: Array.from({ length: 8 }, () => ({ id: 'hello', day: 1, minute: 840 })) },
    { memories: [{ id: 'hello', day: 1, minute: 840 }, { id: 'hello', day: 2, minute: 480 }] }]) expect(readJourney(value)).toBeNull();
  const restored = readJourney({ memories: [{ id: 'hello', day: 1, minute: 840, body: '<script>injected</script>' }] });
  expect(restored).toEqual({ memories: [{ id: 'hello', day: 1, minute: 840 }] });
  expect(journeyCards(restored!)[0]!.body).not.toContain('script');
});

test('memories require earned events, deduplicate across reload and never mutate the economy', () => {
  const p = newProgress();
  const input = context({ life: p.life, greeted: p.greeted, completedErrands: p.completedErrands });
  const empty = newJourney();
  expect(observeJourney(empty, input)).toEqual({ state: empty, unlocked: [] });
  p.greeted.push('resident-2'); p.completedErrands.push('resident-2');
  const before = JSON.stringify(p);
  const earned = observeJourney(empty, input);
  expect(earned.unlocked.map(card => card.id)).toEqual(['hello', 'kindness']);
  expect(empty).toEqual(newJourney());
  expect(JSON.stringify(p)).toBe(before);
  const loaded = readJourney(JSON.parse(JSON.stringify(earned.state)))!;
  expect(observeJourney(loaded, input).unlocked).toEqual([]);
  expect(observeJourney(newJourney(), context({ greeted: ['corrupt'], completedErrands: ['resident-2'] })).unlocked).toEqual([]);
});

test('a picnic records eating on a plaza bench, never historic food flags, standing or an indoor chair', () => {
  for (const input of [context({ place: 'plaza', resting: true }), context({ place: 'plaza', consumed: 'dango' }),
    context({ place: 'home', resting: true, consumed: 'tea' }), context({ resting: true, consumed: 'coffee' })]) {
    expect(observeJourney(newJourney(), input).unlocked).toEqual([]);
  }
  for (const item of ['dango', 'tea', 'onigiri', 'coffee'] as const) {
    const earned = observeJourney(newJourney(), context({ place: 'plaza', resting: true, consumed: item }));
    expect(earned.unlocked.map(card => card.id)).toEqual(['picnic']);
    expect(earned.state.memories[0]).toEqual({ id: 'picnic', day: 1, minute: 840 });
  }
});

test('sea and summit discoveries require reaching the place, independently of checklist order', () => {
  const life = newLife(); life.shells = 1;
  expect(observeJourney(newJourney(), context({ life })).unlocked).toEqual([]);
  expect(observeJourney(newJourney(), context({ place: 'beach' })).unlocked).toEqual([]);
  expect(observeJourney(newJourney(), context({ life, place: 'beach' })).unlocked.map(card => card.id)).toEqual(['sea']);
  expect(observeJourney(newJourney(), context({ place: 'summit' })).unlocked.map(card => card.id)).toEqual(['summit']);
});

test('a new-morning memory requires sleeping at home, never ordinary midnight rollover or a clock edit', () => {
  const life = newLife(); nextDay(life);
  for (const input of [context({ life, place: 'home' }), context({ life, sleptAtHome: true }),
    context({ place: 'home', sleptAtHome: true }), context({ life: { ...life, minute: 1200 }, place: 'home', sleptAtHome: true })]) {
    expect(observeJourney(newJourney(), input).unlocked).toEqual([]);
  }
  expect(observeJourney(newJourney(), context({ life, place: 'home', sleptAtHome: true })).unlocked.map(card => card.id)).toEqual(['tomorrow']);
});

test('festival memory follows receiving its keepsake, not merely opening day or visiting its booth', () => {
  const life = newLife();
  expect(observeJourney(newJourney(), context({ life, place: 'plaza' })).unlocked).toEqual([]);
  for (const festivalDay of [2, -1, 4, NaN]) expect(observeJourney(newJourney(), context({ life: { ...life, festivalDay } })).unlocked).toEqual([]);
  life.festivalDay = 1;
  expect(observeJourney(newJourney(), context({ life })).unlocked.map(card => card.id)).toEqual(['festival']);
  nextDay(life);
  expect(observeJourney(newJourney(), context({ life })).unlocked.map(card => card.id)).toEqual(['festival']);
});

test('suggestions explain nighttime and picnic supplies, then leave free choice after the book is complete', () => {
  const life = newLife(); life.minute = 1200;
  const night = nextJourneySuggestion(newJourney(), context({ life }));
  expect(night.destinationId).toBe('home'); expect(night.body).toContain('朝8時'); expect(night.body).toContain('なくなりません');
  const withGreetings = observeJourney(newJourney(), context({ greeted: ['resident-0'], completedErrands: ['resident-0'] })).state;
  expect(nextJourneySuggestion(withGreetings, context({ inventory: {} })).destinationId).toBe('e-wagashi');
  expect(nextJourneySuggestion(withGreetings, context({ inventory: { tea: 1 } })).destinationId).toBe('plaza');
  const complete = { memories: JOURNEY_IDS.map(id => ({ id, day: 1, minute: 840 })) };
  expect(nextJourneySuggestion(complete, context()).title).toBe('今日は、どこへ行こう');
  expect(journeyCards(complete).every(card => card.unlocked)).toBe(true);
  expect(journeyCompletion(complete)?.body).toContain('七つの思い出');
  expect(journeyCompletion(withGreetings)).toBeNull();
  const lockedPicnic = journeyCards(newJourney()).find(card => card.id === 'picnic')!;
  expect(lockedPicnic.body).toContain('座ってから'); expect(lockedPicnic.day).toBeUndefined();
});

test('resident replies remember their own parcel, acquaintance and previous day without inventing another resident history', () => {
  const p = newProgress(); p.greeted.push('resident-0'); p.completedErrands.push('resident-0');
  expect(residentReply('resident-0', p)).toContain('お菓子の注文票');
  expect(residentReply('resident-1', p)).not.toContain('届けて');
  expect(residentReply('bad-id', p)).toBe('');
  p.life.relations['resident-1'] = { points: 8, greetedDay: 1 };
  expect(residentReply('resident-1', p)).toContain('好きな場所');
  p.life.relations['resident-2'] = { points: 2, greetedDay: 1 }; nextDay(p.life);
  expect(residentReply('resident-2', p)).toContain('またあいさつ');
  p.errand = { resident: 'resident-3' };
  expect(residentReply('resident-3', p)).toContain('急ぎではない');
});
