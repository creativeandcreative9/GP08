import { expect, test } from '@playwright/test';
import { EXPLORATION_PLACES, chooseExploration, explorationSuggestion, explorationThemes, newExploration, observationCards, presentObservation, readExploration, recordObservation, setFavorite, type ExplorationContext, type ExplorationState } from '../src/gameplay/exploration';

const context = (place: ExplorationContext['place'], change: Partial<ExplorationContext> = {}): ExplorationContext => ({ place, day: 1, minute: 840, weather: 'clear', ...change });

test('old saves gain an unselected walk and corrupt, duplicate or future discoveries are rejected', () => {
  expect(readExploration(undefined, 1)).toEqual(newExploration());
  const entry = { place: 'plaza', day: 1, minute: 840, weather: 'clear' };
  for (const value of [null, [], { ...newExploration(), active: 'fake' }, { ...newExploration(), favorite: 'plaza' },
    { ...newExploration(), observations: 'plaza' }, { ...newExploration(), observations: [entry, entry] },
    ...[{ place: 'fake' }, { day: 0 }, { day: 10000 }, { day: 2 }, { minute: NaN }, { minute: 1440 }, { weather: 'snow' }]
      .map(change => ({ ...newExploration(), observations: [{ ...entry, ...change }] }))]) expect(readExploration(value, 1)).toBeNull();
  const read = readExploration({ ...newExploration(), observations: [{ ...entry, body: '<script>fake</script>', completedThemes: ['lights'] }] }, 1)!;
  expect(read.observations).toEqual([entry]);
  expect(observationCards(read)[0]!.body).not.toContain('script');
  expect(explorationThemes(read).every(theme => !theme.complete)).toBe(true);
});

test('choosing, switching and pausing a theme never loses discoveries or silently records a visit', () => {
  const original = newExploration();
  let state = chooseExploration(original, 'sakura');
  expect(original).toEqual(newExploration());
  expect(state.observations).toEqual([]);
  expect(explorationSuggestion(state)?.destinationId).toBe('plaza');
  state = recordObservation(state, context('station')).state;
  state = chooseExploration(state, 'horizon');
  expect(explorationThemes(state).find(theme => theme.id === 'horizon')?.progress).toBe(1);
  expect(explorationSuggestion(state)?.destinationId).toBe('beach');
  state = chooseExploration(state, null);
  expect(explorationSuggestion(state)).toBeNull();
  state = chooseExploration(readExploration(JSON.parse(JSON.stringify(state)), 1)!, 'sakura');
  expect(explorationThemes(state).find(theme => theme.selected)?.progress).toBe(1);
  expect(state.observations.map(observation => observation.place)).toEqual(['station']);
});

test('every three-place theme completes in reverse order, in daylight, without waiting or reward farming', () => {
  const endings = new Set<string>();
  for (const theme of explorationThemes(newExploration())) {
    let state = chooseExploration(newExploration(), theme.id);
    for (const [index, step] of [...theme.steps].reverse().entries()) {
      const before = JSON.stringify(state);
      const result = recordObservation(state, context(step.place, { weather: 'rain', minute: 720 }));
      expect(JSON.stringify(state)).toBe(before);
      expect(result.ok).toBe(true);
      expect(result.completedThemes.some(completed => completed.id === theme.id)).toBe(index === 2);
      state = result.state;
    }
    const completed = explorationThemes(state).find(candidate => candidate.id === theme.id)!;
    expect(completed.complete).toBe(true); expect(completed.progress).toBe(3);
    expect(completed.ending!.length).toBeGreaterThan(50); endings.add(completed.ending!);
    expect(explorationSuggestion(state)).toMatchObject({ complete: true, body: completed.ending });
    expect(explorationSuggestion(state)?.destinationId).toBeUndefined();
    const repeat = recordObservation(state, context(theme.steps[0]!.place, { day: 2, minute: 1320 }));
    expect(repeat.ok).toBe(false); expect(repeat.state).toBe(state); expect(repeat.completedThemes).toEqual([]);
    expect(Object.keys(state).sort()).toEqual(['active', 'favorite', 'observations']);
  }
  expect(endings.size).toBe(3);
});

