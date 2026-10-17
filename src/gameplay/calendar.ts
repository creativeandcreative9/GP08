import { validResident } from './errands';
import type { ActionResult, Progress } from './state';

export const WEATHERS = ['clear', 'cloudy', 'rain'] as const;
export type Weather = typeof WEATHERS[number];
export const WEATHER_NAMES: Record<Weather, string> = { clear: '晴れ', cloudy: 'くもり', rain: '雨' };
export interface LifeState {
  day: number;
  minute: number;
  weather: Weather;
  relations: Record<string, { points: number; greetedDay: number }>;
  collected: string[];
  petals: number;
  shells: number;
  festivalDay: number;
  sound: boolean;
  volume: number;
}
export const newLife = (): LifeState => ({ day: 1, minute: 14 * 60, weather: 'clear', relations: {}, collected: [], petals: 0, shells: 0, festivalDay: 0, sound: false, volume: .4 });
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && !!v && !Array.isArray(v);
const nat = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
export function readLife(v: unknown): LifeState | null {
  if (!obj(v) || !nat(v.day, 9999) || v.day < 1 || typeof v.minute !== 'number' || !Number.isFinite(v.minute) || v.minute < 0 || v.minute >= 1440
    || !WEATHERS.includes(v.weather as Weather) || !nat(v.petals, 9999) || !nat(v.shells, 9999) || !nat(v.festivalDay, v.day)
    || typeof v.sound !== 'boolean' || typeof v.volume !== 'number' || !Number.isFinite(v.volume) || v.volume < 0 || v.volume > 1
    || !obj(v.relations) || Object.keys(v.relations).length > 2000 || !Array.isArray(v.collected) || v.collected.length > 128
    || !v.collected.every(id => typeof id === 'string' && /^(petal|shell)-\d{1,2}$/.test(id))) return null;
  const relations: LifeState['relations'] = {};
  for (const [id, r] of Object.entries(v.relations)) {
    if (!validResident(id) || !obj(r) || !nat(r.points, 100) || !nat(r.greetedDay, v.day)) return null;
    relations[id] = { points: r.points, greetedDay: r.greetedDay };
  }
  return { day: v.day, minute: v.minute, weather: v.weather as Weather, relations, collected: [...new Set(v.collected as string[])], petals: v.petals, shells: v.shells, festivalDay: v.festivalDay, sound: v.sound, volume: v.volume };
}
export const festivalOpen = (l: LifeState): boolean => l.day % 3 === 1 && l.minute >= 9 * 60 && l.minute < 21 * 60;
export const clockText = (l: LifeState): string => `${l.day}日目 ${Math.floor(l.minute / 60).toString().padStart(2, '0')}:${Math.floor(l.minute % 60).toString().padStart(2, '0')} · ${WEATHER_NAMES[l.weather]}${festivalOpen(l) ? ' · 桜まつり' : ''}`;
export function nextDay(l: LifeState): void {
  l.day = Math.min(9999, l.day + 1); l.minute = 8 * 60; l.collected = [];
  l.weather = WEATHERS[(l.day * 7 + Math.floor(l.day / 3)) % 3]!;
}
/** After midnight, the next 08:00 is still today; the clock already renewed the day. */
export function restUntilMorning(l: LifeState): void {
  if (l.minute < 8 * 60) l.minute = 8 * 60;
  else nextDay(l);
}
/** One game day lasts 24 real minutes. Hidden tabs and dialogs do not advance it. */
export function advanceClock(l: LifeState, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  l.minute += Math.min(seconds, 60);
  if (l.minute >= 1440) { const overflow = l.minute - 1440; nextDay(l); l.minute = overflow; }
}
export function friendship(l: LifeState, id: string): string {
  const points = l.relations[id]?.points ?? 0;
  return points >= 20 ? '親しい友だち' : points >= 8 ? '顔なじみ' : points >= 3 ? '知り合い' : 'はじめまして';
}
export function dailyGreeting(l: LifeState, id: string): string {
  if (!validResident(id)) return '';
  const r = l.relations[id] ?? { points: 0, greetedDay: 0 };
  if (r.greetedDay === l.day) return `親しさ：${friendship(l, id)}。今日はもうあいさつしました。`;
  r.points = Math.min(100, r.points + 2); r.greetedDay = l.day; l.relations[id] = r;
  return `今日のあいさつで、少し仲良くなりました。親しさ：${friendship(l, id)}`;
}
export function schedule(minute: number, index: number): { activity: string; pace: number; outside: boolean } {
  const hour = minute / 60;
  if (hour < 6 || hour >= 22) return { activity: '家でおやすみ', pace: 0, outside: false };
  if (hour < 9) return { activity: index % 3 === 0 ? '朝のお散歩' : '通勤・通学', pace: 1.1, outside: true };
  if (hour < 12) return { activity: index % 2 ? 'お買い物' : '公園を散歩', pace: .85, outside: true };
  if (hour < 14) return { activity: 'お昼休み', pace: .4, outside: true };
  if (hour < 18) return { activity: index % 3 ? '午後のお散歩' : '街の用事', pace: 1, outside: true };
  return { activity: '帰り道', pace: .8, outside: true };
}
export function collect(l: LifeState, id: string): ActionResult {
  if (!/^(petal|shell)-\d{1,2}$/.test(id) || l.collected.includes(id)) return { ok: false, message: 'これはもう拾いました。また明日探してみよう。' };
  const kind = id.startsWith('petal') ? 'petals' : 'shells';
  if (l[kind] >= 9999) return { ok: false, message: '収集品がいっぱいです。' };
  l.collected.push(id); l[kind]++;
  return { ok: true, message: `${kind === 'petals' ? '桜の花びら' : '貝がら'}を拾いました。暮らしの手帳で確認できます。` };
}
export function festivalReward(p: Progress): ActionResult {
  const l = p.life;
  if (!festivalOpen(l)) return { ok: false, message: '桜まつりは1・4・7…日目の9時〜21時です。' };
  if (l.festivalDay === l.day) return { ok: false, message: '今日の記念品は受け取りました。また次の桜まつりで！' };
  const greeted = Object.values(l.relations).filter(r => r.greetedDay === l.day).length;
  if (l.petals < 3 || greeted < 3) return { ok: false, message: '花びら3枚と、今日のあいさつ3人で記念品を受け取れます。' };
  if (p.money > 999400 || p.inventory.tea >= 99) return { ok: false, message: '所持金か緑茶がいっぱいです。買い物やおやつで空きを作ってください。' };
  l.petals -= 3; p.money += 600; p.inventory.tea++; l.festivalDay = l.day;
  return { ok: true, message: '桜まつりのお手伝い、ありがとう！ 記念に600円と緑茶を受け取りました。' };
}
