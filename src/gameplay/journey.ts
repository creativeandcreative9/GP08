import type { LifeState } from './calendar';
import { errandFor, SHOPS, validResident } from './errands';
import type { ItemId, Progress } from './state';

/** Optional memories of things the player actually did; there are no streaks or deadlines. */
export const JOURNEY_IDS = ['hello', 'kindness', 'picnic', 'sea', 'summit', 'tomorrow', 'festival'] as const;
export type JourneyId = typeof JOURNEY_IDS[number];
export interface JourneyMemory { id: JourneyId; day: number; minute: number }
export interface JourneyState { memories: JourneyMemory[] }
export interface JourneyCard {
  id: JourneyId;
  title: string;
  body: string;
  hint: string;
  destinationId?: string;
  unlocked: boolean;
  day?: number;
  minute?: number;
}
export interface JourneySuggestion { title: string; body: string; destinationId?: string }
export interface JourneyContext {
  life: Pick<LifeState, 'day' | 'minute' | 'relations' | 'shells' | 'festivalDay'>;
  greeted: readonly string[];
  completedErrands: readonly string[];
  /** Set only after checking real proximity/height. Indoor shops are not the plaza. */
  place?: 'plaza' | 'beach' | 'summit' | 'home';
  resting?: boolean;
  /** One successful consume event, not a lifetime ateDango flag. */
  consumed?: ItemId;
  /** One successful home sleep event, after advancing to the next morning. */
  sleptAtHome?: boolean;
  inventory?: Partial<Readonly<Record<ItemId, number>>>;
}

type CardText = Omit<JourneyCard, 'unlocked' | 'day' | 'minute'>;
const CARDS: readonly CardText[] = [
  { id: 'hello', title: 'この街で、最初の声', body: '知らない街で交わした、最初のあいさつ。通りの向こうに、声をかけられる人がひとりできた。', hint: '近くの住人に話しかけてみよう。短いあいさつからで大丈夫。', destinationId: 'plaza' },
  { id: 'kindness', title: '小さな「ありがとう」', body: '預かったものを届けた。いつもの店先に、誰かの暮らしがつながっていた。', hint: '住人の小さなおつかいをひとつ届けてみよう。立て替えは必要ありません。', destinationId: 'plaza' },
  { id: 'picnic', title: '桜の下の、ひと口', body: '公園のベンチで、おやつを楽しんだ。何もしない時間も、この街で過ごした一日になった。', hint: 'おやつを持って公園のベンチへ。座ってから持ち物を開いて、ひと口。', destinationId: 'plaza' },
  { id: 'sea', title: 'ポケットの小さな海', body: '海辺で拾った貝がらを、持ち帰ることにした。見つけた場所の景色まで、一緒に残しておこう。', hint: '海の景色を、ポケットに持ち帰るなら？ 海辺を歩いて、砂浜の貝がらをひとつ拾ってみよう。', destinationId: 'beach' },
  { id: 'summit', title: '歩いた道が、景色になる', body: '坂道の先の展望台に着いた。街と海を見渡すと、ここまで歩いてきた道も景色の一部になった。', hint: 'いつもの街は、坂の上からどう見えるだろう。山頂の展望台まで、寄り道しながら登ってみよう。', destinationId: 'summit' },
  { id: 'tomorrow', title: 'また、ここで朝を迎える', body: '家で眠り、新しい朝を迎えた。昨日歩いた道を、今日はもう知っている。', hint: '自宅に入り、ベッドで眠って翌朝へ。おつかいや持ち物はそのまま続きます。', destinationId: 'home' },
  { id: 'festival', title: '花の季節を、一緒に', body: '桜まつりで、集めた花びらを渡した。あいさつした人たちと過ごす、街の春がひとつ残った。', hint: '桜まつりの日、公園の受付へ。花びら3枚と今日のあいさつ3人で記念品を受け取れます。', destinationId: 'plaza' },
];
const ITEMS: readonly ItemId[] = ['dango', 'tea', 'onigiri', 'coffee'];
export const newJourney = (): JourneyState => ({ memories: [] });
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dayValid = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 9999;
const minuteValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1440;

/** Missing data migrates old saves. Invalid data never becomes free achievements. */
export function readJourney(v: unknown): JourneyState | null {
  if (v === undefined) return newJourney();
  if (!record(v) || !Array.isArray(v.memories) || v.memories.length > JOURNEY_IDS.length) return null;
  const memories: JourneyMemory[] = [];
  for (const entry of v.memories) {
    if (!record(entry) || !JOURNEY_IDS.includes(entry.id as JourneyId) || !dayValid(entry.day) || !minuteValid(entry.minute)
      || memories.some(memory => memory.id === entry.id)) return null;
    memories.push({ id: entry.id as JourneyId, day: entry.day, minute: entry.minute });
  }
  return { memories };
}

export function journeyCards(state: JourneyState): JourneyCard[] {
  return CARDS.map(card => {
    const memory = state.memories.find(entry => entry.id === card.id);
    return { ...card, body: memory ? card.body : card.hint, unlocked: !!memory, ...(memory ? { day: memory.day, minute: memory.minute } : {}) };
  });
}

/** A quiet ending to the first album; the town remains open for unhurried play. */
export function journeyCompletion(state: JourneyState): JourneySuggestion | null {
  if (!JOURNEY_IDS.every(id => state.memories.some(memory => memory.id === id))) return null;
  return {
    title: 'この街が、少し自分の街になった',
    body: '交わした声、桜の下のひと口、ポケットの貝がら。歩いてきた七つの思い出が、一冊に残りました。この先は、好きな景色に会いにいこう。急いで終わらせる予定は、もうありません。',
    destinationId: 'plaza',
  };
}

