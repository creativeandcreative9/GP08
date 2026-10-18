/** Gentle hunger uses active world time only; callers pause it with the clock. */
export interface HungerState { hunger: number }

export const MAX_HUNGER = 100;
export const HUNGER_PER_SECOND = 1 / 12;
export const MAX_HUNGER_RUN_MULTIPLIER = 3;

/** Missing fields belong to older saves. Explicit invalid values are corruption. */
export function readHunger(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_HUNGER ? value : null;
}

const boundedHunger = (value: number): number => Number.isFinite(value) ? Math.min(MAX_HUNGER, Math.max(0, value)) : 0;

/** 20 active real minutes to become hungry; at run multiplier 3 this takes 5 minutes.
 * A real second is one town minute. Match advanceClock's defensive 60-second cap;
 * Gameplay supplies its smaller frame cap and passes zero while not running.
 * Hunger never changes movement, inventory, money or the calendar.
 */
export function advanceHunger(p: HungerState, realSeconds: number, runMultiplier = 0): void {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
  const running = Number.isFinite(runMultiplier) ? Math.min(MAX_HUNGER_RUN_MULTIPLIER, Math.max(0, runMultiplier)) : 0;
  p.hunger = Math.min(MAX_HUNGER, boundedHunger(p.hunger) + Math.min(realSeconds, 60) * (1 + running) * HUNGER_PER_SECOND);
}

/** Return the actual relief so eating near full cannot create negative hunger. */
export function relieveHunger(p: HungerState, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const before = boundedHunger(p.hunger);
  p.hunger = Math.max(0, before - amount);
  return before - p.hunger;
}
