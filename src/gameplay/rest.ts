import type { Town } from '../town/build';
import { PLAZA_BENCHES } from '../town/benches';
import { blocked, inReach, type Contact } from './world';

export interface RestPlace {
  id: string;
  name: string;
  x: number;
  z: number;
  y: number;
  fx: number;
  fz: number;
  seatHeight: number;
  exit: { x: number; y: number; z: number };
}

export function restPlaces(town: Pick<Town, 'heightAt' | 'obstacles'>): RestPlace[] {
  return PLAZA_BENCHES.map(bench => ({
    ...bench, name: '公園のベンチ', y: town.heightAt(bench.x, bench.z),
    exit: { x: bench.x + bench.fx * 14, z: bench.z + bench.fz * 14, y: town.heightAt(bench.x + bench.fx * 14, bench.z + bench.fz * 14) },
  })).filter(bench => !blocked(bench.x, bench.z, town.obstacles) && !blocked(bench.exit.x, bench.exit.z, town.obstacles));
}

export function occupied(bench: RestPlace, people: readonly Contact[]): boolean {
  return people.some(p => p.kind === 'resident' && Math.hypot(p.x - bench.x, p.z - bench.z) < 12 && Math.abs(p.y - bench.y) < 16);
}

/** Approach from the front, with an unobstructed place to stand up again. */
export function canRest(player: { x: number; y: number; z: number }, bench: RestPlace, people: readonly Contact[], obstacles: Town['obstacles']): boolean {
  return Math.hypot(player.x - bench.x, player.z - bench.z) <= 26
    && (player.x - bench.x) * bench.fx + (player.z - bench.z) * bench.fz >= 5
    && Math.abs(player.y - bench.y) < 6 && !occupied(bench, people)
    && !blocked(bench.x, bench.z, obstacles) && !blocked(bench.exit.x, bench.exit.z, obstacles)
    && inReach(player, { ...bench, ...bench.exit, kind: 'resident', line: '' }, obstacles);
}