test('first weather, time and observation text survive later visits and reload unchanged', () => {
  const first = recordObservation(newExploration(), context('beach', { day: 3, minute: 1261.8, weather: 'rain' }));
  expect(first.discovery?.body).toContain('暗い海');
  expect(first.discovery?.body).toContain('雨の日');
  const reloaded = readExploration(JSON.parse(JSON.stringify(first.state)), 9)!;
  const later = recordObservation(reloaded, context('beach', { day: 9, minute: 480, weather: 'clear' }));
  expect(later.ok).toBe(false);
  expect(observationCards(later.state)).toEqual(observationCards(first.state));
  expect(later.state.observations).toEqual([{ place: 'beach', day: 3, minute: 1261, weather: 'rain' }]);
});

test('same-day future observation times are rejected without rejecting an earlier day or the current minute', () => {
  const state = recordObservation(newExploration(), context('beach', { day: 2, minute: 840 })).state;
  expect(readExploration(state, 2, 839.9)).toBeNull();
  expect(readExploration(state, 2, 840)).toEqual(state);
  expect(readExploration(state, 2, 840.9)).toEqual(state);
  expect(readExploration(state, 3, 480)).toEqual(state);
  expect(readExploration(state, 2)).toEqual(state);
  expect(readExploration(state, 2, NaN)).toBeNull();
});

test('revisiting offers current time and weather prose while the first postcard remains unchanged', () => {
  const state = recordObservation(newExploration(), context('beach', { day: 1, minute: 840, weather: 'clear' })).state;
  const before = JSON.stringify(state), first = observationCards(state);
  const now = presentObservation('beach', { day: 3, minute: 1261.8, weather: 'rain' });
  expect(now).toMatchObject({ id: 'beach', day: 3, minute: 1261, weather: 'rain' });
  expect(now!.body).toContain('暗い海');
  expect(now!.body).toContain('雨の日');
  expect(now!.body).not.toBe(first[0]!.body);
  expect(JSON.stringify(state)).toBe(before);
  expect(observationCards(state)).toEqual(first);
  expect(presentObservation('beach', { day: 3, minute: NaN, weather: 'clear' })).toBeNull();
});

test('favorites require a real recorded place and can be changed or removed without changing progress', () => {
  const empty = newExploration();
  expect(setFavorite(empty, 'home')).toBe(empty);
  let state = recordObservation(empty, context('plaza')).state;
  state = recordObservation(state, context('home')).state;
  const before = JSON.stringify(state.observations);
  state = setFavorite(state, 'plaza');
  expect(observationCards(state).filter(card => card.favorite).map(card => card.id)).toEqual(['plaza']);
  state = setFavorite(state, 'home');
  expect(readExploration(JSON.parse(JSON.stringify(state)), 1)?.favorite).toBe('home');
  expect(observationCards(state).filter(card => card.favorite).map(card => card.id)).toEqual(['home']);
  state = setFavorite(state, null);
  expect(observationCards(state).some(card => card.favorite)).toBe(false);
  expect(JSON.stringify(state.observations)).toBe(before);
});

test('invalid observation context cannot make discoveries and six distinct places are the finite maximum', () => {
  const empty = newExploration();
  for (const invalid of [context(undefined), context('plaza', { day: 0 }), context('plaza', { minute: Infinity }),
    { ...context('plaza'), weather: 'snow' } as unknown as ExplorationContext]) {
    const result = recordObservation(empty, invalid);
    expect(result.ok).toBe(false); expect(result.state).toBe(empty); expect(result.completedThemes).toEqual([]);
  }
  let state: ExplorationState = empty;
  for (const place of EXPLORATION_PLACES) state = recordObservation(state, context(place)).state;
  expect(state.observations).toHaveLength(6);
  expect(explorationThemes(state).every(theme => theme.complete)).toBe(true);
  for (const place of EXPLORATION_PLACES) expect(recordObservation(state, context(place, { day: 2, minute: 0 })).state).toBe(state);
  expect(readExploration(JSON.parse(JSON.stringify(state)), 2)).toEqual(state);
});
