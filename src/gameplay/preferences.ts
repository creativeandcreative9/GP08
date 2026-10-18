/** Optional assistance preferences migrate independently from money and game progress. */
import { validResident } from './errands';
export interface PlayPreferences {
  wayfinding: boolean;
  destination: string | null;
  /** The dismissed night's upcoming morning date; zero means no night was dismissed. */
  nightHintDay: number;
}

export const DESTINATIONS = ['e-wagashi', 'w-conbini', 'w-cafe', 'station', 'plaza', 'beach', 'summit', 'home'] as const;
export const newPreferences = (): PlayPreferences => ({ wayfinding: true, destination: null, nightHintDay: 0 });

export function readPreferences(value: unknown): PlayPreferences | null {
  if (value === undefined) return newPreferences();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (typeof p.wayfinding !== 'boolean'
    || (p.destination !== null && !DESTINATIONS.includes(p.destination as typeof DESTINATIONS[number]) && !validResident(p.destination))
    || !Number.isSafeInteger(p.nightHintDay) || (p.nightHintDay as number) < 0 || (p.nightHintDay as number) > 10000) return null;
  return { wayfinding: p.wayfinding, destination: p.destination as string | null, nightHintDay: p.nightHintDay as number };
}

export const isEvening = (minute: number): boolean => minute >= 1080 || minute < 360;

/** The date this night will end: midnight does not start a second evening hint. */
export function nightEpisode(day: number, minute: number): number {
  if (!Number.isSafeInteger(day) || day < 1 || day > 9999 || !Number.isFinite(minute) || minute < 0 || minute >= 1440 || !isEvening(minute)) return 0;
  return minute >= 1080 ? day + 1 : day;
}
