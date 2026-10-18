import type { Weather } from './calendar';

/** These are existing, reachable map destinations; none requires waiting for a time or weather. */
export const EXPLORATION_PLACES = ['plaza', 'w-cafe', 'station', 'beach', 'summit', 'home'] as const;
export type ExplorationPlace = typeof EXPLORATION_PLACES[number];
export const EXPLORATION_THEMES = ['sakura', 'horizon', 'lights'] as const;
export type ExplorationTheme = typeof EXPLORATION_THEMES[number];
export interface ExplorationObservation { place: ExplorationPlace; day: number; minute: number; weather: Weather }
export interface ExplorationState {
  active: ExplorationTheme | null;
  favorite: ExplorationPlace | null;
  /** The first deliberate observation of each place. Repeat visits never overwrite it. */
  observations: ExplorationObservation[];
}
export interface ExplorationContext { place?: ExplorationPlace; day: number; minute: number; weather: Weather }
export interface ObservationCard {
  id: ExplorationPlace;
  destinationId: ExplorationPlace;
  name: string;
  title: string;
  body: string;
  hint: string;
  day: number;
  minute: number;
  weather: Weather;
  favorite: boolean;
}
export interface ExplorationStep {
  place: ExplorationPlace;
  destinationId: ExplorationPlace;
  name: string;
  title: string;
  hint: string;
  recorded: boolean;
}
export interface ExplorationThemeCard {
  id: ExplorationTheme;
  title: string;
  body: string;
  selected: boolean;
  progress: number;
  total: 3;
  complete: boolean;
  steps: ExplorationStep[];
  ending: string | null;
}
export interface ExplorationSuggestion { title: string; body: string; destinationId?: ExplorationPlace; complete: boolean }
export interface ObservationResult {
  state: ExplorationState;
  ok: boolean;
  message: string;
  discovery?: ObservationCard;
  completedThemes: ExplorationThemeCard[];
}

