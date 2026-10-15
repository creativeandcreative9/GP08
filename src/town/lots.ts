import type { Ctx } from './ctx';
import { DEC0_Y } from './ctx';
import { Frame, frameFacing } from './frame';
import { addApartment, addHouse } from './houses';
import { LOTS, type Lot } from './layout';
import { addPark } from './parks';
import { addBank, addCampus, addGym, addHospital, frameRect } from './publicbldg';
import { addHotel, addShop } from './shops';
import { freeRects, lotRect, roadClearance } from './site';
import { addCherry } from './trees';
import { heightAt } from './terrain';
import { hex, type RGB, type Rect } from './util';

const PAD: Record<Lot['kind'], RGB> = {
  home: hex(0xcdd9a8),
  shop: hex(0xd9d5ca),
  public: hex(0xd6d9d2),
  park: hex(0x93d56d),
};

function pad(c: Ctx, r: Rect, col: RGB, grow = 3): void {
  const y = DEC0_Y;
  const x0 = r.minX - grow, x1 = r.maxX + grow, z0 = r.minZ - grow, z1 = r.maxZ + grow;
  c.dec0.quad([x0, heightAt(x0, z0) + y, z0], [x0, heightAt(x0, z1) + y, z1], [x1, heightAt(x1, z1) + y, z1], [x1, heightAt(x1, z0) + y, z0], col, [0, 1, 0]);
}

function frameFor(r: Rect): { f: Frame; hu: number; hv: number } {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const nr = roadClearance(cx, cz);
  const f = frameFacing(cx, cz, nr.px, nr.pz);
  const W = r.maxX - r.minX;
  const D = r.maxZ - r.minZ;
  return f.fx === 0 ? { f, hu: W / 2, hv: D / 2 } : { f, hu: D / 2, hv: W / 2 };
}

const area = (r: Rect): number => (r.maxX - r.minX) * (r.maxZ - r.minZ);

export function buildLots(c: Ctx): void {
  const priority: Record<Lot['kind'], number> = { public: 0, park: 1, shop: 2, home: 3 };
  const lots = [...LOTS].sort((a, b) => priority[a.kind] - priority[b.kind]);
  const claimed: Rect[] = [];
  const stats = { houses: 0, apartments: 0, shops: 0, publics: 0, parks: 0 };

  for (const lot of lots) {
    const lr = lotRect(lot.x, lot.y, lot.w, lot.d);
    const maxPieces = lot.kind === 'public' ? 3 : lot.kind === 'home' ? 4 : 1;
    const minW = lot.kind === 'park' ? 60 : lot.kind === 'home' ? 70 : 90;
    const res = freeRects(lr, claimed, { cell: 8, maxPieces, minW, minD: lot.kind === 'park' ? 60 : 60, takenGap: 14 });
    const kept = res.pieces.reduce((s, p) => s + area(p), 0);
    const frac = kept / area(lr);
    const why = Object.entries(res.blocked)
      .filter(([, n]) => n! > 0)
      .map(([k, n]) => `${k}:${Math.round((n! / res.total) * 100)}%`)
      .join(' ');
    if (res.pieces.length === 0) {
      c.report.push(`LOT DROPPED ${lot.id} (${lot.label}): no free space (${why})`);
      continue;
    }
    if (frac < 0.75) c.report.push(`lot ${lot.id} (${lot.label}) clipped to ${Math.round(frac * 100)}% of its area, blocked by ${why}`);

    res.pieces.forEach((piece, pi) => {
      claimed.push(piece);
      pad(c, piece, PAD[lot.kind]);
      const { f, hu, hv } = frameFor(piece);
      if (lot.kind === 'park') {
        if (pi === 0) {
          addPark(c, lot, f, hu - 4, hv - 4);
          stats.parks++;
        }
      } else if (lot.kind === 'public') {
        if (pi === 0) {
          const hu2 = hu - 12;
          const hv2 = hv - 14;
          if (lot.label === '銀行') addBank(c, lot, piece, f, Math.min(hu2, 140), Math.min(hv2, 90));
          else if (lot.label === '病院') addHospital(c, lot, piece, f, hu2, hv2);
          else addCampus(c, lot, piece, f, hu2, hv2);
          stats.publics++;
        } else if (area(piece) > 20000) {
          addGym(c, f, hu - 12, hv - 12);
        } else {
          const p = f.pt(0, 0, 0);
          addCherry(c, p[0], p[2], 1);
        }
      } else if (lot.kind === 'shop') {
        const hu2 = Math.min(hu - 8, lot.floors >= 5 ? 150 : 190);
        const hv2 = Math.min(hv - 10, lot.floors === 1 ? 90 : lot.floors >= 5 ? 100 : 105);
        if (hu2 < 40 || hv2 < 30) {
          c.report.push(`shop ${lot.id} too small after clipping, skipped`);
          return;
        }
        const rect = frameRect(f, -hu2, hu2, -hv2, hv2);
        if (lot.label === 'ホテル') addHotel(c, lot, rect, f, hu2, hv2);
        else addShop(c, lot, rect, f, hu2, hv2);
        stats.shops++;
      } else if (lot.floors >= 3) {
        // apartment blocks
        const tall = lot.floors >= 8;
        const maxLen = tall ? 380 : 280;
        const maxDepth = tall ? 320 : 180;
        const L = hu * 2 - 24;
        const n = tall ? 1 : Math.max(1, Math.ceil(L / (maxLen + 30)));
        const gap = 34;
        const bl = Math.min(maxLen, (L - gap * (n - 1)) / n);
        const bh = Math.min(maxDepth, hv * 2 - 36) / 2;
        for (let i = 0; i < n; i++) {
          const uc = (i - (n - 1) / 2) * (bl + gap);
          const p = f.pt(uc, 0, 4);
          const fb = new Frame(p[0], p[2], f.fx, f.fz);
          const rect = frameRect(fb, -bl / 2, bl / 2, -bh, bh);
          addApartment(c, rect, fb, bl / 2, bh, lot.floors, lot.label);
          stats.apartments++;
        }
      } else {
        // detached houses side by side
        const L = hu * 2;
        const depth = hv * 2;
        let n = Math.max(1, Math.round((L + 24) / (122 + 24)));
        while (n > 1 && (L - 24 * (n - 1)) / n < 80) n--;
        const slot = (L - 24 * (n - 1)) / n;
        const hw = Math.min(slot - 24, 135) / 2;
        if (hw < 34) {
          c.report.push(`home ${lot.id} piece too narrow, skipped`);
          return;
        }
        const hd = Math.min(depth - 28, 112) / 2;
        for (let i = 0; i < n; i++) {
          const uc = -hu + slot / 2 + i * (slot + 24);
          const vc = hv - 16 - hd;
          const p = f.pt(uc, 0, vc);
          const fh = new Frame(p[0], p[2], f.fx, f.fz);
          const rect = frameRect(fh, -hw, hw, -hd, hd);
          addHouse(c, rect, fh, hw, hd, 2);
          stats.houses++;
        }
      }
    });
  }
  c.report.push(`buildings: ${stats.houses} houses, ${stats.apartments} apartment blocks, ${stats.shops} shops, ${stats.publics} public, ${stats.parks} parks`);
}
