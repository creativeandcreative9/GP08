import { makeRng } from './util';

/**
 * Procedurally painted pictures for shops: signs with their own look, vertical banners, shelves full of goods,
 * posters, the noren curtain, the chalkboard... They are drawn once into the sign atlas (see signs.ts), so every
 * textured shop detail in the town shares one draw call. Nothing here depends on the 3D scene.
 */

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'IPAGothic', 'IPAPGothic', sans-serif";
const SERIF = "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'IPAMincho', 'Liberation Serif', 'Times New Roman', serif";

type G = CanvasRenderingContext2D;

export interface ExtraCell {
  key: string;
  /** Size of the picture in texels (for `tall` cells: the upright size, e.g. 128 x 512). */
  w: number;
  h: number;
  /** Painted upright, then stored turned by 90 degrees in the atlas (vertical signs and banners). */
  tall?: boolean;
  paint(g: G, w: number, h: number): void;
}

// ---------------------------------------------------------------------------------------------------------------------
// small drawing helpers

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function fillRR(g: G, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  rr(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}

function txt(g: G, s: string, x: number, y: number, size: number, fill: string, o: { weight?: string; font?: string; align?: CanvasTextAlign; stroke?: string; sw?: number; spacing?: number; maxW?: number } = {}): void {
  const font = o.font ?? FONT;
  let sz = size;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  if (o.maxW) {
    for (; sz > 10; sz -= 2) {
      g.font = `${o.weight ?? 'bold'} ${sz}px ${font}`;
      if (g.measureText(s).width <= o.maxW) break;
    }
  }
  g.font = `${o.weight ?? 'bold'} ${sz}px ${font}`;
  if (o.spacing) {
    // letter by letter (centred as a whole)
    const chars = [...s];
    const widths = chars.map((c) => g.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + o.spacing * (chars.length - 1);
    let cx = (o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2);
    g.textAlign = 'left';
    chars.forEach((c, i) => {
      if (o.stroke) {
        g.lineWidth = o.sw ?? 4;
        g.strokeStyle = o.stroke;
        g.lineJoin = 'round';
        g.strokeText(c, cx, y);
      }
      g.fillStyle = fill;
      g.fillText(c, cx, y);
      cx += widths[i]! + o.spacing!;
    });
    return;
  }
  if (o.stroke) {
    g.lineWidth = o.sw ?? 4;
    g.strokeStyle = o.stroke;
    g.lineJoin = 'round';
    g.strokeText(s, x, y);
  }
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

/** Vertical writing: one character per line, centred on cx; the long vowel mark is drawn as a vertical bar. */
function vtext(g: G, s: string, cx: number, y0: number, y1: number, size: number, fill: string, o: { stroke?: string; sw?: number } = {}): void {
  const chars = [...s];
  const step = Math.min(size * 1.08, (y1 - y0) / chars.length);
  const total = step * chars.length;
  let y = (y0 + y1) / 2 - total / 2 + step / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${size}px ${FONT}`;
  for (const c of chars) {
    if (c === 'ー' || c === '―') {
      const bw = size * 0.13;
      const bh = size * 0.78;
      if (o.stroke) {
        g.fillStyle = o.stroke;
        g.fillRect(cx - bw / 2 - (o.sw ?? 3) / 2, y - bh / 2 - (o.sw ?? 3) / 2, bw + (o.sw ?? 3), bh + (o.sw ?? 3));
      }
      g.fillStyle = fill;
      g.fillRect(cx - bw / 2, y - bh / 2, bw, bh);
    } else {
      if (o.stroke) {
        g.lineWidth = o.sw ?? 4;
        g.strokeStyle = o.stroke;
        g.lineJoin = 'round';
        g.strokeText(c, cx, y);
      }
      g.fillStyle = fill;
      g.fillText(c, cx, y);
    }
    y += step;
  }
}

/** A plain rectangle with a slightly lighter top edge and darker bottom edge: boxes, books, packages. */
function pack(g: G, x: number, y: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x, y, w, Math.max(2, h * 0.12));
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x, y + h - Math.max(2, h * 0.1), w, Math.max(2, h * 0.1));
}

const POP = ['#e8453c', '#f2a93b', '#f6d44a', '#4aa86a', '#3c8fd9', '#8a5bc4', '#ee7aa6', '#f4f0e6', '#33b5b0', '#c9573a', '#2b5aa8'];

type Item = 'box' | 'bottle' | 'can' | 'bag';

function item(g: G, kind: Item, x: number, y: number, w: number, h: number, col: string): void {
  if (kind === 'box') {
    pack(g, x, y, w, h, col);
    g.fillStyle = '#ffffff';
    g.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.26);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x + w * 0.25, y + h * 0.44, w * 0.5, Math.max(2, h * 0.06));
  } else if (kind === 'bottle') {
    const bw = w * 0.62;
    const bx = x + (w - bw) / 2;
    fillRR(g, bx, y + h * 0.22, bw, h * 0.78, 3, col);
    g.fillStyle = col;
    g.fillRect(bx + bw * 0.3, y + h * 0.04, bw * 0.4, h * 0.2);
    g.fillStyle = '#f4f4f4';
    g.fillRect(bx + bw * 0.26, y, bw * 0.48, h * 0.07);
    g.fillStyle = '#ffffff';
    g.fillRect(bx, y + h * 0.5, bw, h * 0.22);
  } else if (kind === 'can') {
    pack(g, x + 1, y + h * 0.15, w - 2, h * 0.85, col);
    g.fillStyle = '#dcdcdc';
    g.fillRect(x + 1, y + h * 0.15, w - 2, 3);
    g.fillStyle = '#ffffff';
    g.fillRect(x + 1, y + h * 0.5, w - 2, h * 0.16);
  } else {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x + 1, y + h * 0.14);
    g.lineTo(x + w * 0.5, y);
    g.lineTo(x + w - 1, y + h * 0.14);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(x + w * 0.18, y + h * 0.38, w * 0.64, h * 0.3);
  }
}

/** Shelves seen from the front, `rows` boards, filled with goods. */
function goods(g: G, w: number, h: number, seed: number, rows: number, kinds: Item[], back = '#f1eee6', boards = '#d6d1c6'): void {
  const r = makeRng(seed);
  g.fillStyle = back;
  g.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let k = 0; k < rows; k++) {
    const yb = (k + 1) * rh;
    let x = 3;
    while (x < w - 8) {
      const iw = 11 + Math.floor(r() * 17);
      const ih = rh * (0.5 + r() * 0.3);
      const col = POP[Math.floor(r() * POP.length)]!;
      const kind = kinds[Math.floor(r() * kinds.length)]!;
      item(g, kind, x, yb - 8 - ih, iw - 2, ih, col);
      x += iw;
    }
    g.fillStyle = boards;
    g.fillRect(0, yb - 8, w, 8);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, yb - 2, w, 2);
    // price tags
    for (let t = 0; t < w; t += 38) {
      g.fillStyle = r() < 0.5 ? '#ffe45c' : '#ffffff';
      g.fillRect(t + 3, yb - 7, 20, 5);
    }
  }
}

function woodGrain(g: G, x: number, y: number, w: number, h: number, base: string, dark: string, seed: number, horizontal = true): void {
  const r = makeRng(seed);
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.strokeStyle = dark;
  g.lineWidth = 1;
  g.globalAlpha = 0.35;
  const n = Math.floor((horizontal ? h : w) / 3);
  for (let i = 0; i < n; i++) {
    g.beginPath();
    if (horizontal) {
      const yy = y + r() * h;
      g.moveTo(x, yy);
      g.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 3, x + w * 0.6, yy + (r() - 0.5) * 3, x + w, yy + (r() - 0.5) * 2);
    } else {
      const xx = x + r() * w;
      g.moveTo(xx, y);
      g.bezierCurveTo(xx + (r() - 0.5) * 3, y + h * 0.3, xx + (r() - 0.5) * 3, y + h * 0.6, xx + (r() - 0.5) * 2, y + h);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// signs with their own look

/** The lettering of the navy 和菓子 signboard; the board itself (navy box and its white edge lines) is geometry. */
function paintWagashiSign(g: G, w: number, h: number): void {
  g.fillStyle = '#1c2d5e';
  g.fillRect(0, 0, w, h);
  // faint grain, like painted wood
  const r = makeRng(31);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 90; i++) g.fillRect(r() * w, r() * h, 20 + r() * 60, 1);
  txt(g, '和菓子', w / 2, h / 2 + 3, 104, '#fbf8ee', { spacing: 46, font: SERIF });
}

function paintOpenPlaque(g: G, w: number, h: number): void {
  woodGrain(g, 0, 0, w, h, '#70492c', '#3a2214', 5);
  g.strokeStyle = '#d9b27c';
  g.lineWidth = 5;
  g.strokeRect(6, 6, w - 12, h - 12);
  txt(g, '営業中', w / 2, h / 2 + 3, 76, '#f6ead2', { spacing: 14 });
}

function paintHidamari(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  // sun mark
  const sx = 62;
  const sy = h / 2 - 2;
  g.fillStyle = '#f7a21b';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(sx + Math.cos(a - 0.12) * 30, sy + Math.sin(a - 0.12) * 30);
    g.lineTo(sx + Math.cos(a) * 46, sy + Math.sin(a) * 46);
    g.lineTo(sx + Math.cos(a + 0.12) * 30, sy + Math.sin(a + 0.12) * 30);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(sx, sy, 27, 0, Math.PI * 2);
  g.fillStyle = '#ffc93c';
  g.fill();
  txt(g, 'HIDAMARI MART', 308, 25, 18, '#237a65', { maxW: 376 });
  txt(g, 'ひだまりマート', 308, 73, 64, '#11883f', { stroke: '#ffffff', sw: 3, maxW: 376 });
  // bottom stripes
  g.fillStyle = '#11883f';
  g.fillRect(0, h - 15, w, 8);
  g.fillStyle = '#237a65';
  g.fillRect(0, h - 7, w, 7);
  g.fillStyle = '#11883f';
  g.fillRect(0, 0, w, 6);
}

/** The convenience store's hanging blade sign: sun mark, two columns of lettering, green and blue stripes. */
function paintHidamariTall(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#11883f';
  g.fillRect(0, 0, w, 16);
  const sx = w / 2;
  const sy = 70;
  g.fillStyle = '#f7a21b';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(sx + Math.cos(a - 0.13) * 28, sy + Math.sin(a - 0.13) * 28);
    g.lineTo(sx + Math.cos(a) * 42, sy + Math.sin(a) * 42);
    g.lineTo(sx + Math.cos(a + 0.13) * 28, sy + Math.sin(a + 0.13) * 28);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(sx, sy, 25, 0, Math.PI * 2);
  g.fillStyle = '#ffc93c';
  g.fill();
  // vertical writing: the right-hand column is read first
  vtext(g, 'ひだまり', w * 0.71, 128, 420, 52, '#11883f', { stroke: '#ffffff', sw: 3 });
  vtext(g, 'マート', w * 0.31, 128, 420, 52, '#1779c4', { stroke: '#ffffff', sw: 3 });
  g.fillStyle = '#1779c4';
  g.fillRect(0, h - 40, w, 14);
  g.fillStyle = '#11883f';
  g.fillRect(0, h - 26, w, 26);
}

function paintCafeSign(g: G, w: number, h: number): void {
  woodGrain(g, 0, 0, w, h, '#5a3a26', '#2c180c', 11);
  g.strokeStyle = '#e8d5ae';
  g.lineWidth = 3;
  g.strokeRect(8, 8, w - 16, h - 16);
  txt(g, '喫茶 はるいろ', w / 2 + 34, 52, 62, '#f7ecd4', { maxW: 350, spacing: 4 });
  txt(g, 'Café Haruiro', w / 2 + 34, 101, 30, '#e9c98f', { font: SERIF, weight: 'italic bold', maxW: 300, spacing: 4 });
  // coffee cup mark
  const cx = 62;
  const cy = h / 2 + 2;
  g.fillStyle = '#f7ecd4';
  g.beginPath();
  g.moveTo(cx - 24, cy - 14);
  g.lineTo(cx + 18, cy - 14);
  g.lineTo(cx + 14, cy + 16);
  g.quadraticCurveTo(cx - 3, cy + 26, cx - 20, cy + 16);
  g.closePath();
  g.fill();
  g.strokeStyle = '#f7ecd4';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx + 20, cy, 9, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.strokeStyle = '#e9c98f';
  g.lineWidth = 3;
  for (const dx of [-10, 2]) {
    g.beginPath();
    g.moveTo(cx + dx, cy - 22);
    g.bezierCurveTo(cx + dx + 8, cy - 30, cx + dx - 8, cy - 38, cx + dx, cy - 46);
    g.stroke();
  }
}

function paintOpenSign(g: G, w: number, h: number): void {
  woodGrain(g, 0, 0, w, h, '#e9d3a6', '#a07a44', 17);
  g.strokeStyle = '#6a4326';
  g.lineWidth = 6;
  g.strokeRect(4, 4, w - 8, h - 8);
  txt(g, 'OPEN', w / 2, h / 2 + 2, 70, '#7b2a1e', { font: SERIF, weight: 'bold', spacing: 12 });
}

// ---------------------------------------------------------------------------------------------------------------------
// vertical signs and banners (painted upright, stored turned)

export function paintTallText(g: G, w: number, h: number, text: string, st: { bg: string; fg: string; accent?: string }): void {
  g.fillStyle = st.bg;
  g.fillRect(0, 0, w, h);
  if (st.accent) {
    g.fillStyle = st.accent;
    g.fillRect(0, 0, 9, h);
    g.fillRect(w - 9, 0, 9, h);
  }
  g.strokeStyle = st.accent ?? st.fg;
  g.lineWidth = 3;
  g.strokeRect(18, 12, w - 36, h - 24);
  const n = [...text].length;
  const size = Math.min(w - 46, (h - 56) / n / 1.05);
  vtext(g, text, w / 2, 26, h - 26, size, st.fg);
}

function paintTaiyaki(g: G, w: number, h: number): void {
  g.fillStyle = '#fbf0d6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d96a1d';
  g.fillRect(0, 0, 9, h);
  g.fillRect(w - 9, 0, 9, h);
  g.strokeStyle = '#d96a1d';
  g.lineWidth = 3;
  g.strokeRect(18, 12, w - 36, h - 24);
  // the fish
  const cx = w / 2;
  const cy = 88;
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#c4731f';
  g.beginPath();
  g.ellipse(0, 0, 44, 25, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-36, 0);
  g.lineTo(-62, -22);
  g.lineTo(-58, 0);
  g.lineTo(-62, 22);
  g.closePath();
  g.fill();
  g.strokeStyle = '#8a4a12';
  g.lineWidth = 2.5;
  for (let k = -3; k <= 3; k++) {
    g.beginPath();
    g.arc(-4 + k * 9, 0, 14, -1.1, 1.1);
    g.stroke();
  }
  g.fillStyle = '#2a1a0c';
  g.beginPath();
  g.arc(30, -8, 4, 0, Math.PI * 2);
  g.fill();
  g.restore();
  vtext(g, 'たい焼き', cx, 150, h - 26, 70, '#b63a14', { stroke: '#fbf0d6', sw: 2 });
}

function paintKanmi(g: G, w: number, h: number): void {
  g.fillStyle = '#7a1f2b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8c35a';
  g.fillRect(0, 0, 9, h);
  g.fillRect(w - 9, 0, 9, h);
  g.strokeStyle = '#e8c35a';
  g.lineWidth = 3;
  g.strokeRect(18, 12, w - 36, h - 24);
  vtext(g, '甘味処', w / 2, 40, h - 90, 78, '#fbf0d6');
  // small lantern-like mark at the foot
  g.fillStyle = '#e8c35a';
  g.beginPath();
  g.arc(w / 2, h - 58, 20, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a1f2b';
  g.beginPath();
  g.arc(w / 2, h - 58, 11, 0, Math.PI * 2);
  g.fill();
}

function banner(text: string, bg: string, fg: string, stroke: string, band: string): ExtraCell {
  return {
    key: `n:${text}`,
    w: 128,
    h: 512,
    tall: true,
    paint(g, w, h) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = band;
      g.fillRect(0, 0, w, 26);
      g.fillRect(0, h - 22, w, 22);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(8, 34, 5, h - 70);
      g.fillRect(w - 13, 34, 5, h - 70);
      const n = [...text].length;
      const size = Math.min(w - 44, (h - 130) / n / 1.04);
      vtext(g, text, w / 2, 44, h - 36, size, fg, { stroke, sw: 7 });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// shelves, cases and walls (interiors)

function paintWagashiShelf(g: G, w: number, h: number): void {
  g.fillStyle = '#e9d2a2';
  g.fillRect(0, 0, w, h);
  const rows = 3;
  const rh = h / rows;
  const r = makeRng(77);
  for (let k = 0; k < rows; k++) {
    const yb = (k + 1) * rh;
    let x = 6;
    while (x < w - 20) {
      const t = r();
      const iw = 24 + Math.floor(r() * 26);
      const ih = rh * (0.52 + r() * 0.25);
      if (t < 0.45) {
        // white gift box with a ribbon
        pack(g, x, yb - 8 - ih, iw, ih, '#f6f1e6');
        g.fillStyle = r() < 0.5 ? '#c8362f' : '#2b4a8c';
        g.fillRect(x + iw * 0.45, yb - 8 - ih, iw * 0.1, ih);
        g.fillRect(x, yb - 8 - ih * 0.55, iw, ih * 0.1);
      } else if (t < 0.7) {
        // tea canister
        fillRR(g, x, yb - 8 - ih, iw * 0.8, ih, 4, '#2c3c64');
        g.fillStyle = '#e8d9b0';
        g.fillRect(x + 3, yb - 8 - ih * 0.7, iw * 0.8 - 6, ih * 0.3);
      } else {
        pack(g, x, yb - 8 - ih, iw, ih, ['#e98aa8', '#9ccb7a', '#f0d36a', '#b9a0d8'][Math.floor(r() * 4)]!);
      }
      x += iw + 4 + r() * 8;
    }
    g.fillStyle = '#5a3a24';
    g.fillRect(0, yb - 8, w, 8);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, yb - 2, w, 2);
  }
  g.fillStyle = '#4a2f1e';
  g.fillRect(0, 0, 8, h);
  g.fillRect(w - 8, 0, 8, h);
}

function paintWagashiCase(g: G, w: number, h: number): void {
  // front of a glass display case: dark wood frame, warm light, trays of sweets
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fff3d6');
  bg.addColorStop(1, '#f2dcae');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const r = makeRng(41);
  const rows = 2;
  const rh = h / rows;
  for (let k = 0; k < rows; k++) {
    const yb = (k + 1) * rh - 6;
    g.fillStyle = '#6a4a30';
    g.fillRect(0, yb, w, 6);
    let x = 12;
    while (x < w - 26) {
      const t = Math.floor(r() * 6);
      const s = 17 + r() * 9;
      const cx = x + s / 2;
      if (t === 0) {
        g.fillStyle = '#f6a6bd'; // pink daifuku
        g.beginPath(); g.ellipse(cx, yb - s * 0.4, s * 0.6, s * 0.42, 0, 0, Math.PI * 2); g.fill();
      } else if (t === 1) {
        g.fillStyle = '#f7f3e8'; // white manju
        g.beginPath(); g.ellipse(cx, yb - s * 0.4, s * 0.6, s * 0.44, 0, Math.PI, Math.PI * 2); g.fill();
        g.fillRect(cx - s * 0.6, yb - s * 0.4, s * 1.2, s * 0.4);
      } else if (t === 2) {
        g.fillStyle = '#8b9a52'; // green mochi
        g.beginPath(); g.ellipse(cx, yb - s * 0.4, s * 0.58, s * 0.4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f6efe0'; g.fillRect(cx - s * 0.4, yb - s * 0.55, s * 0.8, s * 0.14);
      } else if (t === 3) {
        g.fillStyle = '#7a3b24'; // dorayaki
        g.beginPath(); g.ellipse(cx, yb - s * 0.38, s * 0.62, s * 0.42, 0, Math.PI, Math.PI * 2); g.fill();
        g.fillStyle = '#c7924d'; g.fillRect(cx - s * 0.62, yb - s * 0.38, s * 1.24, s * 0.16);
      } else if (t === 4) {
        for (let d = 0; d < 3; d++) {
          g.fillStyle = ['#f08fb0', '#fff7ea', '#9ec46c'][d]!; // dango
          g.beginPath(); g.arc(cx, yb - s * (0.26 + d * 0.5), s * 0.26, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.fillStyle = '#3a1f1a'; // yokan
        g.fillRect(cx - s * 0.65, yb - s * 0.5, s * 1.3, s * 0.5);
      }
      x += s + 7 + r() * 8;
    }
  }
  // price cards
  for (let x = 26; x < w - 40; x += 74) {
    g.fillStyle = '#ffffff';
    g.fillRect(x, 8, 34, 14);
    g.fillStyle = '#b3372e';
    g.fillRect(x + 4, 13, 26, 4);
  }
  g.strokeStyle = '#4a2f1e';
  g.lineWidth = 8;
  g.strokeRect(0, 0, w, h);
}

function paintNoren(g: G, w: number, h: number): void {
  const panel = w / 3;
  const chars = ['和', '菓', '子'];
  for (let i = 0; i < 3; i++) {
    const x = i * panel;
    g.fillStyle = '#1c2f63';
    g.fillRect(x + 3, 0, panel - 6, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 14; k++) g.fillRect(x + 6 + k * (panel / 14), 0, 1, h);
    g.fillStyle = '#f4f1e6';
    g.fillRect(x + 3, h - 20, panel - 6, 5);
    g.fillRect(x + 3, 10, panel - 6, 4);
    txt(g, chars[i]!, x + panel / 2, h * 0.5, panel * 0.7, '#f7f4ea', { font: SERIF });
  }
}

function paintOshinagaki(g: G, w: number, h: number): void {
  // a wall board listing the sweets: paper strips with vertical brush-like writing
  woodGrain(g, 0, 0, w, h, '#6b4429', '#2a160a', 9, false);
  const names = ['どら焼き', '大福', '団子', '饅頭', '羊羹', '最中', '季節の生菓子'];
  const n = names.length;
  const sw = (w - 24) / n;
  names.forEach((s, i) => {
    const x = 12 + i * sw;
    g.fillStyle = '#f6efe0';
    g.fillRect(x + 3, 12, sw - 6, h - 24);
    vtext(g, s, x + sw / 2, 18, h - 18, Math.min(sw - 12, 26), '#2a1f18');
  });
}

function paintChalk(g: G, w: number, h: number): void {
  // A-frame chalkboard: wooden frame, dark board, chalk writing
  woodGrain(g, 0, 0, w, h, '#a8723c', '#5a3818', 21);
  g.fillStyle = '#23302b';
  g.fillRect(10, 10, w - 20, h - 20);
  const r = makeRng(3);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect(12 + r() * (w - 40), 12 + r() * (h - 40), 24 + r() * 50, 4 + r() * 8);
  txt(g, "Today's", w / 2, 36, 28, '#f5f1e4', { font: SERIF, weight: 'italic bold' });
  txt(g, 'Special', w / 2, 64, 28, '#f5f1e4', { font: SERIF, weight: 'italic bold' });
  g.strokeStyle = '#f5d98a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(34, 84);
  g.lineTo(w - 34, 84);
  g.stroke();
  txt(g, '本日のケーキ', w / 2, 108, 19, '#f5f1e4', { weight: 'normal', maxW: w - 40 });
  txt(g, 'ブレンド ¥450', w / 2, 135, 19, '#f7d9e3', { weight: 'normal', maxW: w - 40 });
  txt(g, 'ケーキセット ¥800', w / 2, 162, 19, '#f5f1e4', { weight: 'normal', maxW: w - 40 });
  // cup doodle
  g.strokeStyle = '#f5f1e4';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(w / 2 - 22, 190);
  g.lineTo(w / 2 + 14, 190);
  g.lineTo(w / 2 + 10, 216);
  g.quadraticCurveTo(w / 2 - 4, 224, w / 2 - 18, 216);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(w / 2 + 17, 199, 7, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.fillStyle = '#f2a0b8';
  g.beginPath();
  g.arc(w - 42, 214, 7, 0, Math.PI * 2);
  g.arc(w - 29, 214, 7, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(w - 50, 217);
  g.lineTo(w - 35.5, 232);
  g.lineTo(w - 21, 217);
  g.fill();
}

function paintCoolers(g: G, w: number, h: number): void {
  const r = makeRng(55);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f4fbff');
  bg.addColorStop(1, '#cfe6f2');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const rows = 4;
  const rh = h / rows;
  for (let k = 0; k < rows; k++) {
    const yb = (k + 1) * rh;
    let x = 4;
    while (x < w - 10) {
      const iw = 11 + Math.floor(r() * 5);
      const col = POP[Math.floor(r() * POP.length)]!;
      item(g, r() < 0.7 ? 'bottle' : 'can', x, yb - 5 - rh * 0.78, iw, rh * 0.74, col);
      x += iw + 1;
    }
    g.fillStyle = '#b8c8d2';
    g.fillRect(0, yb - 5, w, 5);
  }
  // door frames
  g.fillStyle = '#5c6770';
  for (let x = 0; x <= w; x += w / 4) g.fillRect(Math.min(x, w - 6), 0, 6, h);
  g.fillRect(0, 0, w, 6);
}

function paintMagazines(g: G, w: number, h: number): void {
  const r = makeRng(63);
  g.fillStyle = '#e8e4da';
  g.fillRect(0, 0, w, h);
  const rows = 2;
  const rh = h / rows;
  for (let k = 0; k < rows; k++) {
    let x = 4;
    while (x < w - 20) {
      const mw = 26 + r() * 6;
      const mh = rh - 10;
      const col = POP[Math.floor(r() * POP.length)]!;
      g.fillStyle = col;
      g.fillRect(x, k * rh + 6, mw, mh);
      g.fillStyle = '#ffffff';
      g.fillRect(x + 3, k * rh + 9, mw - 6, 9);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + 3, k * rh + 21, mw * 0.5, 4);
      g.fillStyle = POP[Math.floor(r() * POP.length)]!;
      g.fillRect(x + 4, k * rh + 28, mw - 8, mh * 0.45);
      x += mw + 3;
    }
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, (k + 1) * rh - 4, w, 4);
  }
}

/** A plain shop wall (salon, clinic, cram school...): pale wall, framed pictures, a clock, a skirting board. */
function paintPlainWall(g: G, w: number, h: number): void {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fbf8f0');
  bg.addColorStop(1, '#ece6d8');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const frame = (x: number, y: number, fw: number, fh: number, c1: string, c2: string): void => {
    g.fillStyle = '#7a5a3c';
    g.fillRect(x - 4, y - 4, fw + 8, fh + 8);
    const gr = g.createLinearGradient(0, y, 0, y + fh);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.fillRect(x, y, fw, fh);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(x + fw * 0.7, y + fh * 0.3, fh * 0.14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(70,110,80,0.7)';
    g.beginPath();
    g.moveTo(x, y + fh);
    g.lineTo(x + fw * 0.35, y + fh * 0.45);
    g.lineTo(x + fw * 0.6, y + fh * 0.75);
    g.lineTo(x + fw * 0.8, y + fh * 0.55);
    g.lineTo(x + fw, y + fh);
    g.closePath();
    g.fill();
  };
  frame(36, 22, 70, 56, '#bfe0ef', '#e8f3d8');
  frame(318, 26, 104, 50, '#f6d9c8', '#f0e6b8');
  // wall clock
  g.fillStyle = '#4a3a2c';
  g.beginPath();
  g.arc(222, 50, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fffdf6';
  g.beginPath();
  g.arc(222, 50, 23, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2018';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(222, 50);
  g.lineTo(222, 33);
  g.moveTo(222, 50);
  g.lineTo(234, 56);
  g.stroke();
  // notice board
  g.fillStyle = '#8fb08a';
  g.fillRect(446, 24, 54, 62);
  g.fillStyle = '#ffffff';
  for (const [x, y] of [[452, 30], [474, 34], [456, 56], [478, 62]] as const) g.fillRect(x, y, 18, 22);
  // skirting board
  g.fillStyle = '#b9a98c';
  g.fillRect(0, h - 14, w, 14);
}

/** Buckets of cut flowers (florist). */
function paintFlowerShelf(g: G, w: number, h: number): void {
  const r = makeRng(909);
  g.fillStyle = '#eef3e6';
  g.fillRect(0, 0, w, h);
  const rows = 2;
  const rh = h / rows;
  const cols = ['#f08fb0', '#f7d94c', '#fafafa', '#e9604f', '#b89ae0', '#f6a860', '#7fc4e8'];
  for (let k = 0; k < rows; k++) {
    const yb = (k + 1) * rh - 6;
    for (let x = 6; x < w - 40; x += 52) {
      g.fillStyle = '#9aa4aa';
      g.fillRect(x + 4, yb - 20, 38, 20);
      g.fillStyle = '#6d777d';
      g.fillRect(x + 4, yb - 20, 38, 4);
      g.strokeStyle = '#4f9a48';
      g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const sx = x + 10 + i * 4.5;
        g.beginPath();
        g.moveTo(sx, yb - 20);
        g.lineTo(sx + (i - 3) * 2.5, yb - 40 - r() * 8);
        g.stroke();
      }
      for (let i = 0; i < 9; i++) {
        g.fillStyle = cols[Math.floor(r() * cols.length)]!;
        g.beginPath();
        g.arc(x + 8 + r() * 30, yb - 42 - r() * 14, 5 + r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#c8b690';
    g.fillRect(0, yb, w, 6);
  }
}

function paintBrick(g: G, w: number, h: number): void {
  const r = makeRng(8);
  g.fillStyle = '#d9cdb8';
  g.fillRect(0, 0, w, h);
  const bh = 15;
  const bw = 34;
  for (let row = 0; row * bh < h; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < w + bw; x += bw) {
      const cr = 150 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${cr},${Math.floor(cr * 0.42)},${Math.floor(cr * 0.3)})`;
      g.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  }
}

function paintDeck(g: G, w: number, h: number): void {
  const r = makeRng(14);
  const pl = 10;
  for (let y = 0; y < h; y += pl) {
    const t = 0.9 + r() * 0.2;
    g.fillStyle = `rgb(${Math.floor(196 * t)},${Math.floor(146 * t)},${Math.floor(92 * t)})`;
    g.fillRect(0, y, w, pl - 1.5);
    g.fillStyle = 'rgba(60,34,12,0.9)';
    g.fillRect(0, y + pl - 1.5, w, 1.5);
    g.fillStyle = 'rgba(90,52,20,0.22)';
    for (let k = 0; k < 6; k++) g.fillRect(r() * w, y + 2 + r() * (pl - 5), 20 + r() * 60, 1);
    // butt joints
    const j = r() * w;
    g.fillStyle = 'rgba(60,34,12,0.8)';
    g.fillRect(j, y, 1.5, pl - 1.5);
  }
}

function paintFloorWood(g: G, w: number, h: number): void {
  const r = makeRng(23);
  const pl = 9;
  for (let y = 0; y < h; y += pl) {
    const t = 0.88 + r() * 0.2;
    g.fillStyle = `rgb(${Math.floor(176 * t)},${Math.floor(124 * t)},${Math.floor(72 * t)})`;
    g.fillRect(0, y, w, pl - 1);
    g.fillStyle = 'rgba(50,28,10,0.75)';
    g.fillRect(0, y + pl - 1, w, 1);
    const j = r() * w;
    g.fillRect(j, y, 1, pl - 1);
  }
}

function paintTileFloor(g: G, w: number, h: number): void {
  g.fillStyle = '#f4f3ee';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d3d5d6';
  const n = 4;
  for (let i = 0; i <= n; i++) {
    g.fillRect((i * w) / n - 1, 0, 2, h);
    g.fillRect(0, (i * h) / n - 1, w, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillRect(0, 0, w, h * 0.12);
}

function poster(key: string, paint: (g: G, w: number, h: number) => void): ExtraCell {
  return { key, w: 96, h: 128, paint };
}

function paintPosters(): ExtraCell[] {
  return [
    poster('p:sale', (g, w, h) => {
      g.fillStyle = '#d8312b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe14d';
      g.fillRect(0, 0, w, 18);
      txt(g, 'SALE', w / 2, 52, 40, '#ffe14d', { font: SERIF, stroke: '#7a120e', sw: 5 });
      txt(g, '全品', w / 2, 88, 26, '#ffffff', { maxW: 80 });
      txt(g, '20%OFF', w / 2, 112, 24, '#ffffff', { maxW: 84 });
    }),
    poster('p:onigiri', (g, w, h) => {
      g.fillStyle = '#e7f3dc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(w / 2, 22);
      g.lineTo(w / 2 + 34, 78);
      g.quadraticCurveTo(w / 2, 90, w / 2 - 34, 78);
      g.closePath();
      g.fill();
      g.fillStyle = '#1e2b24';
      g.fillRect(w / 2 - 17, 60, 34, 22);
      txt(g, 'おにぎり', w / 2, 104, 22, '#2e7a3c', { maxW: 84 });
      txt(g, '120円', w / 2, 122, 14, '#c8281e', { maxW: 80 });
    }),
    poster('p:new', (g, w, h) => {
      g.fillStyle = '#ffd238';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ee5b2c';
      g.fillRect(0, 0, w, 32);
      txt(g, '新発売', w / 2, 17, 26, '#ffffff', { maxW: 84 });
      item(g, 'bottle', w / 2 - 14, 40, 28, 62, '#2f9a58');
      txt(g, 'いまだけ', w / 2, 116, 18, '#7a2a10', { maxW: 80 });
    }),
    poster('p:coffee', (g, w, h) => {
      g.fillStyle = '#5a3a28';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3e3c8';
      g.beginPath();
      g.moveTo(w / 2 - 26, 40);
      g.lineTo(w / 2 + 22, 40);
      g.lineTo(w / 2 + 17, 84);
      g.quadraticCurveTo(w / 2 - 4, 96, w / 2 - 22, 84);
      g.closePath();
      g.fill();
      g.strokeStyle = '#f3e3c8';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(w / 2 + 24, 58, 11, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      txt(g, 'いれたて', w / 2, 18, 18, '#f3e3c8', { maxW: 80 });
      txt(g, 'COFFEE', w / 2, 112, 18, '#f3e3c8', { font: SERIF, maxW: 80 });
    }),
    poster('p:atm', (g, w, h) => {
      g.fillStyle = '#1b6fc2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      txt(g, 'ATM', w / 2, 44, 38, '#ffffff', { maxW: 82 });
      g.beginPath();
      g.arc(w / 2, 90, 24, 0, Math.PI * 2);
      g.fill();
      txt(g, '¥', w / 2, 90, 32, '#1b6fc2');
      txt(g, '24時間', w / 2, 122, 14, '#ffffff', { maxW: 80 });
    }),
    poster('p:oden', (g, w, h) => {
      g.fillStyle = '#f7d7c4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8561f';
      g.fillRect(0, 0, w, 36);
      txt(g, 'あったか', w / 2, 19, 20, '#ffffff', { maxW: 82 });
      g.fillStyle = '#e8c66e';
      g.beginPath();
      g.ellipse(w / 2, 82, 34, 24, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff7e2';
      for (const [dx, dy] of [[-12, 76], [8, 70], [4, 90]] as const) {
        g.beginPath();
        g.arc(w / 2 + dx, dy, 9, 0, Math.PI * 2);
        g.fill();
      }
      txt(g, 'おでん', w / 2, 116, 20, '#8a2a10', { maxW: 80 });
    }),
  ];
}

/** Every picture painted for the shops (generic signs and labels are added by the sign atlas itself). */
export const EXTRAS: readonly ExtraCell[] = [
  { key: '和菓子', w: 512, h: 128, paint: paintWagashiSign },
  { key: '営業中', w: 384, h: 128, paint: paintOpenPlaque },
  { key: 'ひだまりマート', w: 512, h: 128, paint: paintHidamari },
  { key: '喫茶 はるいろ', w: 512, h: 128, paint: paintCafeSign },
  { key: 'OPEN', w: 256, h: 128, paint: paintOpenSign },
  { key: 'v:たい焼き', w: 128, h: 512, tall: true, paint: paintTaiyaki },
  { key: 'v:甘味処', w: 128, h: 512, tall: true, paint: paintKanmi },
  { key: 'v:ひだまりマート', w: 128, h: 512, tall: true, paint: paintHidamariTall },
  banner('営業中', '#c8281e', '#ffffff', '#7a120e', '#ffffff'),
  banner('ラーメン', '#c8281e', '#fff2b0', '#6a1008', '#ffe066'),
  banner('新発売', '#f2b411', '#c8281e', '#ffffff', '#c8281e'),
  banner('セール', '#1f64b4', '#ffffff', '#0c2c5a', '#ffe066'),
  banner('餃子', '#2f8a4a', '#ffffff', '#0e3a1c', '#f6e08a'),
  banner('お弁当', '#e8731f', '#ffffff', '#6a2c08', '#ffffff'),
  ...paintPosters(),
  { key: 'in:goods', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 101, 4, ['box', 'bottle', 'can', 'bag']) },
  { key: 'in:snacks', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 202, 4, ['bag', 'box', 'bag', 'can'], '#f6f2e8', '#e4dfd2') },
  { key: 'in:bottles', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 303, 3, ['bottle', 'bottle', 'can'], '#3a2a20', '#6a4a30') },
  { key: 'in:bread', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 404, 3, ['bag', 'box'], '#f6e6c8', '#a8743c') },
  { key: 'in:books', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 505, 4, ['box'], '#efe8da', '#8a6a44') },
  { key: 'in:clothes', w: 512, h: 128, paint: (g, w, h) => goods(g, w, h, 606, 3, ['bag', 'box'], '#f1eef2', '#c9c2cc') },
  { key: 'in:plain', w: 512, h: 128, paint: paintPlainWall },
  { key: 'in:flowers', w: 512, h: 128, paint: paintFlowerShelf },
  { key: 'in:wagashi', w: 512, h: 128, paint: paintWagashiShelf },
  { key: 'case:wagashi', w: 512, h: 128, paint: paintWagashiCase },
  { key: 'cooler', w: 512, h: 128, paint: paintCoolers },
  { key: 'rack:mag', w: 512, h: 128, paint: paintMagazines },
  { key: 'noren:wagashi', w: 384, h: 256, paint: paintNoren },
  { key: 'menu:wagashi', w: 512, h: 128, paint: paintOshinagaki },
  { key: 'chalk:cafe', w: 192, h: 256, paint: paintChalk },
  { key: 'brick', w: 256, h: 128, paint: paintBrick },
  { key: 'deck', w: 256, h: 128, paint: paintDeck },
  { key: 'floor:wood', w: 256, h: 128, paint: paintFloorWood },
  { key: 'floor:tile', w: 128, h: 128, paint: paintTileFloor },
  { key: 'awning:cafe', w: 512, h: 128, paint: (g, w, h) => {
    g.fillStyle = '#8b3445'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8a8a6'; g.lineWidth = 2; g.strokeRect(0, 12, w, h - 24);
    txt(g, 'Café Haruiro', w * .5, 82, 64, '#f7e9d2', { font: SERIF, weight: 'italic bold', maxW: w - 40 });
  } },
];