interface PlaceText { name: string; title: string; hint: string; answer: string; night: string; morning: string }
const PLACES: Record<ExplorationPlace, PlaceText> = {
  plaza: {
    name: '駅前公園', title: '桜の下の、余白',
    hint: '桜の下は、道の途中？ それとも誰かの居場所？ ベンチと通りの向きを、少し眺めてみよう。',
    answer: 'ベンチと通りが、桜の下でゆるく向き合っていた。通り過ぎる人にも、立ち止まる人にも、同じ木が場所をあけている。',
    night: '暗くなると、枝の向こうの灯りまで公園の景色に見えた。',
    morning: '朝の桜の下には、これから始まる一日ぶんの余白があった。',
  },
  'w-cafe': {
    name: '喫茶 はるいろ', title: '通りに向いた椅子',
    hint: '店先の椅子からは、何が見えるだろう。テラスと街路のあいだにある距離を見つけよう。',
    answer: 'テラスの椅子は、通りのすぐそばに置かれていた。ひと休みする時間も、誰かが歩いていく時間も、ここでは隣り合っている。',
    night: '夜の店先は、帰り道に見つけた小さな目印になった。',
    morning: '朝の店先を覚えておこう。今度は、散歩の途中でひと休みしたい。',
  },
  station: {
    name: '駅の入口', title: '出発と、ただいま',
    hint: '駅を、出発する場所ではなく帰ってくる場所として見たら？ 案内板から街のほうへ、視線を戻してみよう。',
    answer: '駅の入口で振り返ると、さっき歩いた街が続いていた。遠くへ行く入口が、いつか帰ってくる目印にもなる。',
    night: '夜の案内の灯りを見て、帰る場所がわかる安心を少し知った。',
    morning: '朝の駅から街へ。今日はどちらへ歩くか、自分で決めていい。',
  },
  beach: {
    name: '海辺の散歩道', title: '街の先の、ひろがり',
    hint: '建物が途切れた先で、見えるものはどう変わる？ 海辺から、空と水平線の境目を探してみよう。',
    answer: '街で見ていた空が、海の上ではずっと大きく見えた。何かを探していたはずなのに、しばらく遠くを眺めていたくなった。',
    night: '暗い海の向こうはよく見えない。それでも、目の前の空間が広いことはわかった。',
    morning: '朝の海辺で立ち止まった時間を、今日の最初の寄り道にした。',
  },
  summit: {
    name: '山頂の展望台', title: '道が、ひとつにつながる',
    hint: '歩いた通りは、上からどんな形に見えるだろう。展望台から、街と海を同じ景色の中に探してみよう。',
    answer: '近くでは別々だった街と海が、展望台からはひとつの景色になっていた。ここまでの道のりを、今度は目でたどってみた。',
    night: '夜は、明るい場所と暗い場所の並びが、街のもうひとつの地図になった。',
    morning: '朝の街を見下ろすと、まだ歩いていない道も今日の予定に入れたくなった。',
  },
  home: {
    name: '自宅', title: '帰り道の、最後の一歩',
    hint: 'この玄関を、散歩に出る前と同じ目で見ているだろうか。帰ってきた場所を、ひとつ記録しておこう。',
    answer: '玄関まで帰ってきた。初めはただの目的地だった家が、歩いた景色を思い返せる場所に変わっていた。',
    night: '夜の散歩は、ここで終わりにしてもいい。続きは、次の朝に残しておこう。',
    morning: '朝の玄関から出る道は、もう知らない街への道だけではなかった。',
  },
};
const THEMES: readonly { id: ExplorationTheme; title: string; body: string; places: readonly [ExplorationPlace, ExplorationPlace, ExplorationPlace]; ending: string }[] = [
  { id: 'sakura', title: '桜と街の、ひと休み', body: '公園、喫茶店、駅。立ち止まれる場所を探す、近所の散歩。好きな順で3つの景色を手帳に残そう。', places: ['plaza', 'w-cafe', 'station'],
    ending: '桜の下のベンチ、通りに向いた椅子、駅で振り返った街。急がなくてもいい場所を、三つ知った。次の散歩には、ひと休みする場所をもう探さなくていい。' },
  { id: 'horizon', title: '海と空を、つなぐ道', body: '駅から海辺へ、そして展望台へ。街の広がりを見つける散歩。順番は自由、坂の途中で別のテーマに寄り道しても大丈夫。', places: ['station', 'beach', 'summit'],
    ending: '入口から見た街、海辺から見た空、坂の上から見た道。その三つが、頭の中でひとつの地図になった。遠かった景色にも、歩いてきた道がちゃんとつながっている。' },
  { id: 'lights', title: '帰りたくなる街', body: '喫茶店、公園、自宅。帰り道の目印を見つける散歩。昼の景色でも完歩できます。夜なら、灯りの表情も眺めてみよう。', places: ['w-cafe', 'plaza', 'home'],
    ending: '店先を通り、桜の下に寄って、家まで帰った。帰る道にも、好きな景色があっていい。この街には、もうひとつ、自分で選んだ帰り道がある。' },
];
const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validDay = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 9999;
const validMinute = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1440;
const validPlace = (value: unknown): value is ExplorationPlace => EXPLORATION_PLACES.includes(value as ExplorationPlace);

export const newExploration = (): ExplorationState => ({ active: null, favorite: null, observations: [] });

/** Missing exploration migrates older saves; arbitrary narrative text is never trusted or loaded. */
export function readExploration(value: unknown, currentDay?: number, currentMinute?: number): ExplorationState | null {
  if (value === undefined) return newExploration();
  if (!record(value) || (value.active !== null && !EXPLORATION_THEMES.includes(value.active as ExplorationTheme))
    || (value.favorite !== null && !validPlace(value.favorite)) || !Array.isArray(value.observations)
    || value.observations.length > EXPLORATION_PLACES.length || (currentDay !== undefined && !validDay(currentDay))
    || (currentMinute !== undefined && !validMinute(currentMinute))) return null;
  const observations: ExplorationObservation[] = [];
  for (const entry of value.observations) {
    if (!record(entry) || !validPlace(entry.place) || !validDay(entry.day) || !validMinute(entry.minute)
      || !WEATHERS.includes(entry.weather as Weather) || (currentDay !== undefined && entry.day > currentDay)
      || (entry.day === currentDay && currentMinute !== undefined && entry.minute > currentMinute)
      || observations.some(observation => observation.place === entry.place)) return null;
    observations.push({ place: entry.place, day: entry.day, minute: entry.minute, weather: entry.weather as Weather });
  }
  if (value.favorite !== null && !observations.some(observation => observation.place === value.favorite)) return null;
  return { active: value.active as ExplorationTheme | null, favorite: value.favorite as ExplorationPlace | null, observations };
}

