import { expect, test } from '@playwright/test';
import { acceptStory, completeStory, newStories, observeStory, readStories, storyCards, storyForResident, storyOffer, storyReunion, type StoryContext, type StoryId, type StoryState } from '../src/gameplay/stories';

const context = (changes: Partial<StoryContext> = {}): StoryContext => ({ day: 1, minute: 840, weather: 'clear', ...changes });
const accepted = (resident = 'resident-0', choice = 'shade'): StoryState => acceptStory(newStories(), resident, choice, context({ resident })).state;

test('three distinct invitations pin the original speaker and defer without changing progress', () => {
  const state = newStories(), before = JSON.stringify(state);
  expect(['resident-0', 'resident-1', 'resident-2', 'resident-3'].map(storyForResident)).toEqual(['sakura', 'sea', 'station', 'sakura']);
  expect(storyForResident('resident-01')).toBeUndefined();
  const offers = ['resident-0', 'resident-1', 'resident-2'].map(resident => storyOffer(state, resident, context({ resident }))!);
  expect(new Set(offers.map(offer => offer.title)).size).toBe(3);
  expect(new Set(offers.map(offer => offer.portraitLine)).size).toBe(3);
  expect(offers.every(offer => offer.stage === 'offer' && offer.choices.length === 2)).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
  expect(storyOffer(state, 'resident-0', context())).toBeNull();
  const chosen = accepted();
  expect(storyOffer(chosen, 'resident-3', context({ resident: 'resident-3' }))).toBeNull();
  expect(acceptStory(chosen, 'resident-3', 'shade', context({ resident: 'resident-3' })).ok).toBe(false);
  expect(storyOffer(chosen, 'resident-0', context({ resident: 'resident-0' }))?.choices).toEqual([]);
  expect(storyCards(chosen)[0]).toMatchObject({ residentId: 'resident-0', destinationId: 'plaza', stage: 'accepted' });
});

test('both free sakura choices need a real seated visit, then preserve different outcomes and later dialogue', () => {
  const endings: string[] = [], reunions: string[] = [];
  for (const choice of ['shade', 'sky']) {
    const original = accepted('resident-0', choice), before = JSON.stringify(original);
    expect(observeStory(original, 'sakura', context({ place: 'plaza' })).ok).toBe(false);
    expect(observeStory(original, 'sakura', context({ place: 'station', resting: true })).ok).toBe(false);
    expect(completeStory(original, 'resident-0', context({ resident: 'resident-0' })).ok).toBe(false);
    const observed = observeStory(original, 'sakura', context({ day: 4, minute: 1110, weather: 'cloudy', place: 'plaza', resting: true }));
    expect(observed.ok).toBe(true); expect(observed.state.arcs[0]!.observed?.snack).toBeUndefined();
    expect(JSON.stringify(original)).toBe(before);
    expect(observed.card).toMatchObject({ stage: 'observed', residentId: 'resident-0' });
    expect(observed.card!.destinationId).toBeUndefined();
    expect(completeStory(observed.state, 'resident-3', context({ day: 5, resident: 'resident-3' })).ok).toBe(false);
    const completed = completeStory(observed.state, 'resident-0', context({ day: 5, resident: 'resident-0' }));
    expect(completed.ok).toBe(true);
    expect(completed.card!.observation).toContain('4日目 18:30・くもり');
    expect(completed.card!.ending).toContain('公園の案内札に、小さな花');
    expect(completed.state.arcs[0]!.choice).toBe(choice);
    endings.push(completed.card!.ending!);
    reunions.push(storyReunion(completed.state, 'resident-0', context({ day: 6, resident: 'resident-0' })));
    expect(storyReunion(completed.state, 'resident-3', context({ day: 6, resident: 'resident-3' }))).toBe('');
    expect(readStories(JSON.parse(JSON.stringify(completed.state)), 6, 840)).toEqual(completed.state);
  }
  expect(endings[0]).not.toBe(endings[1]); expect(reunions[0]).not.toBe(reunions[1]);
  expect(endings[0]).toContain('木陰'); expect(endings[1]).toContain('空');
});

test('sea observation and station listening record distinct activities, places, weather and choices without pickups or audio requirements', () => {
  for (const [id, resident, place, activity, choices] of [
    ['sea', 'resident-1', 'beach', 'watch', ['near', 'far']],
    ['station', 'resident-2', 'station', 'listen', ['leave', 'return']],
  ] as const) {
    const endings: string[] = [];
    for (const choice of choices) {
      const state = accepted(resident, choice);
      expect(observeStory(state, id, context({ place: 'plaza' })).ok).toBe(false);
      const observed = observeStory(state, id, context({ day: 2, minute: 1265, weather: 'rain', place }));
      expect(observed.ok).toBe(true);
      expect(observed.state.arcs[0]!.observed).toMatchObject({ place, activity, day: 2, minute: 1265, weather: 'rain' });
      const completed = completeStory(observed.state, resident, context({ day: 3, resident }));
      expect(completed.ok).toBe(true); endings.push(completed.card!.ending!);
      expect(completed.card!.observation).toContain('2日目 21:05・雨');
      if (id === 'sea') expect(completed.card!.ending).toContain('海の案内札に、貝');
    }
    expect(endings[0]).not.toBe(endings[1]);
  }
});

