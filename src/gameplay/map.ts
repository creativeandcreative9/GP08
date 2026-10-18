import type { Town } from '../town/build';
import { mapToWorld, PX, type WorldXZ } from '../town/layout';
import { BEACH_WIDTH, coastZ } from '../town/heights';
import { blocked, inReach, type Contact } from './world';
import { validResident } from './errands';

export interface MapPlace extends WorldXZ {
  id: string;
  name: string;
  y: number;
  kind: 'shop' | 'landmark';
}

/** Inverse of the town layout transform; north stays at the top of the map. */
export function worldToMap(p: WorldXZ): { x: number; y: number } {
  const origin = mapToWorld(0, 0);
  return { x: (p.x - origin.x) / PX, y: (origin.z - p.z) / PX };
}

/** Shop markers use their actual service points, rather than the original lot centres. */
export function mapPlaces(town: Town, shops: readonly Contact[]): MapPlace[] {
  const places: MapPlace[] = shops.map(shop => ({ ...shop, kind: 'shop' }));
  const beachX = mapToWorld(500, 0).x;
  const landmarks = [
    { id: 'station', name: '駅の入口', x: 0, z: 600 },
    { id: 'plaza', name: '駅前公園', x: 0, z: 180 },
    { id: 'beach', name: '海辺の散歩道', x: beachX, z: coastZ(beachX) - BEACH_WIDTH * 0.8 },
    { id: 'summit', name: '山頂の展望台', ...town.summitDeck },
  ];
  for (const p of landmarks) {
    if (!blocked(p.x, p.z, town.obstacles)) {
      places.push({ ...p, y: 'y' in p ? p.y : town.heightAt(p.x, p.z), kind: 'landmark' });
    }
  }
  return places;
}

export function navigationText(player: WorldXZ & { y: number }, target: MapPlace, town: Pick<Town, 'obstacles'>): string {
  const distance = Math.hypot(target.x - player.x, target.z - player.z);
  const resident = validResident(target.id);
  const arrived = target.kind === 'shop' || target.id === 'home' || resident
    ? inReach(player, { ...target, kind: resident ? 'resident' : target.id === 'home' ? 'home' : 'shop', line: '' }, town.obstacles)
    : distance < 55 && Math.abs(target.y - player.y) < 16;
  if (arrived && target.id === 'home') return '自宅に到着。入口で E または画面のボタンから入り、朝まで休めます。';
  if (arrived && resident) return `${target.name}が近くにいます。E または画面のボタンで話しかけよう。`;
  if (arrived) return target.kind === 'shop'
    ? `${target.name}の店先に到着。E キーで買い物できます。`
    : `${target.name}に到着。ひと休みして景色を楽しもう。`;
  const direction = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][((Math.round(Math.atan2(target.x - player.x, target.z - player.z) / (Math.PI / 4)) % 8) + 8) % 8];
  return `目的地：${target.name} · 直線約${Math.round(distance * 0.08)}m · ${direction}へ（地図 [M] で道を確認）`;
}
