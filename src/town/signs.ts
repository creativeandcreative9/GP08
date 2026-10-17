import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { EXTRAS, paintTallText, type ExtraCell } from './decor';
import { STREET_SIGN_STYLES } from './streetsigns';

export const FONT_STACK = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'IPAGothic', 'IPAPGothic', sans-serif";

export interface SignStyle {
  bg: string;
  fg: string;
  /** Second band colour (stripe along the top and bottom). */
  accent?: string;
  icon?: 'cross' | 'leaf' | 'rail';
  /** Draws the whole cell (512 x 128, origin at its top-left corner) instead of the default board. */
  draw?: (ctx: CanvasRenderingContext2D, w: number, h: number, font: string) => void;
  /**
   * Road paint (e.g. 止まれ): white glyphs on black, one glyph per slot along the cell, each rotated a quarter turn
   * and stretched so that the cell can be laid along a lane. The cell is used as an opacity mask by
   * `SignAtlas.paintMaterial` (black = transparent); the paint colour comes from the vertex colours.
   */
  paint?: boolean;
}

/** Sign look per label. Anything not listed gets the default board. */
const STYLES: Record<string, SignStyle> = {
  ...STREET_SIGN_STYLES,
  レストラン: { bg: '#8c1f2b', fg: '#ffe9a8', accent: '#e8c35a' },
  カフェ: { bg: '#5b3a29', fg: '#fff4e0', accent: '#d9a066' },
  コンビニ: { bg: '#ffffff', fg: '#0b6fb8', accent: '#1fa04a' },
  ホテル: { bg: '#14284b', fg: '#f3d98b', accent: '#c9a24a' },
  花屋: { bg: '#e8628e', fg: '#ffffff', accent: '#ffd1e0', icon: 'leaf' },
  本屋: { bg: '#2f6f4a', fg: '#ffffff', accent: '#9bd4a8' },
  ラーメン: { bg: '#c8281e', fg: '#fff2b0', accent: '#ffe066' },
  カラオケ: { bg: '#4a1f7a', fg: '#ffe34d', accent: '#ff5fb0' },
  洋服屋: { bg: '#1c1c22', fg: '#ffffff', accent: '#d9b25a' },
  和菓子屋: { bg: '#f4ead2', fg: '#6a1f2a', accent: '#a8323f' },
  銀行: { bg: '#0d4f3c', fg: '#ffffff', accent: '#c9d36a' },
  病院: { bg: '#ffffff', fg: '#d12a2a', accent: '#3aa6d8', icon: 'cross' },
  大学: { bg: '#1d2f6b', fg: '#ffffff', accent: '#d8b24a' },
  高校: { bg: '#1f5a36', fg: '#ffffff', accent: '#e6d56a' },
  すし: { bg: '#1d3a73', fg: '#ffffff', accent: '#e84a4a' },
  スーパー: { bg: '#f08a1c', fg: '#ffffff', accent: '#ffe27a' },
  ごはん屋: { bg: '#7a4a28', fg: '#fff3dc', accent: '#e0b070' },
  アパート: { bg: '#e9e4d8', fg: '#4a4a52', accent: '#a8a49a' },
  マンション: { bg: '#e9e4d8', fg: '#3a4660', accent: '#a8b0c0' },
  タワーマンション: { bg: '#20263a', fg: '#e8edf8', accent: '#8aa0d0' },
  美容室: { bg: '#f2a6c4', fg: '#ffffff', accent: '#ffe0ec' },
  薬局: { bg: '#ffffff', fg: '#1f9a58', accent: '#1f9a58' },
  居酒屋: { bg: '#3a1c14', fg: '#ffd27a', accent: '#c8281e' },
  八百屋: { bg: '#3f9a3f', fg: '#ffffff', accent: '#ffe066' },
  クリーニング: { bg: '#2f7fd0', fg: '#ffffff', accent: '#bfe4ff' },
  理容室: { bg: '#ffffff', fg: '#c8281e', accent: '#2f5fb0' },
  焼肉: { bg: '#1c1c22', fg: '#ff7a3a', accent: '#c8281e' },
  パン屋: { bg: '#f4d9a8', fg: '#7a3f1c', accent: '#c8863a' },
  医院: { bg: '#ffffff', fg: '#1f7fb0', accent: '#3aa6d8', icon: 'cross' },
  歯科: { bg: '#e6f6f4', fg: '#1f8a80', accent: '#4cc4b8' },
  学習塾: { bg: '#2f3f8a', fg: '#ffffff', accent: '#ffd24a' },
  酒屋: { bg: '#5a2a3a', fg: '#ffe9d0', accent: '#d9a066' },
  定食屋: { bg: '#8a5a2f', fg: '#fff3dc', accent: '#e0b070' },
  体育館: { bg: '#4a6f9a', fg: '#ffffff', accent: '#d8e6f4' },
  駅: { bg: '#1a56a8', fg: '#ffffff', accent: '#ffffff' },
  海辺の公園: { bg: '#2f7d4f', fg: '#ffffff', accent: '#bfe8c8' },
  公園: { bg: '#2f7d4f', fg: '#ffffff', accent: '#bfe8c8' },
  止まれ: { bg: '#000000', fg: '#ffffff', paint: true },
};
const DEFAULT_STYLE: SignStyle = { bg: '#3b4a5a', fg: '#ffffff', accent: '#aab8c8' };

