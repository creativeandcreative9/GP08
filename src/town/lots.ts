import type { Ctx } from './ctx';
import { DEC0_Y } from './ctx';
import { Frame, frameFacing } from './frame';
import { addApartment, addHouse } from './houses';
import { LOTS, type Lot } from './layout';
import { addPark } from './parks';
import { addBank, addCampus, addGym, addHospital, frameRect } from './publicbldg';
import { addFeatured, FEATURED } from './featured';
import { addHotel, addShop } from './shops';
import { freeRects, lotRect, roadClearance, siteBlock } from './site';
import { addCherry } from './trees';
import { heightAt } from './terrain';
import { hex, rectsOverlap, type RGB, type Rect } from './util';

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

/**
 * Lots whose place was changed from the hand-drawn map (map px, same meaning as in layout.ts) so that a hand-built
 * shop stands along a straight street. The cafe moves from the diagonal cherry avenue (where trunks stood right in
 * front of its terrace) to the north side of the west road, looking at the plaza's cherry trees.
 */
const RELOCATED: Readonly<Record<string, { x: number; y: number; w: number; d: number }>> = {
  'w-cafe': { x: 466, y: 444, w: 36, d: 78 },
};

function siteBlocked(r: Rect): boolean {
  for (let x = r.minX; x <= r.maxX; x += 8) for (let z = r.minZ; z <= r.maxZ; z += 8) if (siteBlock(x, z)) return true;
  return siteBlock(r.maxX, r.maxZ) !== undefined;
}

/**
 * Hand-drawn blocks often stop well short of the street, and the infill would then put a row of houses in
 * front of the shop. Pull the building forward so that its front stands just behind the sidewalk.
 */
function pullToStreet(f: Frame, hu: number, hv: number, claimed: readonly Rect[], own: Rect, yard = 0): Frame {
  const fc = f.pt(0, 0, hv);
  const gap = roadClearance(fc[0], fc[2]).d;
  // `yard`: extra depth in front of the facade (a terrace, a bench) that must stay clear of the road's sidewalk
  for (let shift = Math.floor(Math.max(0, gap - 26 - yard) / 4) * 4; shift > 0; shift -= 4) {
    const g = new Frame(f.cx + f.fx * shift, f.cz + f.fz * shift, f.fx, f.fz);
    const r = frameRect(g, -hu, hu, -hv, hv + 10 + yard); // with a strip in front for the shopfront
    if (claimed.some((o) => o !== own && rectsOverlap(o, r, 4))) continue;
    if (siteBlocked(r)) continue;
    return g;
  }
  return f;
}

/** Builds the named lots; returns the grounds (parks, campuses) that infill must not use. */
export function buildLots(c: Ctx): Rect[] {
  const priority: Record<Lot['kind'], number> = { public: 0, park: 1, shop: 2, home: 3 };
  const lots = [...LOTS].sort((a, b) => priority[a.kind] - priority[b.kind]);
  const claimed: Rect[] = [];
  const reserved: Rect[] = []; // grounds that infill must leave alone (parks, campuses)
  const stats = { houses: 0, apartments: 0, shops: 0, publics: 0, parks: 0 };

  for (const lot of lots) {
    const geo = RELOCATED[lot.id] ?? lot;
    const lr = lotRect(geo.x, geo.y, geo.w, geo.d);
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
      if (lot.kind === 'park' || lot.kind === 'public') reserved.push(piece);
      if (lot.kind !== 'shop') pad(c, piece, PAD[lot.kind]);
      const { f, hu, hv } = frameFor(piece);
      if (lot.kind === 'park') {
        if (pi === 0) {
          addPark(c, lot, f, hu - 4, hv - 4);
          stats.parks++;
        }
      } else if (lot.kind === 'public') {
        if (pi === 0 && lot.id !== 'highschool-gym') {
          const hu2 = hu - 12;
          const hv2 = hv - 14;
          if (lot.label === '銀行') addBank(c, lot, piece, f, Math.min(hu2, 140), Math.min(hv2, 90));
          else if (lot.label === '病院') addHospital(c, lot, piece, f, hu2, hv2);
          else addCampus(c, lot, piece, f, hu2, hv2);
          stats.publics++;
        } else if (lot.id === 'highschool-gym') {
          addGym(c, f, hu - 6, hv - 6, lot.label);
          stats.publics++;
        } else if (area(piece) > 20000) {
          addGym(c, f, hu - 12, hv - 12, '体育館');
        } else {
          const p = f.pt(0, 0, 0);
          addCherry(c, p[0], p[2], 1);
        }
      } else if (lot.kind === 'shop') {
        const feat = FEATURED[lot.id]; // the hand-built shops are smaller than their lot and have a front yard
        const hu2 = Math.min(hu - 3, feat ? feat.hu : lot.floors >= 5 ? 170 : 260);
        const hv2 = Math.min(hv - 4, feat ? feat.hv : lot.floors === 1 ? 100 : lot.floors >= 5 ? 110 : 125);
        if (hu2 < 40 || hv2 < 30) {
          c.report.push(`shop ${lot.id} too small after clipping, skipped`);
          return;
        }
        const yard = feat?.yard ?? 0;
        const fs = pullToStreet(f, hu2, hv2, claimed, piece, yard);
        const rect = frameRect(fs, -hu2, hu2, -hv2, hv2);
        claimed.push(rect);
        pad(c, frameRect(fs, -hu2 - 6, hu2 + 6, -hv2 - 6, hv2 + 8 + yard), PAD.shop);
        c.spots[lot.id] = { x: fs.cx, z: fs.cz, fx: fs.fx, fz: fs.fz, hu: hu2, hv: hv2 };
        if (lot.label === 'ホテル') addHotel(c, lot, rect, fs, hu2, hv2);
        else if (!feat || !addFeatured(c, lot, rect, fs, hu2, hv2)) addShop(c, lot, rect, fs, hu2, hv2);
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
        let n = Math.max(1, Math.round((L + 24) / (126 + 24)));
        while (n > 1 && (L - 24 * (n - 1)) / n < 80) n--;
        const slot = (L - 24 * (n - 1)) / n;
        const hw = Math.min(slot - 24, 150) / 2;
        if (hw < 34) {
          c.report.push(`home ${lot.id} piece too narrow, skipped`);
          return;
        }
        const hd = Math.min(depth - 24, 124) / 2;
        for (let i = 0; i < n; i++) {
          const uc = -hu + slot / 2 + i * (slot + 24);
          const vc = hv - 12 - hd;
          const p = f.pt(uc, 0, vc);
          const fh = new Frame(p[0], p[2], f.fx, f.fz);
          const rect = frameRect(fh, -hw, hw, -hd, hd);
          addHouse(c, rect, fh, hw, hd, 2);
          stats.houses++;
        }
      }
    });
  }
  c.report.push(`named lots: ${stats.houses} houses, ${stats.apartments} apartment blocks, ${stats.shops} shops, ${stats.publics} public, ${stats.parks} parks`);
  return reserved;
}
