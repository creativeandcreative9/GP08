/** Local, versioned progress. No model data or browser objects are stored. */
import { newLife, readLife, type LifeState } from './calendar';
import { errandFor, SHOPS, validResident } from './errands';
import { newJourney, readJourney, type JourneyState } from './journey';
import { newPreferences, readPreferences, type PlayPreferences } from './preferences';
import { newStories, readStories, type StoryState } from './stories';
import { newExploration, readExploration, type ExplorationState } from './exploration';

// Keep the original key so version-1 saves migrate in place without losing progress.
export const SAVE_KEY = 'gp08.life.v1';
export const MAX_MONEY = 1_000_000;
export const ITEMS = {
  dango: { name: '三色だんご', price: 180, shop: 'e-wagashi', verb: '食べる', message: 'もちもちのだんご。桜を眺めるおやつにぴったり。' },
  tea: { name: '緑茶', price: 150, shop: 'e-wagashi', verb: '飲む', message: '温かいお茶で、ほっとひと息。' },
  onigiri: { name: 'おにぎり', price: 160, shop: 'w-conbini', verb: '食べる', message: '海苔の香りのおにぎり。次は海まで歩いてみよう。' },
  coffee: { name: '持ち帰りコーヒー', price: 320, shop: 'w-cafe', verb: '飲む', message: '香ばしいコーヒー。のんびり過ごす午後の味。' },
} as const;
export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export interface Progress {
  version: 3;
  life: LifeState;
  money: number;
  inventory: Record<ItemId, number>;
  greeted: string[];
  boughtDango: boolean;
  ateDango: boolean;
  rewarded: boolean;
  position: { x: number; z: number } | null;
  /** Destination, parcel and reward are derived from this ID, never trusted from saved text. */
  errand: { resident: string } | null;
  completedErrands: string[];
  journey: JourneyState;
  preferences: PlayPreferences;
  stories: StoryState;
  exploration: ExplorationState;
}

export const newProgress = (): Progress => ({
  version: 3, life: newLife(), money: 1200, inventory: { dango: 0, tea: 0, onigiri: 0, coffee: 0 },
  greeted: [], boughtDango: false, ateDango: false, rewarded: false, position: null,
  errand: null, completedErrands: [], journey: newJourney(), preferences: newPreferences(),
  stories: newStories(), exploration: newExploration(),
});

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;

/** Reject incompatible or corrupted saves instead of letting NaN/negative balances into the simulation. */
export function parseProgress(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!record(v) || (v.version !== 1 && v.version !== 2 && v.version !== 3) || !integer(v.money, MAX_MONEY) || !record(v.inventory)) return null;
    const inventory = v.inventory;
    if (!ITEM_IDS.every(id => integer(inventory[id], 99))) return null;
    if (!Array.isArray(v.greeted) || v.greeted.length > 2000 || !v.greeted.every(validResident)) return null;
    if (![v.boughtDango, v.ateDango, v.rewarded].every(b => typeof b === 'boolean')) return null;
    if ((v.ateDango && !v.boughtDango) || (v.rewarded && !(v.boughtDango && v.ateDango && v.greeted.length))) return null;
    if (v.position !== null && (!record(v.position) || !Number.isFinite(v.position.x) || !Number.isFinite(v.position.z)
      || Math.abs(v.position.x as number) > 10000 || Math.abs(v.position.z as number) > 10000)) return null;
    let errand: Progress['errand'] = null;
    let completedErrands: string[] = [];
    if (v.version === 2 || v.version === 3) {
      if (!Array.isArray(v.completedErrands) || v.completedErrands.length > 2000 || !v.completedErrands.every(validResident)) return null;
      completedErrands = [...new Set(v.completedErrands as string[])];
      if (!completedErrands.every(id => (v.greeted as string[]).includes(id))) return null;
      if (v.errand !== null) {
        if (!record(v.errand) || !validResident(v.errand.resident) || !(v.greeted as string[]).includes(v.errand.resident)
          || completedErrands.includes(v.errand.resident)) return null;
        errand = { resident: v.errand.resident };
      }
    }
    const life = v.version === 3 ? readLife(v.life) : newLife();
    const journey = readJourney(v.journey), preferences = readPreferences(v.preferences);
    if (!life || !journey || !preferences || journey.memories.some(m => m.day > life.day)) return null;
    const stories = readStories(v.stories, life.day, life.minute), exploration = readExploration(v.exploration, life.day, life.minute);
    if (!stories || !exploration || stories.arcs.some(arc => !(v.greeted as string[]).includes(arc.resident))) return null;
    return {
      version: 3, life, money: v.money, inventory: Object.fromEntries(ITEM_IDS.map(id => [id, inventory[id]])) as Progress['inventory'],
      greeted: [...new Set(v.greeted as string[])], boughtDango: v.boughtDango as boolean, ateDango: v.ateDango as boolean,
      rewarded: v.rewarded as boolean, position: v.position as Progress['position'],
      errand, completedErrands, journey, preferences, stories, exploration,
    };
  } catch { return null; }
}

