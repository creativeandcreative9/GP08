import type { Ctx } from './ctx';
import type { Frame } from './frame';
import type { Lot } from './layout';
import { addCafe } from './cafe';
import { addConbini } from './conbini';
import { addWagashi } from './wagashi';
import type { Rect } from './util';

/** Size (half width, half depth) and front-yard depth of the hand-built shops, by lot id (see `addFeatured`). */
export const FEATURED: Readonly<Record<string, { hu: number; hv: number; yard: number }>> = {
  'e-wagashi': { hu: 78, hv: 62, yard: 24 },
  'w-conbini': { hu: 84, hv: 66, yard: 12 },
  'w-cafe': { hu: 66, hv: 56, yard: 46 },
};

/** Builds the hand-made shop for a named lot. Returns false when the lot is not one of them. */
export function addFeatured(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): boolean {
  switch (lot.id) {
    case 'e-wagashi':
      addWagashi(c, rect, f, hu, hv);
      return true;
    case 'w-conbini':
      addConbini(c, rect, f, hu, hv);
      return true;
    case 'w-cafe':
      addCafe(c, rect, f, hu, hv);
      return true;
    default:
      return false;
  }
}
