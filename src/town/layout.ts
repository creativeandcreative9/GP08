/**
 * Town layout transcribed from the hand-drawn map (see the GP08 planning doc, "街の地図").
 *
 * Map coordinates are pixels on the upright photo of the map (1400 × 1050):
 * x grows to the east, y grows to the south, the sea is at the top (north).
 * World coordinates are MMD units (1 unit ≈ 8 cm): +X = east, +Z = north, +Y = up.
 * The origin is the centre of the station plaza (駅前公園).
 */

/** World units per map pixel. The map is about 600 m × 450 m. */
export const PX = 5.36;
const ORIGIN_X = 650;
const ORIGIN_Y = 500;

export interface WorldXZ {
  x: number;
  z: number;
}

export function mapToWorld(x: number, y: number): WorldXZ {
  return { x: (x - ORIGIN_X) * PX, z: -(y - ORIGIN_Y) * PX };
}

export type LotKind = 'home' | 'shop' | 'public' | 'park';

/** A block from the map. Homes may be split into several houses by the builder. */
export interface Lot {
  id: string;
  label: string;
  kind: LotKind;
  /** Centre on the map (px). */
  x: number;
  y: number;
  /** Size on the map (px): w along x (east), d along y (south). */
  w: number;
  d: number;
  /** Building height in floors (one floor ≈ 3 m ≈ 37 units). Ignored for parks. */
  floors: number;
}

/**
 * Lot rectangles were adjusted so that no road, the railway, the plaza, the station or the beach runs through
 * a lot, and no two lots overlap: each lot was cut down to the largest free rectangle inside its original
 * hand-drawn block (setback ≈ 3 px = sidewalk + a few units from the road edge). The high school was split by
 * the east lane, so its east half became a separate gym lot.
 */
export const LOTS: readonly Lot[] = [
  // North strip, between the coast road and the railway
  { id: 'n-restaurant', label: 'レストラン', kind: 'shop', x: 185, y: 316.8, w: 120, d: 52.5, floors: 2 },
  { id: 'n-home1', label: '住宅', kind: 'home', x: 310, y: 315, w: 110, d: 55, floors: 2 },
  { id: 'n-home2', label: '住宅', kind: 'home', x: 435, y: 315, w: 110, d: 55, floors: 2 },
  { id: 'n-home3', label: '住宅', kind: 'home', x: 680, y: 228.5, w: 80, d: 22, floors: 2 },
  { id: 'n-home4', label: '住宅', kind: 'home', x: 780, y: 218.3, w: 75, d: 31.5, floors: 2 },
  { id: 'n-home5', label: '住宅', kind: 'home', x: 899, y: 204.8, w: 78, d: 44.5, floors: 2 },
  { id: 'n-home6', label: '住宅', kind: 'home', x: 1022.8, y: 152, w: 24.5, d: 30, floors: 2 },
  { id: 'n-park', label: '海辺の公園', kind: 'park', x: 1150, y: 162.3, w: 180, d: 65.5, floors: 0 },
  { id: 'n-conbini', label: 'コンビニ', kind: 'shop', x: 1060.3, y: 258.3, w: 109.5, d: 27.5, floors: 1 },
  { id: 'n-cafe', label: 'カフェ', kind: 'shop', x: 1010, y: 312, w: 110, d: 45, floors: 2 },

  // West and south-west, along the street from the plaza to the mountain
  { id: 'w-home1', label: '住宅', kind: 'home', x: 270, y: 465, w: 80, d: 45, floors: 2 },
  { id: 'w-home2', label: '住宅', kind: 'home', x: 405, y: 455, w: 85, d: 45, floors: 2 },
  { id: 'w-hotel', label: 'ホテル', kind: 'shop', x: 368.8, y: 545, w: 127.5, d: 60, floors: 5 },
  { id: 'w-home3', label: '住宅', kind: 'home', x: 330, y: 655, w: 70, d: 50, floors: 2 },
  { id: 'w-cafe', label: 'カフェ', kind: 'shop', x: 466.5, y: 630.5, w: 47, d: 54, floors: 2 },
  { id: 'w-flower', label: '花屋', kind: 'shop', x: 414, y: 730, w: 62, d: 60, floors: 2 },
  { id: 'w-apart', label: 'アパート', kind: 'home', x: 230, y: 809.8, w: 50, d: 99.5, floors: 3 },
  { id: 'w-mansion', label: 'マンション', kind: 'home', x: 341.5, y: 905.3, w: 87, d: 139.5, floors: 8 },
  { id: 'w-conbini', label: 'コンビニ', kind: 'shop', x: 555, y: 670, w: 100, d: 70, floors: 1 },
  { id: 'w-book', label: '本屋', kind: 'shop', x: 520, y: 770, w: 110, d: 80, floors: 2 },
  { id: 'w-home4', label: '住宅', kind: 'home', x: 510, y: 885, w: 110, d: 70, floors: 2 },
  { id: 'w-ramen', label: 'ラーメン', kind: 'shop', x: 510, y: 995, w: 120, d: 50, floors: 2 },

  // East and south-east
  { id: 'e-karaoke', label: 'カラオケ', kind: 'shop', x: 890, y: 460, w: 120, d: 45, floors: 3 },
  { id: 'e-clothes', label: '洋服屋', kind: 'shop', x: 872.3, y: 525, w: 115.5, d: 55, floors: 2 },
  { id: 'e-wagashi', label: '和菓子屋', kind: 'shop', x: 780, y: 650, w: 120, d: 55, floors: 2 },
  { id: 'e-bank', label: '銀行', kind: 'public', x: 900, y: 650, w: 80, d: 60, floors: 3 },
  { id: 'e-hospital', label: '病院', kind: 'public', x: 785, y: 773, w: 130, d: 94, floors: 4 },
  { id: 'e-sushi', label: 'すし', kind: 'shop', x: 915, y: 760.5, w: 80, d: 69, floors: 2 },
  { id: 'e-home1', label: '住宅', kind: 'home', x: 780, y: 890, w: 110, d: 70, floors: 2 },
  { id: 'e-super', label: 'スーパー', kind: 'shop', x: 790, y: 1000, w: 120, d: 70, floors: 1 },
  { id: 'e-park', label: '公園', kind: 'park', x: 1020, y: 790, w: 70, d: 90, floors: 0 },
  { id: 'e-restaurant', label: 'レストラン', kind: 'shop', x: 1092.8, y: 790, w: 35.5, d: 110, floors: 2 },
  { id: 'e-tower', label: 'タワーマンション', kind: 'home', x: 1010, y: 940, w: 140, d: 110, floors: 20 },
  { id: 'e-home2', label: '住宅', kind: 'home', x: 1287.8, y: 431.3, w: 64.5, d: 57.5, floors: 2 },
  { id: 'e-gohan', label: 'ごはん屋', kind: 'shop', x: 1320, y: 525, w: 120, d: 75, floors: 2 },
  { id: 'e-home3', label: '住宅', kind: 'home', x: 1330, y: 650, w: 80, d: 70, floors: 2 },
  { id: 'e-park2', label: '公園', kind: 'park', x: 1382.5, y: 790, w: 35, d: 90, floors: 0 },
  { id: 'e-home4', label: '住宅', kind: 'home', x: 1187.3, y: 1040.5, w: 94.5, d: 19, floors: 2 },

  // Large public buildings
  { id: 'university', label: '大学', kind: 'public', x: 1092, y: 553.3, w: 275, d: 301.5, floors: 4 },
  { id: 'highschool-gym', label: '体育館', kind: 'public', x: 1307, y: 895, w: 102, d: 270, floors: 2 },
  { id: 'highschool', label: '高校', kind: 'public', x: 1182.3, y: 885, w: 104.5, d: 290, floors: 3 },
];

