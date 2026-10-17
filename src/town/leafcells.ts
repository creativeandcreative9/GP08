/**
 * Layout of the foliage atlas (leafatlas.ts paints it, leaf.ts builds cards from it). Pure data: no canvas, so
 * geometry builders and tests can use the cells without a browser.
 *
 * One 2048 x 2048 texture holds every sprite: cherry-blossom clusters and sprays, fallen-petal patches, leaf
 * clusters (hedges, shrubs, street trees), grass, clover and weeds, flower beds, pot plants and ivy. Rows of the
 * texture are numbered from the TOP of the painted picture (the texture is uploaded without a flip), so a sprite's
 * top edge has the smaller v.
 */
export const LEAF_W = 2048;
export const LEAF_H = 2048;

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rect = (x: number, y: number, w: number, h: number): CellRect => ({ x, y, w, h });

/** Every sprite of the atlas by name, in pixels. */
export const CELLS = {
  // ---- cherry blossom: 512 x 512 clusters (pale ... deep), hanging sprays and flowering twigs ----
  bloomA: rect(0, 0, 512, 512),
  bloomB: rect(512, 0, 512, 512),
  bloomC: rect(1024, 0, 512, 512),
  bloomD: rect(1536, 0, 512, 512),
  sprayA: rect(0, 512, 256, 512),
  sprayB: rect(256, 512, 256, 512),
  twigA: rect(512, 512, 512, 256),
  twigB: rect(512, 768, 512, 256),
  bloomE: rect(1024, 512, 512, 512),
  // ---- fallen petals, lying on the ground ----
  petalsA: rect(1536, 512, 512, 512),
  petalsB: rect(0, 1792, 512, 256),
  petalsC: rect(512, 1792, 512, 256),
  // ---- leaf clusters: hedges, shrubs, tree crowns (256 x 256) ----
  hedgeA: rect(0, 1024, 256, 256),
  hedgeB: rect(256, 1024, 256, 256),
  hedgeC: rect(512, 1024, 256, 256),
  hedgeD: rect(768, 1024, 256, 256),
  zelkova: rect(1024, 1024, 256, 256),
  ginkgo: rect(1280, 1024, 256, 256),
  leafBroad: rect(1536, 1024, 256, 256),
  camphor: rect(1792, 1024, 256, 256),
  // ---- low growth ----
  tuftA: rect(0, 1280, 256, 256),
  tuftB: rect(256, 1280, 256, 256),
  tuftC: rect(512, 1280, 256, 256),
  clover: rect(768, 1280, 256, 256),
  weed: rect(1024, 1280, 256, 256),
  dandelion: rect(1280, 1280, 256, 256),
  ivy: rect(1536, 1280, 256, 256),
  shrubBloom: rect(1792, 1280, 256, 256),
  // ---- flower beds and pot plants ----
  bedTulip: rect(0, 1536, 256, 256),
  bedPansy: rect(256, 1536, 256, 256),
  bedMarigold: rect(512, 1536, 256, 256),
  bedNemo: rect(768, 1536, 256, 256),
  bedCosmos: rect(1024, 1536, 256, 256),
  bedDaisy: rect(1280, 1536, 256, 256),
  plantRubber: rect(1536, 1536, 256, 256),
  plantSword: rect(1792, 1536, 256, 256),
  plantFrond: rect(1024, 1792, 256, 256),
  cedar: rect(1280, 1792, 256, 256),
} as const;

export type CellName = keyof typeof CELLS;

/** Transparent border inside every cell (px): painters stay out of it, so mip levels never mix neighbouring sprites. */
export const CELL_MARGIN = 6;

export interface CellUv {
  u0: number;
  u1: number;
  /** v of the sprite's TOP edge (smaller) and BOTTOM edge. */
  vt: number;
  vb: number;
  /** Width / height of the sprite (cards use it to keep the picture undistorted). */
  aspect: number;
}

/**
 * Texture coordinates of a cell, a texel and a half inside so that filtering never reaches the neighbour.
 * The corners of a card (bottom-left, bottom-right, top-right, top-left) take
 * [u0,vb] [u1,vb] [u1,vt] [u0,vt].
 */
export function cellUv(name: CellName): CellUv {
  const r = CELLS[name];
  const e = 1.5;
  return {
    u0: (r.x + e) / LEAF_W,
    u1: (r.x + r.w - e) / LEAF_W,
    vt: (r.y + e) / LEAF_H,
    vb: (r.y + r.h - e) / LEAF_H,
    aspect: r.w / r.h,
  };
}
