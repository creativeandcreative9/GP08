import { expect, test } from '@playwright/test';
import { chooseExploration, recordObservation, setFavorite } from '../src/gameplay/exploration';
import { acceptStory, completeStory, observeStory } from '../src/gameplay/stories';
import { newProgress, parseProgress, type Progress } from '../src/gameplay/state';

const legacyCore = () => ({
  money: 875, inventory: { dango: 2, tea: 3, onigiri: 1, coffee: 0 },
  greeted: ['resident-0', 'resident-1'], boughtDango: true, ateDango: true, rewarded: true,
  position: { x: -35, z: 428 },
});

for (const version of [1, 2, 3] as const) test(`actual version-${version} saves gain empty stories and exploration while every prior value survives`, () => {
  const expected = { ...newProgress(), ...legacyCore() };
  const legacy: Record<string, unknown> = { ...legacyCore(), version };
  if (version >= 2) {
    expected.errand = { resident: 'resident-0' }; expected.completedErrands = ['resident-1'];
    legacy.errand = expected.errand; legacy.completedErrands = expected.completedErrands;
  }
  if (version === 3) {
    expected.life = { ...expected.life, day: 5, minute: 930, weather: 'rain', shells: 2, petals: 1,
      relations: { 'resident-0': { points: 8, greetedDay: 5 } }, sound: true, volume: .25 };
    expected.journey = { memories: [{ id: 'hello', day: 2, minute: 850 }] };
    expected.preferences = { wayfinding: false, destination: 'home', nightHintDay: 4 };
    Object.assign(legacy, { life: expected.life, journey: expected.journey, preferences: expected.preferences });
  }
  expect(Object.hasOwn(legacy, 'stories')).toBe(false);
  expect(Object.hasOwn(legacy, 'exploration')).toBe(false);
  const restored = parseProgress(JSON.stringify(legacy));
  expect(restored).toEqual(expected);
  expect(restored!.stories).toEqual({ arcs: [] });
  expect(restored!.exploration).toEqual({ active: null, favorite: null, observations: [] });
  expect(parseProgress(JSON.stringify(restored))).toEqual(restored);
});

/** A real completed branch plus independently chosen walk, favorite and returning speaker. */
function fullProgress(): Progress {
  const p = newProgress();
  p.money = 875; p.inventory.tea = 3; p.inventory.onigiri = 1;
  p.greeted = ['resident-0', 'resident-1']; p.errand = { resident: 'resident-1' };
  p.life.day = 5; p.life.minute = 930; p.life.weather = 'rain';
  p.life.relations['resident-0'] = { points: 8, greetedDay: 5 };
  p.journey = { memories: [{ id: 'hello', day: 3, minute: 840 }] };
  const time = { day: 5, minute: 900, weather: 'rain' as const, resident: 'resident-0' };
  p.stories = acceptStory(p.stories, 'resident-0', 'sky', time).state;
  p.stories = observeStory(p.stories, 'sakura', { ...time, minute: 915, place: 'plaza', resting: true }).state;
  p.stories = completeStory(p.stories, 'resident-0', { ...time, minute: 920 }).state;
  p.exploration = chooseExploration(p.exploration, 'horizon');
  p.exploration = recordObservation(p.exploration, { place: 'plaza', day: 4, minute: 720, weather: 'clear' }).state;
  p.exploration = recordObservation(p.exploration, { place: 'beach', day: 5, minute: 900, weather: 'rain' }).state;
  p.exploration = setFavorite(p.exploration, 'beach');
  p.preferences = { wayfinding: false, destination: 'resident-0', nightHintDay: 0 };
  return p;
}

test('completed story, original observations, favorite, weather and resident destination roundtrip through the real save parser', () => {
  const original = fullProgress(), restored = parseProgress(JSON.stringify(original))!;
  expect(restored).toEqual(original);
  expect(restored.stories.arcs[0]).toMatchObject({ resident: 'resident-0', choice: 'sky', stage: 'completed',
    acceptedDay: 5, acceptedMinute: 900, completedDay: 5, completedMinute: 920,
    observed: { place: 'plaza', day: 5, minute: 915, weather: 'rain', activity: 'rest' } });
  expect(restored.exploration).toMatchObject({ active: 'horizon', favorite: 'beach' });
  expect(restored.preferences).toMatchObject({ wayfinding: false, destination: 'resident-0' });
  restored.stories.arcs[0]!.observed!.weather = 'clear';
  restored.exploration.observations[0]!.minute = 721;
  expect(original.stories.arcs[0]!.observed!.weather).toBe('rain');
  expect(original.exploration.observations[0]!.minute).toBe(720);
});