export interface Road {
  id: string;
  /** Centre line on the map (px). */
  points: readonly (readonly [number, number])[];
  /** Width in world units (100 ≈ 8 m). */
  width: number;
}

export const ROADS: readonly Road[] = [
  { id: 'coast-road', points: [[0, 270], [520, 262], [940, 238], [1320, 212], [1400, 205]], width: 90 },
  { id: 'west-road', points: [[0, 510], [500, 495]], width: 90 },
  { id: 'mountain-street', points: [[500, 490], [150, 1050]], width: 100 },
  { id: 'main-street', points: [[650, 600], [655, 1050]], width: 120 },
  { id: 'ne-street', points: [[800, 430], [1000, 160]], width: 80 },
  { id: 'east-road', points: [[700, 715], [1400, 715]], width: 90 },
  { id: 'univ-north-road', points: [[940, 392], [1400, 392]], width: 80 },
  { id: 'east-lane', points: [[1245, 392], [1245, 1050]], width: 80 },
  { id: 'south-lane', points: [[860, 715], [860, 1050]], width: 70 },
  { id: 'tower-lane', points: [[1120, 715], [1120, 1050]], width: 70 },
];

/** Railway centre line (map px). East of the station it curves north to run along the coast. */
export const RAILWAY: readonly (readonly [number, number])[] = [
  [0, 350], [1180, 350], [1240, 340], [1290, 300], [1340, 220], [1380, 130], [1400, 95],
];

/** Station building and platform (map px rectangle). */
export const STATION = { x0: 535, y0: 305, x1: 785, y1: 385 } as const;

/** Station plaza, a park with cherry trees (map px ellipse). */
export const PLAZA = { x: 650, y: 500, rx: 160, ry: 105 } as const;

/** Coastline (map px). The sea lies north of this line; a beach runs along its south side. */
export const COAST: readonly (readonly [number, number])[] = [
  [0, 255], [160, 250], [700, 172], [1250, 92], [1400, 70],
];

/** Mountain foot outline (map px). It continues beyond the map to the south-west. */
export const MOUNTAIN_FOOT: readonly (readonly [number, number])[] = [
  [0, 580], [130, 575], [190, 640], [200, 760], [180, 1050], [0, 1050],
];

/**
 * Mountain summit (map px, off the map to the south-west) and its height in world units (≈ 80 m).
 * An observation deck and a small shrine stand on the summit, looking over the town and the sea.
 */
export const SUMMIT = { x: -60, y: 900, height: 1000 } as const;

/** Where the player starts: the plaza, in front of the station. */
export const SPAWN = mapToWorld(650, 420);