test('repeated acceptance, observation and completion cannot replace a choice, date or speaker', () => {
  const state = accepted();
  const repeated = acceptStory(state, 'resident-0', 'sky', context({ resident: 'resident-0' }));
  expect(repeated.ok).toBe(false); expect(repeated.state).toBe(state); expect(state.arcs[0]!.choice).toBe('shade');
  expect(acceptStory(newStories(), 'resident-0', 'far', context({ resident: 'resident-0' })).ok).toBe(false);
  const observed = observeStory(state, 'sakura', context({ place: 'plaza', resting: true })).state;
  const repeatObservation = observeStory(observed, 'sakura', context({ day: 6, place: 'plaza', resting: true, consumed: 'tea' }));
  expect(repeatObservation.ok).toBe(false); expect(repeatObservation.state).toBe(observed);
  const complete = completeStory(observed, 'resident-0', context({ resident: 'resident-0' })).state;
  const repeatCompletion = completeStory(complete, 'resident-0', context({ day: 10, resident: 'resident-0' }));
  expect(repeatCompletion.ok).toBe(false); expect(repeatCompletion.state).toBe(complete);
  expect(complete.arcs[0]!.completedDay).toBe(1);
  expect(Object.keys(complete)).toEqual(['arcs']);
});

test('a successful snack event adds a true optional detail but no inventory, money or reward is stored or mutated', () => {
  const state = accepted(), event = context({ place: 'plaza', resting: true, consumed: 'tea' });
  const before = JSON.stringify(event), observed = observeStory(state, 'sakura', event);
  expect(observed.ok).toBe(true); expect(observed.card!.observation).toContain('緑茶');
  expect(JSON.stringify(event)).toBe(before);
  expect(observed.state.arcs[0]!.observed?.snack).toBe('tea');
  const sea = observeStory(accepted('resident-1', 'near'), 'sea', context({ place: 'beach', consumed: 'tea' }));
  expect(sea.state.arcs[0]!.observed?.snack).toBeUndefined();
});

test('stories can be postponed for days, resumed from a saved step and connected in any completion order', () => {
  let state = newStories();
  for (const [resident, choice] of [['resident-2', 'return'], ['resident-0', 'sky'], ['resident-1', 'far']]) {
    state = acceptStory(state, resident!, choice!, context({ resident })).state;
  }
  expect(state.arcs).toHaveLength(3);
  state = readStories(JSON.parse(JSON.stringify(state)), 80, 840)!;
  state = observeStory(state, 'sakura', context({ day: 80, place: 'plaza', resting: true })).state;
  state = completeStory(state, 'resident-0', context({ day: 81, resident: 'resident-0' })).state;
  const stationOffer = storyOffer(state, 'resident-2', context({ day: 82, resident: 'resident-2' }))!;
  expect(stationOffer.stage).toBe('accepted');
  state = observeStory(state, 'station', context({ day: 83, place: 'station' })).state;
  state = completeStory(state, 'resident-2', context({ day: 84, resident: 'resident-2' })).state;
  const reunion = storyReunion(state, 'resident-2', context({ day: 85, resident: 'resident-2' }));
  expect(reunion).toContain('佐倉 はる');
  expect(reunion).toContain('桜の向こうの空を見上げる');
  expect(state.arcs.find(arc => arc.id === 'sea')?.stage).toBe('accepted');
});

test('missing stories migrate empty and saved copy cannot inject text, duplicate arcs or invalid state transitions', () => {
  expect(readStories(undefined, 1, 840)).toEqual(newStories());
  const base = accepted().arcs[0]!;
  const cases: unknown[] = [null, [], { arcs: null }, { arcs: [base, base] }, { arcs: Array(4).fill(base) },
    ...[{ id: 'invented' }, { resident: 'resident-01' }, { resident: 'resident-1' }, { stage: 'offer' }, { choice: 'near' },
      { acceptedDay: 0 }, { acceptedDay: 10000 }, { acceptedMinute: NaN }, { acceptedMinute: 1440 },
      { completedDay: 1 }, { observed: { place: 'plaza' } }, { stage: 'observed' }, { stage: 'completed' }].map(patch => ({ arcs: [{ ...base, ...patch }] }))];
  for (const corrupt of cases) expect(readStories(corrupt)).toBeNull();
  const clean = readStories({ arcs: [{ ...base, title: '<script>', ending: 'forged', reward: 1000000 }] }, 1, 840)!;
  expect(clean).toEqual({ arcs: [base] });
  expect(storyCards(clean)[0]!.body).not.toContain('script');
});

