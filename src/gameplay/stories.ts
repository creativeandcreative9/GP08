import { WEATHER_NAMES, WEATHERS, type Weather } from './calendar';
import { residentName, validResident } from './errands';
import type { ItemId } from './state';

export const STORY_IDS = ['sakura', 'sea', 'station'] as const;
export type StoryId = typeof STORY_IDS[number];
export type StoryPlace = 'plaza' | 'beach' | 'station';
export type StoryStage = 'accepted' | 'observed' | 'completed';
export type StoryChoiceId = 'shade' | 'sky' | 'near' | 'far' | 'leave' | 'return';
export interface StoryChoice { id: StoryChoiceId; label: string; description: string }
export interface StoryObservation {
  place: StoryPlace;
  day: number;
  minute: number;
  weather: Weather;
  activity: 'rest' | 'watch' | 'listen';
  /** Optional detail from a successful consume event; never required or spent here. */
  snack?: ItemId;
}
export interface StoryArc {
  id: StoryId;
  /** The first person who shared this story. Other people cannot inherit it. */
  resident: string;
  stage: StoryStage;
  choice: StoryChoiceId;
  acceptedDay: number;
  acceptedMinute: number;
  observed?: StoryObservation;
  completedDay?: number;
  completedMinute?: number;
}
export interface StoryState { arcs: StoryArc[] }
export interface StoryContext {
  day: number;
  minute: number;
  weather: Weather;
  /** Set only for the resident actually in conversation/reach. */
  resident?: string;
  /** The controller verifies outdoor proximity and height before supplying this. */
  place?: StoryPlace;
  resting?: boolean;
  consumed?: ItemId;
}
export interface StoryOffer {
  id: StoryId;
  title: string;
  residentId: string;
  residentName: string;
  portraitLine: string;
  body: string;
  stage: 'offer' | StoryStage;
  /** Exactly two choices before acceptance; empty for all later stages. */
  choices: readonly StoryChoice[];
}
export interface StoryCard {
  id: StoryId;
  title: string;
  body: string;
  nextStep: string;
  stage: StoryStage;
  residentId: string;
  residentName: string;
  /** Present for the place visit; after it, guide to residentId's current position. */
  destinationId?: StoryPlace;
  actionLabel?: string;
  choiceLabel: string;
  observation?: string;
  ending?: string;
}
export interface StoryResult { state: StoryState; ok: boolean; message: string; card?: StoryCard }