/** Pure: polling is safe and never consumes an item, awards money, or changes the supplied save. */
export function observeJourney(state: JourneyState, context: JourneyContext): { state: JourneyState; unlocked: JourneyCard[] } {
  const { life } = context;
  if (!dayValid(life.day) || !minuteValid(life.minute)) return { state, unlocked: [] };
  const earned: Record<JourneyId, boolean> = {
    hello: context.greeted.some(validResident),
    kindness: context.completedErrands.some(id => validResident(id) && context.greeted.includes(id)),
    picnic: context.place === 'plaza' && context.resting === true && context.consumed !== undefined && ITEMS.includes(context.consumed),
    sea: context.place === 'beach' && Number.isSafeInteger(life.shells) && life.shells > 0,
    summit: context.place === 'summit',
    tomorrow: context.place === 'home' && context.sleptAtHome === true && life.minute === 480,
    festival: Number.isSafeInteger(life.festivalDay) && life.festivalDay > 0 && life.festivalDay <= life.day && life.festivalDay % 3 === 1,
  };
  const additions = JOURNEY_IDS.filter(id => earned[id] && !state.memories.some(memory => memory.id === id))
    .map(id => ({ id, day: life.day, minute: Math.floor(life.minute) }));
  if (!additions.length) return { state, unlocked: [] };
  const next = { memories: [...state.memories, ...additions] };
  return { state: next, unlocked: journeyCards(next).filter(card => additions.some(memory => memory.id === card.id)) };
}

/** Suggestions are invitations. Memories can be discovered in any order and are never lost. */
export function nextJourneySuggestion(state: JourneyState, context: JourneyContext): JourneySuggestion {
  if (context.life.minute >= 18 * 60 || context.life.minute < 6 * 60) return {
    title: '今夜は、家の灯りへ', body: '自宅に入ってベッドで眠ると、次の朝8時になります。夜の散歩を続けても、持ち物やおつかいはなくなりません。', destinationId: 'home',
  };
  const available = journeyCards(state).filter(card => !card.unlocked);
  // The optional festival waits for its next opening instead of blocking the rest of the book.
  const next = available.find(card => card.id !== 'festival'
    || (context.life.day % 3 === 1 && context.life.minute >= 540 && context.life.minute < 1260));
  if (!next) return {
    title: '今日は、どこへ行こう', body: '知っている道も、天気や時間で少しずつ違います。好きな場所へ、予定のない散歩に出かけよう。', destinationId: 'plaza',
  };
  if (next.id === 'picnic' && context.inventory && !ITEMS.some(id => (context.inventory?.[id] ?? 0) > 0)) return {
    title: '桜の下に、おやつをひとつ', body: '和菓子屋でおやつを買ったら、公園のベンチへ。座ってから持ち物を開くと、お花見を楽しめます。', destinationId: 'e-wagashi',
  };
  return { title: next.title, body: next.hint, destinationId: next.destinationId };
}

/** A resident remembers only their own delivered parcel and recorded relationship. */
export function residentReply(id: string, p: Pick<Progress, 'life' | 'greeted' | 'completedErrands' | 'errand'>): string {
  if (!validResident(id)) return '';
  const n = Number(id.slice('resident-'.length));
  const relationship = p.life.relations[id];
  if (p.completedErrands.includes(id)) {
    const offer = errandFor(id)!;
    return `この前は${SHOPS[offer.shop].name}に${offer.parcel}を届けてくれて、ありがとう。${[
      'あのあと、安心してお茶にできました。また顔を見られてうれしいです。',
      '小さな用事でも、ひとりで抱えなくていいのは心強いですね。今日はゆっくりしていって。',
      'おかげで、いつもの一日が少し助かりました。今度は何もなくても声をかけてね。',
    ][n % 3]}`;
  }
  if (p.errand?.resident === id) return '預かってくれてありがとう。急ぎではないから、寄り道しながらで大丈夫ですよ。';
  if (relationship && relationship.points >= 8) return [
    'また会えましたね。こうして顔を合わせる人がいると、この道を歩くのが楽しみになるんです。',
    'こんにちは。今日はどちらまで？ あなたの見つけた好きな場所も、いつか聞いてみたいな。',
    'あなたの顔を見つけると、つい足を止めてしまいます。今日は、のんびりお話ししましょう。',
  ][n % 3]!;
  if (relationship && relationship.greetedDay > 0 && relationship.greetedDay < p.life.day) return [
    'この前、道でお会いしましたね。覚えていますよ。今日もよい散歩になりますように。',
    'おかえりなさい。またこの道で会えましたね。少しずつ街に慣れてきましたか？',
    'またあいさつできてうれしいです。少しお話ししてから、散歩の続きを楽しんでいってね。',
  ][n % 3]!;
  if (p.life.minute >= 1080 || p.life.minute < 360) return '日が暮れたら、自宅で眠って翌朝にできますよ。地図から自宅を選べば帰り道もわかります。';
  if (p.life.weather === 'rain') return '雨の日は、お店でひと休みするのもいいですね。濡れた道の色が少し好きなんです。';
  return p.greeted.includes(id) ? 'また会いましたね。急ぐ用事がなければ、桜の下でひと休みしていきませんか。' : '';
}