test('a valid-looking story cannot bypass greeted-speaker, branch or current-clock constraints in the full save', () => {
  const original = fullProgress(), arc = original.stories.arcs[0]!;
  const candidates = [
    { ...original, greeted: ['resident-1'] },
    ...[
      { resident: 'resident-3' }, { resident: 'resident-1' }, { choice: 'far' }, { id: 'invented' },
      { completedDay: 6 }, { completedMinute: 931 },
      { observed: { ...arc.observed!, day: 6 } },
      { acceptedDay: 6 },
    ].map(change => ({ ...original, stories: { arcs: [{ ...arc, ...change }] } })),
  ];
  for (const corrupt of candidates) expect(parseProgress(JSON.stringify(corrupt))).toBeNull();
  expect(parseProgress(JSON.stringify(original))).toEqual(original);
});

test('future, unknown or duplicate places and an undiscovered favorite cannot enter a full save', () => {
  const original = fullProgress(), exploration = original.exploration;
  for (const change of [
    { active: 'unknown-theme' }, { favorite: 'unknown-place' }, { favorite: 'home' },
    { observations: [{ ...exploration.observations[0]!, place: 'unknown-place' }] },
    { observations: [{ ...exploration.observations[0]!, day: 6 }, exploration.observations[1]!] },
    { observations: [exploration.observations[0]!, exploration.observations[0]!, exploration.observations[1]!] },
  ]) expect(parseProgress(JSON.stringify({ ...original, exploration: { ...exploration, ...change } }))).toBeNull();
  expect(parseProgress(JSON.stringify({ ...original, preferences: { ...original.preferences, destination: 'resident-00' } }))).toBeNull();
  expect(parseProgress(JSON.stringify(original))).toEqual(original);
});

test('all three story stages and a finished exploration leave money, food, errands and relationships unchanged after every save', () => {
  const progress = newProgress();
  progress.money = 0; progress.inventory = { dango: 0, tea: 2, onigiri: 1, coffee: 0 };
  progress.greeted = ['resident-0', 'resident-1', 'resident-2'];
  progress.errand = { resident: 'resident-1' };
  progress.life.relations['resident-0'] = { points: 2, greetedDay: 1 };
  const economy = (p: Progress) => ({ money: p.money, inventory: p.inventory, errand: p.errand, completedErrands: p.completedErrands,
    relations: p.life.relations, greeted: p.greeted, boughtDango: p.boughtDango, ateDango: p.ateDango, rewarded: p.rewarded });
  const before = JSON.stringify(economy(progress));
  const assertSavedEconomy = (): void => {
    const restored = parseProgress(JSON.stringify(progress));
    expect(restored).not.toBeNull(); expect(JSON.stringify(economy(restored!))).toBe(before);
  };
  for (const [resident, id, choice, place] of [
    ['resident-0', 'sakura', 'shade', 'plaza'], ['resident-1', 'sea', 'far', 'beach'], ['resident-2', 'station', 'return', 'station'],
  ] as const) {
    const ctx = { day: 1, minute: 840, weather: 'clear' as const, resident };
    const accepted = acceptStory(progress.stories, resident, choice, ctx);
    expect(accepted.ok).toBe(true); progress.stories = accepted.state; assertSavedEconomy();
    const observed = observeStory(progress.stories, id, { ...ctx, place, resting: true });
    expect(observed.ok).toBe(true); progress.stories = observed.state; assertSavedEconomy();
    const completed = completeStory(progress.stories, resident, ctx);
    expect(completed.ok).toBe(true); progress.stories = completed.state; assertSavedEconomy();
  }
  progress.exploration = chooseExploration(progress.exploration, 'sakura');
  for (const place of ['plaza', 'w-cafe', 'station'] as const) {
    const observed = recordObservation(progress.exploration, { place, day: 1, minute: 840, weather: 'clear' });
    expect(observed.ok).toBe(true); progress.exploration = observed.state; assertSavedEconomy();
  }
  progress.exploration = setFavorite(progress.exploration, 'plaza'); assertSavedEconomy();
  expect(progress.stories.arcs.every(arc => arc.stage === 'completed')).toBe(true);
  expect(progress.exploration.observations).toHaveLength(3);
});
