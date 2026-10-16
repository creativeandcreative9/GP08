import { DynamicTexture, StandardMaterial, Texture, Color3, type Scene } from '@babylonjs/core';
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
};
const DEFAULT_STYLE: SignStyle = { bg: '#3b4a5a', fg: '#ffffff', accent: '#aab8c8' };

const CELL_W = 512;
const CELL_H = 128;
const COLS = 4;
const ROWS = 32;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** One texture atlas holding every signboard, so all signs share a single draw call. */
export class SignAtlas {
  readonly texture: DynamicTexture;
  readonly material: StandardMaterial;
  private cells = new Map<string, UvRect>();

  constructor(scene: Scene, labels: readonly string[]) {
    const W = CELL_W * COLS;
    const H = CELL_H * ROWS;
    this.texture = new DynamicTexture('signAtlas', { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.texture.anisotropicFilteringLevel = 8;
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    const unique = [...new Set(labels)];
    if (unique.length > COLS * ROWS) throw new Error('too many sign labels for the atlas');
    unique.forEach((label, n) => {
      const col = n % COLS;
      const row = Math.floor(n / COLS);
      this.drawCell(ctx, col * CELL_W, row * CELL_H, label, STYLES[label] ?? DEFAULT_STYLE);
      // DynamicTexture flips Y: canvas row 0 is v = 1
      this.cells.set(label, {
        u0: (col * CELL_W) / W,
        u1: ((col + 1) * CELL_W) / W,
        v1: 1 - (row * CELL_H) / H,
        v0: 1 - ((row + 1) * CELL_H) / H,
      });
    });
    this.texture.update(true);

    this.material = new StandardMaterial('signMat', scene);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveColor = new Color3(0.28, 0.28, 0.28);
    this.material.specularColor = Color3.Black();
    this.material.backFaceCulling = false;
  }

  uv(label: string): UvRect {
    const r = this.cells.get(label);
    if (!r) throw new Error(`no sign for ${label}`);
    return r;
  }

  private drawCell(ctx: CanvasRenderingContext2D, x0: number, y0: number, label: string, s: SignStyle): void {
    ctx.save();
    ctx.translate(x0, y0);
    if (s.draw) {
      s.draw(ctx, CELL_W, CELL_H, FONT_STACK);
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