interface Definition {
  id: StoryId;
  title: string;
  portraitLine: string;
  opening: string;
  place: StoryPlace;
  placeName: string;
  activity: StoryObservation['activity'];
  choices: readonly [StoryChoice, StoryChoice];
  actions: readonly [string, string];
  endings: readonly [string, string];
  reunions: readonly [string, string];
}
const DEFINITIONS: readonly Definition[] = [
  {
    id: 'sakura', title: '祖母のいた、桜の木陰', portraitLine: '休むのが少し苦手。祖母と座った公園の時間を覚えている。',
    opening: '祖母と花見をしたころは、ベンチで半日も過ごせたんです。今は、座ると用事を思い出してしまって。あの公園でゆっくりするなら、あなたはどこを見ますか？ 次に会ったとき、教えてもらえたら。',
    place: 'plaza', placeName: '駅前公園', activity: 'rest',
    choices: [
      { id: 'shade', label: '木陰で、ひと息つく', description: '公園のベンチに座って、近くの木陰に目を向ける。おやつはなくても大丈夫。' },
      { id: 'sky', label: '桜の向こうの空を見上げる', description: '公園のベンチに座って、枝の間の空を眺める。時間や天気はいつでも。' },
    ],
    actions: ['木陰でひと息つく', '座って桜越しの空を見る'],
    endings: [
      '木陰で休んだんですね。祖母も、桜の本数より隣に座る時間を大切にしていたのかもしれない。私も今度は、用事のない時間を持っていこうと思います。',
      '桜の向こうの空、ですか。私は花ばかり見ようとしていたなあ。全部を見なくてもいいと思うと、少し楽になります。祖母にも、その見方を話してみたかった。',
    ],
    reunions: ['あの木陰の話を思い出すと、急がない日があってもいいと思えるんです。', 'このごろ桜を見ると、その向こうの空にも目が向くようになりました。あなたの話のおかげですね。'],
  },
  {
    id: 'sea', title: 'ここにいる足と、遠くを見る目', portraitLine: '海の近くで育った。知らない場所への憧れと、この街への愛着がある。',
    opening: 'ずっとこの海の近くで暮らしてきました。遠くへ行ってみたい日も、ここにいたい日もあって。どちらかを選ばなきゃ、と考えていたんです。あなたなら、海辺で何に目を向けますか？',
    place: 'beach', placeName: '海辺の散歩道', activity: 'watch',
    choices: [
      { id: 'near', label: '足もとの、小さな景色を見る', description: '海辺で立ち止まり、今いる場所の景色を確かめる。拾い物は必要ありません。' },
      { id: 'far', label: '遠くの海へ、目を向ける', description: '海辺まで歩いて、水平線のある方角を眺める。晴れるのを待つ必要はありません。' },
    ],
    actions: ['足もとの景色をよく見る', '水平線に目を向ける'],
    endings: [
      '足もとの景色、見てきてくれたんですね。ここにいることも、自分で選べるんだな。動かない日は、何もしていない日だと思い込んでいました。',
      '遠くを見てきたんですね。遠くに憧れることは、この街を嫌いになることじゃない。行きたい場所と帰りたい場所が、両方あってもいいんですね。',
    ],
    reunions: ['今日は足もとの景色も見ながら歩いています。ここを選ぶ、という考え方が気に入ったんです。', '遠くの話をしたあの日から、ここを帰る場所として眺めることも増えました。'],
  },
  {
    id: 'station', title: '同じ駅から、違う一日へ', portraitLine: '駅前を通るのが日課。同じ場所を行き来する人の時間に関心がある。',
    opening: '駅の前を通るのが日課なんです。同じ場所なのに、出かける朝と帰る夕方では感じ方が違って。駅で少し立ち止まったら、あなたはどちらの時間を思うでしょう。音が聞けなくても、行き来する景色を眺めるだけでいいんです。',
    place: 'station', placeName: '駅の入口', activity: 'listen',
    choices: [
      { id: 'leave', label: 'これから出かける人を思う', description: '駅前で立ち止まり、出発を思いながら耳を澄ます。列車を待つ必要はありません。' },
      { id: 'return', label: 'この街へ帰る人を思う', description: '駅前で立ち止まり、帰り道を思いながら耳を澄ます。音をオフにしたままでも楽しめます。' },
    ],
    actions: ['出発を思いながら耳を澄ます', '帰り道を思いながら耳を澄ます'],
    endings: [
      '出かける人のことを思ったんですね。私には、出発は何かが遠ざかる時間に見えていました。でも、誰かの一日が始まる時間でもあるんだ。明日はそんなふうに見送ってみます。',
      '帰る人のことを思ったんですね。いつもの駅が「おかえり」の場所になる。その言い方、好きです。ここを通る自分にも、そう声をかけられそうな気がします。',
    ],
    reunions: ['同じ駅でも、誰かの始まりだと思うと、通り過ぎるだけにはできなくなりました。', '駅前を通るたびに、「おかえり」の話を思い出すんです。いつもの道が少し温かくなりました。'],
  },
];
const SNACKS: Readonly<Record<ItemId, string>> = { dango: '三色だんご', tea: '緑茶', onigiri: 'おにぎり', coffee: 'コーヒー' };
const definition = (id: StoryId): Definition => DEFINITIONS.find(value => value.id === id)!;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dayValid = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 9999;
const minuteValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1440;
const snackValid = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(SNACKS, v);
const atOrAfter = (day: number, minute: number, previousDay: number, previousMinute: number): boolean => day > previousDay || day === previousDay && minute >= previousMinute;
const contextValid = (context: StoryContext): boolean => dayValid(context.day) && minuteValid(context.minute) && WEATHERS.includes(context.weather);
export const newStories = (): StoryState => ({ arcs: [] });

/** This mapping chooses an unclaimed story; acceptance permanently pins its actual speaker. */
export function storyForResident(resident: string): StoryId | undefined {
  return validResident(resident) ? STORY_IDS[Number(resident.slice('resident-'.length)) % STORY_IDS.length] : undefined;
}