/**
 * Text of the vertical hanging sign (袖看板) a shop of this kind may carry. Each entry gets a tall cell `v:<label>`
 * (painted upright, stored turned by 90 degrees: see `UvRect.rot`).
 */
export const VERTICAL: Readonly<Record<string, string>> = {
  レストラン: '洋食',
  カフェ: '喫茶',
  ラーメン: 'ラーメン',
  居酒屋: '居酒屋',
  焼肉: '焼肉',
  パン屋: 'パン',
  薬局: '薬局',
  八百屋: '八百屋',
  理容室: '理容',
  美容室: '美容室',
  医院: '内科',
  歯科: '歯科',
  学習塾: '学習塾',
  酒屋: '酒',
  定食屋: '定食',
  クリーニング: 'クリーニング',
  花屋: 'お花',
  すし: '寿司',
  ごはん屋: 'ごはん',
  本屋: '書店',
};

/** Original neighbourhood names for the small fascia boards; gameplay uses the existing shop labels. */
const FASCIA: Readonly<Record<string, string>> = {
  レストラン: '洋食キッチン 春灯', カフェ: '珈琲 こもれび', コンビニ: 'コンビニ さくら',
  花屋: '花と緑 こはる', 本屋: 'ひより書房', ラーメン: 'らーめん 月灯',
  カラオケ: 'カラオケ こだま', 洋服屋: '洋品店 つむぎ', 和菓子屋: '御菓子処 春霞',
  すし: '寿司 しおさい', スーパー: 'さくら食品館', ごはん屋: 'ごはん処 いろは',
  美容室: '美容室 ひなた', 薬局: 'はなみずき薬局', 居酒屋: '酒処 こもれび',
  八百屋: '八百屋 みどり', クリーニング: 'さくらクリーニング', 理容室: '理容 あおば',
  焼肉: '炭火焼肉 春灯', パン屋: 'パン工房 こむぎ', 医院: 'さくら内科医院',
  歯科: 'あおば歯科', 学習塾: '学習教室 あゆみ', 酒屋: '酒と食料品 こはる', 定食屋: 'お食事処 こまち',
};
const SERIF_SHOPS = new Set(['レストラン', 'カフェ', '和菓子屋', 'すし', 'ごはん屋', '居酒屋', '焼肉', '酒屋', '定食屋', '本屋']);