test('saved observations must match their real activity and cannot precede acceptance, completion or the current clock', () => {
  const arc = observeStory(accepted(), 'sakura', context({ day: 2, minute: 900, place: 'plaza', resting: true })).state.arcs[0]!;
  for (const patch of [{ place: 'beach' }, { activity: 'watch' }, { weather: 'snow' }, { day: 1, minute: 800 }, { snack: '__proto__' }]) {
    expect(readStories({ arcs: [{ ...arc, observed: { ...arc.observed!, ...patch } }] }, 3, 840)).toBeNull();
  }
  expect(readStories({ arcs: [arc] }, 1, 1439)).toBeNull();
  expect(readStories({ arcs: [arc] }, 2, 899)).toBeNull();
  expect(readStories({ arcs: [arc] }, 2, 900)).not.toBeNull();
  expect(readStories({ arcs: [{ ...arc, stage: 'completed', completedDay: 2, completedMinute: 899 }] }, 3, 840)).toBeNull();
  expect(readStories({ arcs: [{ ...arc, stage: 'observed', completedDay: 3, completedMinute: 840 }] }, 3, 840)).toBeNull();
  expect(readStories({ arcs: [{ ...arc, stage: 'completed', completedDay: 4, completedMinute: 840 }] }, 3, 840)).toBeNull();
});

test('invalid clocks, out-of-order actions and remote return calls leave the state unchanged', () => {
  const state = accepted();
  for (const patch of [{ day: 0 }, { minute: NaN }, { minute: 1440 }]) {
    const attempted = observeStory(state, 'sakura', context({ place: 'plaza', resting: true, ...patch }));
    expect(attempted.ok).toBe(false); expect(attempted.state).toBe(state);
  }
  expect(observeStory(state, 'sakura', context({ minute: 839, place: 'plaza', resting: true })).ok).toBe(false);
  const observed = observeStory(state, 'sakura', context({ place: 'plaza', resting: true })).state;
  expect(completeStory(observed, 'resident-0', context()).ok).toBe(false);
  expect(completeStory(observed, 'resident-0', context({ resident: 'resident-3' })).ok).toBe(false);
  expect(completeStory(observed, 'resident-0', context({ resident: 'resident-0', minute: 839 })).ok).toBe(false);
  expect(observeStory(newStories(), 'sakura' as StoryId, context({ place: 'plaza', resting: true })).ok).toBe(false);
});

test('later reunions connect the pinned people and actual branches in both directions without rewriting dated endings', () => {
  let state = acceptStory(newStories(), 'resident-7', 'far', context({ resident: 'resident-7' })).state;
  state = observeStory(state, 'sea', context({ place: 'beach' })).state;
  state = completeStory(state, 'resident-7', context({ resident: 'resident-7' })).state;
  const before = storyCards(state)[0]!;
  const firstMeeting = storyOffer(state, 'resident-12', context({ day: 2, resident: 'resident-12' }))!;
  expect(firstMeeting.body).toContain('高橋 はる');
  expect(firstMeeting.body).toContain('遠くの海へ、目を向ける');
  expect(firstMeeting.body).toContain('駅前でよく散歩の話');
  state = acceptStory(state, 'resident-12', 'shade', context({ day: 2, resident: 'resident-12' })).state;
  state = observeStory(state, 'sakura', context({ day: 2, place: 'plaza', resting: true })).state;
  state = completeStory(state, 'resident-12', context({ day: 2, resident: 'resident-12' })).state;
  const seaReply = storyReunion(state, 'resident-7', context({ day: 3, resident: 'resident-7' }));
  expect(seaReply).toContain('佐倉 あおい');
  expect(seaReply).toContain('木陰で、ひと息つく');
  expect(seaReply).toContain('公園で会うと立ち話をする仲');
  const sakuraReply = storyReunion(state, 'resident-12', context({ day: 3, resident: 'resident-12' }));
  expect(sakuraReply).toContain('高橋 はる'); expect(sakuraReply).toContain('遠くの海へ、目を向ける');
  expect(storyCards(state).find(card => card.id === 'sea')).toEqual(before);
});

test('an uncompleted conversation cannot become another person’s remembered report', () => {
  const initial = accepted('resident-1', 'near');
  const offer = storyOffer(initial, 'resident-0', context({ resident: 'resident-0' }))!;
  expect(offer.body).not.toContain('海野 はる');
  expect(offer.body).not.toContain('あなたから聞いた');
  const observed = observeStory(initial, 'sea', context({ place: 'beach' })).state;
  expect(storyOffer(observed, 'resident-0', context({ resident: 'resident-0' }))!.body).not.toContain('海野 はる');
  const completed = completeStory(observed, 'resident-1', context({ resident: 'resident-1' })).state;
  expect(storyOffer(completed, 'resident-0', context({ resident: 'resident-0' }))!.body).toContain('足もとの、小さな景色を見る');
});