/** No saved text is trusted. Missing data migrates old saves without inventing prior stories. */
export function readStories(value: unknown, currentDay = 9999, currentMinute = 1439.999999): StoryState | null {
  if (!dayValid(currentDay) || !minuteValid(currentMinute)) return null;
  if (value === undefined) return newStories();
  if (!record(value) || !Array.isArray(value.arcs) || value.arcs.length > STORY_IDS.length) return null;
  const arcs: StoryArc[] = [];
  const withinNow = (day: number, minute: number): boolean => atOrAfter(currentDay, currentMinute, day, minute);
  for (const v of value.arcs) {
    if (!record(v) || !STORY_IDS.includes(v.id as StoryId) || !validResident(v.resident) || storyForResident(v.resident) !== v.id
      || arcs.some(arc => arc.id === v.id || arc.resident === v.resident)
      || !dayValid(v.acceptedDay) || !minuteValid(v.acceptedMinute) || !withinNow(v.acceptedDay, v.acceptedMinute)
      || !['accepted', 'observed', 'completed'].includes(v.stage as string)) return null;
    const spec = definition(v.id as StoryId);
    if (!spec.choices.some(choice => choice.id === v.choice)) return null;
    const arc: StoryArc = { id: spec.id, resident: v.resident, stage: v.stage as StoryStage, choice: v.choice as StoryChoiceId, acceptedDay: v.acceptedDay, acceptedMinute: v.acceptedMinute };
    if (v.stage === 'accepted') {
      if (v.observed !== undefined || v.completedDay !== undefined || v.completedMinute !== undefined) return null;
    } else {
      const observed = v.observed;
      if (!record(observed) || observed.place !== spec.place || observed.activity !== spec.activity
        || !dayValid(observed.day) || !minuteValid(observed.minute) || !WEATHERS.includes(observed.weather as Weather)
        || !atOrAfter(observed.day, observed.minute, arc.acceptedDay, arc.acceptedMinute) || !withinNow(observed.day, observed.minute)
        || (observed.snack !== undefined && (!snackValid(observed.snack) || spec.id !== 'sakura'))) return null;
      arc.observed = { place: spec.place, day: observed.day, minute: observed.minute, weather: observed.weather as Weather, activity: spec.activity,
        ...(observed.snack !== undefined ? { snack: observed.snack as ItemId } : {}) };
      if (v.stage === 'observed') {
        if (v.completedDay !== undefined || v.completedMinute !== undefined) return null;
      } else {
        if (!dayValid(v.completedDay) || !minuteValid(v.completedMinute)
          || !atOrAfter(v.completedDay, v.completedMinute, observed.day, observed.minute) || !withinNow(v.completedDay, v.completedMinute)) return null;
        arc.completedDay = v.completedDay; arc.completedMinute = v.completedMinute;
      }
    }
    arcs.push(arc);
  }
  return { arcs };
}

function choiceIndex(arc: StoryArc): 0 | 1 { return definition(arc.id).choices[0].id === arc.choice ? 0 : 1; }
function observationText(arc: StoryArc): string | undefined {
  const observed = arc.observed;
  if (!observed) return undefined;
  const spec = definition(arc.id), hour = Math.floor(observed.minute / 60), minute = Math.floor(observed.minute % 60);
  const when = `${observed.day}日目 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}・${WEATHER_NAMES[observed.weather]}`;
  const scene = arc.id === 'sakura' ? arc.choice === 'shade' ? 'ベンチに座り、近くの木陰に目を向けた。' : 'ベンチに座り、桜の枝の間から空を見上げた。'
    : arc.id === 'sea' ? arc.choice === 'near' ? '海に近い足もとの景色を、立ち止まって眺めた。' : '水平線のある方角に目を向け、遠くの海を思った。'
      : arc.choice === 'leave' ? '駅前で立ち止まり、出発する人の時間を思いながら耳を澄ませた。' : '駅前で立ち止まり、この街へ帰る人の時間を思いながら耳を澄ませた。';
  return `${when}、${spec.placeName}で。${scene}${observed.snack ? `そばには、楽しんだ${SNACKS[observed.snack]}の記憶も。` : ''}`;
}