function paintFascia(g: CanvasRenderingContext2D, w: number, h: number, label: string): void {
  const style = STYLES[label] ?? DEFAULT_STYLE, text = FASCIA[label] ?? label;
  g.fillStyle = style.bg; g.fillRect(0, 0, w, h);
  g.fillStyle = style.accent ?? style.fg; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
  g.strokeStyle = style.fg; g.globalAlpha = .35; g.lineWidth = 1;
  g.strokeRect(5.5, 5.5, w - 11, h - 11); g.globalAlpha = 1;
  const font = SERIF_SHOPS.has(label) ? "'Noto Serif CJK JP', 'Yu Mincho', serif" : FONT_STACK;
  g.font = `600 36px ${font}`;
  const size = Math.min(36, 36 * (w - 40) / Math.max(1, g.measureText(text).width));
  g.font = `600 ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = style.fg; g.fillText(text, w / 2, h / 2 + 1);
}

const CELL_W = 512;
const CELL_H = 128;
const COLS = 8;
const ROWS = 16; // the minimum: the atlas grows by whole rows when more is asked for
/** Rows of the atlas that was built last (quadUV needs it for the half-texel inset). */
let atlasRows = ROWS;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** The picture is stored turned by 90 degrees (vertical signs): use `quadUV` to map it. */
  rot?: boolean;
}

/**
 * Texture coordinates for a quad given bottom-left, bottom-right, top-right, top-left (as the viewer sees it),
 * honouring turned (vertical) pictures.
 */
export function quadUV(r: UvRect): [number, number][] {
  // stay a texel and a half inside the picture so that mip-mapping does not pull in the neighbouring one
  const eu = 1.5 / (CELL_W * COLS);
  const ev = 1.5 / (CELL_H * atlasRows);
  const u0 = r.u0 + eu;
  const u1 = r.u1 - eu;
  const v0 = r.v0 + ev;
  const v1 = r.v1 - ev;
  return r.rot
    ? [[u1, v0], [u1, v1], [u0, v1], [u0, v0]]
    : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/** One texture atlas holding every signboard, so all signs share a single draw call. */
export class SignAtlas {
  readonly texture: DynamicTexture;
  readonly material: StandardMaterial;
  /**
   * Material for the `paint` cells (road paint such as 止まれ): the atlas is used as an alpha-tested opacity mask,
   * so quads using it lie flat on the asphalt as white glyphs with no background. It also has a stronger depth bias
   * than the ground decals, so the paint is never swallowed by the asphalt.
   */
  readonly paintMaterial: StandardMaterial;
  private cells = new Map<string, UvRect>();
  private whiteRect: UvRect;
  /** How much of the atlas is taken, for the build report. */
  readonly usage: string;

  constructor(scene: Scene, labels: readonly string[]) {
    const W = CELL_W * COLS;
    const fasciaLabels = [...new Set(labels)].filter(label => FASCIA[label] !== undefined);
    // the cells needed (plus slack for the multi-cell pictures) decide how many rows the atlas has
    const need =
      new Set(labels).size +
      EXTRAS.reduce((n, x) => n + Math.ceil((x.tall ? x.h : x.w) / CELL_W) * Math.ceil((x.tall ? x.w : x.h) / CELL_H), 0) +
      Object.keys(VERTICAL).length +
      fasciaLabels.length +
      1;
    const rows = Math.max(ROWS, Math.ceil(need / COLS) + 3);
    if (rows > 32) throw new Error('sign atlas exceeds the 4096px texture budget');
    atlasRows = rows;
    const H = CELL_H * rows;
    this.texture = new DynamicTexture('signAtlas', { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.texture.anisotropicFilteringLevel = 8;
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    // unused texels are white: plain-coloured quads sample the last cell and take their colour from the vertices only
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const extras: ExtraCell[] = [
      ...EXTRAS,
      ...Object.entries(VERTICAL).map(([label, text]): ExtraCell => ({
        key: `v:${label}`,
        w: 128,
        h: 512,
        tall: true,
        paint: (g, w, h) => paintTallText(g, w, h, text, STYLES[label] ?? DEFAULT_STYLE),
      })),
      ...fasciaLabels.map((label): ExtraCell => ({ key: `fascia:${label}`, w: 512, h: 64, paint: (g, w, h) => paintFascia(g, w, h, label) })),
    ];
    const extraKeys = new Set(extras.map((x) => x.key));
    const unique = [...new Set(labels)].filter((l) => !extraKeys.has(l));
    const used: boolean[] = new Array<boolean>(COLS * rows).fill(false);
    used[COLS * rows - 1] = true; // the white cell
    const alloc = (sx: number, sy: number): number => {
      for (let row = 0; row + sy <= rows; row++) {
        for (let col = 0; col + sx <= COLS; col++) {
          let free = true;
          for (let dy = 0; dy < sy && free; dy++) for (let dx = 0; dx < sx; dx++) if (used[(row + dy) * COLS + col + dx]) free = false;
          if (!free) continue;
          for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) used[(row + dy) * COLS + col + dx] = true;
          return row * COLS + col;
        }
      }
      throw new Error('too many sign labels for the atlas');
    };
    // DynamicTexture flips Y: canvas row 0 is v = 1
    const rect = (x0: number, y0: number, w: number, h: number, rot = false): UvRect => ({
      u0: x0 / W,
      u1: (x0 + w) / W,
      v1: 1 - y0 / H,
      v0: 1 - (y0 + h) / H,
      ...(rot ? { rot: true } : {}),
    });
    for (const label of unique) {
      const n = alloc(1, 1);
      const x0 = (n % COLS) * CELL_W;
      const y0 = Math.floor(n / COLS) * CELL_H;
      this.drawCell(ctx, x0, y0, label, STYLES[label] ?? DEFAULT_STYLE);
      this.cells.set(label, rect(x0, y0, CELL_W, CELL_H));
    }
    for (const x of extras) {
      // a turned picture occupies h x w texels of the atlas
      const rw = x.tall ? x.h : x.w;
      const rh = x.tall ? x.w : x.h;
      const n = alloc(Math.ceil(rw / CELL_W), Math.ceil(rh / CELL_H));
      const x0 = (n % COLS) * CELL_W;
      const y0 = Math.floor(n / COLS) * CELL_H;
      ctx.save();
      if (x.tall) {
        const off = document.createElement('canvas');
        off.width = x.w;
        off.height = x.h;
        x.paint(off.getContext('2d')!, x.w, x.h);
        ctx.translate(x0, y0 + x.w);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(off, 0, 0);
      } else {
        ctx.translate(x0, y0);
        ctx.beginPath();
        ctx.rect(0, 0, x.w, x.h);
        ctx.clip();
        x.paint(ctx, x.w, x.h);
      }
      ctx.restore();
      this.cells.set(x.key, rect(x0, y0, rw, rh, x.tall));
    }
    this.usage = `${used.filter(Boolean).length - 1} of ${COLS * rows - 1} cells (${W}x${H})`;
    // the white cell is the last one: a degenerate rect at its centre
    const wc = rect((COLS - 1) * CELL_W + CELL_W / 2, (rows - 1) * CELL_H + CELL_H / 2, 0, 0);
    this.whiteRect = wc;
    this.texture.update(true);

    this.material = new StandardMaterial('signMat', scene);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveColor = new Color3(0.28, 0.28, 0.28);
    this.material.specularColor = Color3.Black();
    this.material.backFaceCulling = false;

    const pm = new StandardMaterial('paintMat', scene);
    pm.diffuseColor = Color3.White();
    pm.specularColor = Color3.Black();
    pm.opacityTexture = this.texture;
    this.texture.getAlphaFromRGB = true; // alpha = luminance of the cell: only the paint cells are looked up this way
    pm.transparencyMode = Material.MATERIAL_ALPHATEST;
    pm.alphaCutOff = 0.45;
    pm.backFaceCulling = false;
    pm.twoSidedLighting = true;
    pm.zOffset = -5;
    pm.zOffsetUnits = -10;
    this.paintMaterial = pm;
  }

  uv(label: string): UvRect {
    const r = this.cells.get(label);
    if (!r) throw new Error(`no sign for ${label}`);
    return r;
  }

  has(key: string): boolean {
    return this.cells.has(key);
  }

  /** A point inside a white cell: quads mapped here (all four corners) show only their vertex colour. */
  white(): UvRect {
    return this.whiteRect;
  }

  /** Road paint: glyphs stacked along the cell (u), the glyph tops pointing to -u, i.e. towards the stop line. */
  private drawPaint(ctx: CanvasRenderingContext2D, label: string): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CELL_W, CELL_H);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyphs = Array.from(label);
    const slot = CELL_W / glyphs.length;
    glyphs.forEach((ch, i) => {
      ctx.save();
      ctx.translate(slot * (i + 0.5), CELL_H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.scale(1, 1.4);
      ctx.font = `bold 100px ${FONT_STACK}`;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }

  private drawCell(ctx: CanvasRenderingContext2D, x0: number, y0: number, label: string, s: SignStyle): void {
    ctx.save();
    ctx.translate(x0, y0);
    if (s.draw) {
      s.draw(ctx, CELL_W, CELL_H, FONT_STACK);
      ctx.restore();
      return;
    }
    if (s.paint) {
      this.drawPaint(ctx, label);
      ctx.restore();
      return;
    }
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, CELL_W, CELL_H);
    // accent bands + inner frame
    if (s.accent) {
      ctx.fillStyle = s.accent;
      ctx.fillRect(0, 0, CELL_W, 9);
      ctx.fillRect(0, CELL_H - 9, CELL_W, 9);
    }
    ctx.strokeStyle = s.accent ?? s.fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 16, CELL_W - 24, CELL_H - 32);

    const iconW = s.icon ? 84 : 0;
    const maxW = CELL_W - 60 - iconW;
    let size = label.length <= 2 ? 88 : 84;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.fg;
    for (; size > 24; size -= 2) {
      ctx.font = `bold ${size}px ${FONT_STACK}`;
      if (ctx.measureText(label).width <= maxW) break;
    }
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    const cx = CELL_W / 2 + iconW / 2;
    ctx.fillText(label, cx, CELL_H / 2 + 3);

    if (s.icon === 'cross') {
      ctx.fillStyle = '#d12a2a';
      const ix = 62;
      ctx.fillRect(ix - 11, CELL_H / 2 - 32, 22, 64);
      ctx.fillRect(ix - 32, CELL_H / 2 - 11, 64, 22);
    } else if (s.icon === 'leaf') {
      ctx.fillStyle = s.accent ?? '#fff';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(62 + Math.cos(a) * 17, CELL_H / 2 + Math.sin(a) * 17, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(62, CELL_H / 2, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.icon === 'rail') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(30, CELL_H / 2 + 24);
      ctx.lineTo(94, CELL_H / 2 + 24);
      ctx.moveTo(40, CELL_H / 2 - 24);
      ctx.lineTo(84, CELL_H / 2 - 24);
      ctx.moveTo(48, CELL_H / 2 - 24);
      ctx.lineTo(36, CELL_H / 2 + 24);
      ctx.moveTo(76, CELL_H / 2 - 24);
      ctx.lineTo(88, CELL_H / 2 + 24);
      ctx.stroke();
    }
    ctx.restore();
  }
}
