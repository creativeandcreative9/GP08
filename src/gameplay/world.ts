import type { Town } from '../town/build';
import { doorU, shopPoint } from '../life/crowd';
import { coastS } from '../town/heights';
import { SPAWN } from '../town/layout';
import type { Footprint } from '../player/player';
import { SHOPS } from './errands';

export interface Contact {
  id: string;
  name: string;
  x: number;
  z: number;
  y: number;
  kind: 'resident' | 'shop' | 'home' | 'event';
  line: string;
}

export function blocked(x: number, z: number, obstacles: readonly Footprint[], radius = 4): boolean {
  return obstacles.some(o => x > o.minX - radius && x < o.maxX + radius && z > o.minZ - radius && z < o.maxZ + radius);
}

export function shopContacts(town: Town): Contact[] {
  return Object.entries(SHOPS).flatMap(([id, info]) => {
    const spot = town.spots[id];
    if (!spot) return [];
    // The cafe's non-walkable terrace extends 44 units past its facade.
    // Search beyond its edge as well, preserving both the deck and its collision footprint.
    for (const v of [16, 24, 32, 40, 48, 56]) {
      for (const u of [0, -12, 12, -24, 24]) {
        const p = shopPoint(spot, doorU(id, spot.hu) + u, v);
        if (!blocked(p.x, p.z, town.obstacles)) return [{ id, ...info, ...p, y: town.heightAt(p.x, p.z), kind: 'shop' as const }];
      }
    }
    return [];
  });
}

/** A slab intersection, so interactions cannot pass through a wall or building footprint. */
function crosses(a: { x: number; z: number }, b: { x: number; z: number }, o: Footprint): boolean {
  let lo = 0;
  let hi = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, o.minX, o.maxX], [a.z, b.z - a.z, o.minZ, o.maxZ]]) {
    if (Math.abs(delta!) < 1e-8) {
      if (start! <= min! || start! >= max!) return false;
    } else {
      const t0 = (min! - start!) / delta!;
      const t1 = (max! - start!) / delta!;
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
      if (lo >= hi) return false;
    }
  }
  return hi > 0 && lo < 1;
}

export function inReach(player: { x: number; y: number; z: number }, contact: Contact, obstacles: readonly Footprint[]): boolean {
  const radius = contact.kind === 'shop' ? 30 : 24;
  return Math.hypot(player.x - contact.x, player.z - contact.z) <= radius
    && Math.abs(player.y - contact.y) < 16 && !obstacles.some(o => crosses(player, contact, o));
}

export function restorePosition(town: Town, position: { x: number; z: number } | null): { x: number; z: number } {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)
    || Math.abs(position.x) > 10000 || Math.abs(position.z) > 10000 || coastS(position.x, position.z) > -8
    || blocked(position.x, position.z, town.obstacles)) return { ...SPAWN };
  return { ...position };
}