export interface ActionResult { ok: boolean; message: string }

function reward(p: Progress): string {
  if (p.rewarded || !p.greeted.length || !p.boughtDango || !p.ateDango) return '';
  p.rewarded = true;
  const amount = Math.min(500, MAX_MONEY - p.money);
  p.money += amount;
  return ` 「はじめての街歩き」達成！ お祝いに${amount}円を受け取りました。${amount < 500 ? '（所持金の上限に達しました）' : ''}`;
}

export function greet(p: Progress, resident: string): ActionResult {
  if (!validResident(resident)) return { ok: false, message: '今は話しかけられません。' };
  if (!p.greeted.includes(resident)) p.greeted.push(resident);
  return { ok: true, message: reward(p) };
}

export function buy(p: Progress, id: ItemId, shop: string): ActionResult {
  const item = ITEMS[id];
  if (item.shop !== shop) return { ok: false, message: 'このお店では取り扱っていません。' };
  if (p.money < item.price) return { ok: false, message: 'お金が足りません。' };
  if (p.inventory[id] >= 99) return { ok: false, message: '持ち物がいっぱいです（同じ品は99個まで）。' };
  p.money -= item.price;
  p.inventory[id]++;
  if (id === 'dango') p.boughtDango = true;
  return { ok: true, message: `${item.name}を買いました。持ち物から${item.verb}ことができます。` };
}

export function consume(p: Progress, id: ItemId): ActionResult {
  if (p.inventory[id] <= 0) return { ok: false, message: '持ち物にありません。' };
  p.inventory[id]--;
  if (id === 'dango') p.ateDango = true;
  return { ok: true, message: ITEMS[id].message + reward(p) };
}

export function acceptErrand(p: Progress, resident: string): ActionResult {
  const offer = errandFor(resident);
  if (!offer || !p.greeted.includes(resident)) return { ok: false, message: 'まずは住人に話しかけてください。' };
  if (p.errand) return { ok: false, message: '引き受けられるおつかいは1件ずつです。今の依頼を終えるか、依頼帳から取りやめてください。' };
  if (p.completedErrands.includes(resident)) return { ok: false, message: 'この住人のおつかいは、もう届け終わっています。' };
  p.errand = { resident };
  return { ok: true, message: `${offer.parcel}を預かりました。${SHOPS[offer.shop].name}の店先で渡してください。立て替えは不要です。` };
}

export function deliverErrand(p: Progress, shop: string): ActionResult {
  const resident = p.errand?.resident;
  const offer = resident ? errandFor(resident) : undefined;
  if (!offer || !resident || p.completedErrands.includes(resident)) return { ok: false, message: '配達中の依頼はありません。' };
  if (offer.shop !== shop) return { ok: false, message: 'ここは配達先のお店ではありません。依頼帳で行き先を確認してください。' };
  if (p.money > MAX_MONEY - offer.reward) return { ok: false, message: '所持金が上限に近いため、まだ報酬を受け取れません。買い物をしてから渡してください。' };
  const relation = p.life.relations[resident];
  if (relation) relation.points = Math.min(100, relation.points + 4);
  p.completedErrands.push(resident);
  p.errand = null;
  p.money += offer.reward;
  return { ok: true, message: `${offer.parcel}を届けました。お礼に${offer.reward}円を受け取りました！` };
}

export function cancelErrand(p: Progress): ActionResult {
  if (!p.errand) return { ok: false, message: '配達中の依頼はありません。' };
  p.errand = null;
  return { ok: true, message: '依頼を取りやめました。預かり物は返却しました。また話しかければ引き受けられます。' };
}