function connection(state: StoryState, id: StoryId): string {
  const completed = (other: StoryId): StoryArc | undefined => state.arcs.find(arc => arc.id === other && arc.stage === 'completed');
  const describe = (arc: StoryArc): string => `「${definition(arc.id).choices[choiceIndex(arc)].label}」という話を、あなたから聞いたと言っていました。`;
  const sea = completed('sea'), sakura = completed('sakura'), station = completed('station');
  if (id === 'sakura' && sea) return ` ${residentName(sea.resident)}さんとは、駅前でよく散歩の話をするんです。${describe(sea)}${sea.choice === 'near'
    ? '近くの景色を選ぶ、というのがいいですね。私も木陰ひとつ分の場所から、ゆっくり見直してみたい。'
    : '遠くに憧れても、帰りたい場所を持っていていい。私にとっては、あの公園のベンチがそんな場所なのかもしれません。'}`;
  if (id === 'sea' && sakura) return ` ${residentName(sakura.resident)}さんとは、公園で会うと立ち話をする仲なんです。${describe(sakura)}${sakura.choice === 'shade'
    ? 'あの人が休む時間を大事にできたら、うれしいな。私も海辺で立ち止まることを、ためらわずにいたいです。'
    : 'いつもの桜の向こうにも、空は続いているんですね。この街にいながら遠くを思ってもいい、と感じました。'}`;
  if (id === 'station' && sakura) return ` ${residentName(sakura.resident)}さんは、駅前で会うと公園の話を聞かせてくれるんです。${describe(sakura)}${sakura.choice === 'shade'
    ? '公園のベンチみたいに、駅にも急がず待てる時間があっていいんですね。'
    : 'ひとつの場所を、別の見方で眺める。駅の景色にも、まだ気づいていない面がありそうです。'}`;
  if (id === 'sea' && station) return ` ${residentName(station.resident)}さんとは、駅からの帰り道で顔を合わせます。${describe(station)}${station.choice === 'return'
    ? '帰る人の時間を思うと、海辺へ戻ってくる道も大切にしたくなりますね。'
    : '誰かの出発を、始まりとして見送る。その考え方なら、遠くへの憧れも素直に話せそうです。'}`;
  if (id === 'station' && sea) return ` ${residentName(sea.resident)}さんとは、駅前で海の話をすることがあるんです。${describe(sea)}${sea.choice === 'near'
    ? '足もとの景色も選べるなら、いつもの駅を通る今日も、自分で選んだ一日にできますね。'
    : '行きたい場所と帰りたい場所が両方ある。出発と帰宅を見ているこの駅に、ぴったりの話だと思いました。'}`;
  return '';
}

function keepsake(id: StoryId, remembered = false): string {
  if (id === 'sakura') return remembered ? ' 公園の案内札に添えた小さな花も、よかったら見ていってください。'
    : ' 公園の案内札に、小さな花を置いておきますね。あの時間を思い出す目印に。';
  if (id === 'sea') return remembered ? ' 海の案内札に添えた貝、また散歩の途中で見ていってください。'
    : ' 海の案内札に、貝を少し添えておきますね。あの話の小さな目印です。';
  return '';
}

/** Returns only accepted stories; unclaimed ones remain invitations in actual conversations. */
export function storyCards(state: StoryState): StoryCard[] {
  return state.arcs.map(arc => {
    const spec = definition(arc.id), index = choiceIndex(arc), choice = spec.choices[index];
    const name = residentName(arc.resident), observation = observationText(arc);
    // The dated ending is historical. Later friendships belong in today's conversation,
    // never backdated into an already completed journal entry.
    const ending = arc.stage === 'completed' ? `${name}「${spec.endings[index]}${keepsake(arc.id)}」` : undefined;
    const nextStep = arc.stage === 'accepted'
      ? `${spec.placeName}で${arc.id === 'sakura' ? 'ベンチに座り、' : '立ち止まり、'}「${spec.actions[index]}」を選ぶ。`
      : arc.stage === 'observed' ? `${name}本人にもう一度話しかけて、見つけた時間を伝えよう。急がなくて大丈夫。`
        : 'また会ったら、あの日の話の続きを。好きなときに読み返せます。';
    return { id: arc.id, title: spec.title, body: arc.stage === 'accepted' ? `${name}から聞いた話。${choice.description}` : ending ?? observation!,
      nextStep, stage: arc.stage, residentId: arc.resident, residentName: name, choiceLabel: choice.label,
      ...(arc.stage === 'accepted' ? { destinationId: spec.place, actionLabel: spec.actions[index] } : {}),
      ...(observation ? { observation } : {}), ...(ending ? { ending } : {}) };
  });
}

/** Later conversations recall this person's actual completed branch, never another resident's. */
export function storyReunion(state: StoryState, resident: string, context: StoryContext): string {
  if (!contextValid(context) || context.resident !== resident) return '';
  const arc = state.arcs.find(entry => entry.resident === resident && entry.stage === 'completed');
  if (!arc || !atOrAfter(context.day, context.minute, arc.completedDay!, arc.completedMinute!)) return '';
  const spec = definition(arc.id);
  const greeting = context.day > arc.completedDay! ? 'また会えましたね。' : '話を聞かせてくれて、ありがとう。';
  return `${greeting}${spec.reunions[choiceIndex(arc)]}${keepsake(arc.id, true)}${connection(state, arc.id)}`;
}