/** Theme changes preserve every discovery, and null is an unrestricted walk. */
export function chooseExploration(state: ExplorationState, theme: ExplorationTheme | null): ExplorationState {
  if (theme !== null && !EXPLORATION_THEMES.includes(theme)) return state;
  return state.active === theme ? state : { ...state, active: theme };
}

/** A favorite is a personally chosen, already discovered place; it never completes a theme. */
export function setFavorite(state: ExplorationState, place: ExplorationPlace | null): ExplorationState {
  if (place !== null && !state.observations.some(observation => observation.place === place)) return state;
  return state.favorite === place ? state : { ...state, favorite: place };
}

function observationCard(observation: ExplorationObservation, favorite: ExplorationPlace | null): ObservationCard {
  const text = PLACES[observation.place];
  const period = observation.minute < 360 || observation.minute >= 1200 ? text.night
    : observation.minute < 600 ? text.morning : observation.minute >= 1020 ? '夕方の色の中で、この場所を覚えておくことにした。' : 'この時間の景色を、自分で選んで手帳に残した。';
  const weather = observation.weather === 'rain' ? '雨の日の寄り道だった。晴れた日にまた来る楽しみも、ここに置いておこう。'
    : observation.weather === 'cloudy' ? 'くもり空の下で、景色の輪郭をゆっくり眺めた。' : '晴れた日の散歩の、ひとこまだ。';
  return { ...observation, id: observation.place, destinationId: observation.place, name: text.name, title: text.title,
    body: `${text.answer}${period}${weather}`, hint: text.hint, favorite: observation.place === favorite };
}

/** A fresh view of this place; looking again never writes or replaces the first postcard. */
export function presentObservation(place: ExplorationPlace, current: Omit<ExplorationContext, 'place'>): ObservationCard | null {
  if (!validPlace(place) || !validDay(current.day) || !validMinute(current.minute) || !WEATHERS.includes(current.weather)) return null;
  return observationCard({ place, day: current.day, minute: Math.floor(current.minute), weather: current.weather }, null);
}

/** Return records in the player's discovery order, using their original time and weather. */
export function observationCards(state: ExplorationState): ObservationCard[] {
  return state.observations.map(observation => observationCard(observation, state.favorite));
}

export function explorationThemes(state: ExplorationState): ExplorationThemeCard[] {
  return THEMES.map(theme => {
    const steps = theme.places.map(place => ({ place, destinationId: place, name: PLACES[place].name, title: PLACES[place].title,
      hint: PLACES[place].hint, recorded: state.observations.some(observation => observation.place === place) }));
    const progress = steps.filter(step => step.recorded).length, complete = progress === 3;
    return { id: theme.id, title: theme.title, body: theme.body, selected: state.active === theme.id,
      progress, total: 3, complete, steps, ending: complete ? theme.ending : null };
  });
}

export function explorationSuggestion(state: ExplorationState): ExplorationSuggestion | null {
  const theme = explorationThemes(state).find(theme => theme.selected);
  if (!theme) return null;
  const next = theme.steps.find(step => !step.recorded);
  return next ? { title: next.title, body: next.hint, destinationId: next.destinationId, complete: false }
    : { title: `${theme.title}を歩き終えて`, body: theme.ending!, complete: true };
}

/** Call only for the explicit observation action after verifying real place/height/proximity. */
export function recordObservation(state: ExplorationState, context: ExplorationContext): ObservationResult {
  if (!validPlace(context.place) || !validDay(context.day) || !validMinute(context.minute) || !WEATHERS.includes(context.weather)) {
    return { state, ok: false, message: '景色の場所まで近づいてから、もう一度手帳を開いてみよう。', completedThemes: [] };
  }
  if (state.observations.some(observation => observation.place === context.place)) {
    return { state, ok: false, message: 'この景色は、最初に見つけた日のまま手帳に残っています。好きな場所なら、お気に入りにもできます。', completedThemes: [] };
  }
  const observation: ExplorationObservation = { place: context.place, day: context.day, minute: Math.floor(context.minute), weather: context.weather };
  const next: ExplorationState = { ...state, observations: [...state.observations, observation] };
  const before = new Set(explorationThemes(state).filter(theme => theme.complete).map(theme => theme.id));
  const completedThemes = explorationThemes(next).filter(theme => theme.complete && !before.has(theme.id));
  const discovery = observationCard(observation, next.favorite);
  return { state: next, ok: true, message: `「${discovery.title}」を手帳に残しました。`, discovery, completedThemes };
}