/** A physical conversation is the only place to start or finish a resident's story. */
export function storyOffer(state: StoryState, resident: string, context: StoryContext): StoryOffer | null {
  const id = storyForResident(resident);
  if (!id || !contextValid(context) || context.resident !== resident) return null;
  const arc = state.arcs.find(entry => entry.id === id);
  if (arc && arc.resident !== resident) return null;
  const spec = definition(id), card = arc ? storyCards(state).find(entry => entry.id === id)! : undefined;
  return { id, title: spec.title, residentId: resident, residentName: residentName(resident), portraitLine: spec.portraitLine,
    body: !arc ? `${spec.opening}${connection(state, id)}` : arc.stage === 'completed' ? storyReunion(state, resident, context)
      : arc.stage === 'observed' ? `おかえりなさい。${spec.placeName}で過ごした時間、聞かせてもらえますか。` : `この前は「${card!.choiceLabel}」と話してくれましたね。${card!.nextStep}`,
    stage: arc?.stage ?? 'offer', choices: arc ? [] : spec.choices.map(choice => ({ ...choice })) };
}

const failure = (state: StoryState, message: string): StoryResult => ({ state, ok: false, message });
function changed(state: StoryState, arc: StoryArc, message: string): StoryResult {
  const next = { arcs: state.arcs.some(entry => entry.id === arc.id) ? state.arcs.map(entry => entry.id === arc.id ? arc : entry) : [...state.arcs, arc] };
  return { state: next, ok: true, message, card: storyCards(next).find(card => card.id === arc.id)! };
}

/** Two equally valid, free choices. Closing the offer leaves all progress untouched. */
export function acceptStory(state: StoryState, resident: string, choiceId: string, context: StoryContext): StoryResult {
  const offer = storyOffer(state, resident, context);
  if (!offer) return failure(state, 'この話は、最初に話した住人との会話で続けられます。');
  if (offer.stage !== 'offer') return failure(state, 'この話は手帳に残っています。好きなときに続きからどうぞ。');
  const choice = offer.choices.find(entry => entry.id === choiceId);
  if (!choice) return failure(state, '気になる過ごし方を、ふたつの中から選んでください。');
  return changed(state, { id: offer.id, resident, stage: 'accepted', choice: choice.id, acceptedDay: context.day, acceptedMinute: Math.floor(context.minute) },
    `「${choice.label}」を手帳に残しました。${offer.residentName}との話は、いつでも続けられます。`);
}

/** Call only for an explicit pause/look/listen action at the real place, never automatic polling. */
export function observeStory(state: StoryState, id: StoryId, context: StoryContext): StoryResult {
  const arc = state.arcs.find(entry => entry.id === id);
  if (!arc || !contextValid(context)) return failure(state, 'まず住人から、この場所にまつわる話を聞いてみよう。');
  if (arc.stage !== 'accepted') return failure(state, 'この場所で過ごした時間は、もう手帳に残っています。');
  const spec = definition(id);
  if (context.place !== spec.place) return failure(state, `${spec.placeName}まで近づいてから、ゆっくり確かめてみよう。`);
  if (id === 'sakura' && context.resting !== true) return failure(state, '公園のベンチに座ってから、この時間を楽しんでみよう。おやつはなくても大丈夫。');
  if (!atOrAfter(context.day, context.minute, arc.acceptedDay, arc.acceptedMinute)) return failure(state, '記録の時刻を確かめてから、もう一度試してください。');
  const observed: StoryObservation = { place: spec.place, activity: spec.activity, day: context.day, minute: Math.floor(context.minute), weather: context.weather,
    ...(id === 'sakura' && snackValid(context.consumed) ? { snack: context.consumed } : {}) };
  const next = { ...arc, stage: 'observed' as const, observed };
  return changed(state, next, `${observationText(next)} ${residentName(arc.resident)}に会ったら、この時間を伝えてみよう。`);
}

/** Returning to the actual original resident closes the selected branch without a reward loop. */
export function completeStory(state: StoryState, resident: string, context: StoryContext): StoryResult {
  const arc = state.arcs.find(entry => entry.resident === resident);
  if (!arc || !contextValid(context) || context.resident !== resident) return failure(state, 'この話を最初に聞いた住人に、もう一度話しかけてください。');
  if (arc.stage === 'completed') return failure(state, storyReunion(state, resident, context));
  if (arc.stage !== 'observed') return failure(state, storyCards(state).find(card => card.id === arc.id)!.nextStep);
  if (!atOrAfter(context.day, context.minute, arc.observed!.day, arc.observed!.minute)) return failure(state, '記録の時刻を確かめてから、もう一度話してみてください。');
  const next = { ...arc, stage: 'completed' as const, completedDay: context.day, completedMinute: Math.floor(context.minute) };
  const result = changed(state, next, '');
  result.message = result.card!.ending!;
  return result;
}
