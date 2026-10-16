import type { SignStyle } from './signs';

/**
 * Atlas artwork for street furniture: road signs, address plates, pole adverts, vending machine fronts and the
 * yellow/black stripe of the pole guard sleeve. The atlas cells are 512 x 128; most of these cells hold four
 * 128 x 128 "tiles" (so that one cell serves four different signs) and are mapped with `tileUv`.
 * Nothing here depends on the scene: it only draws into a canvas.
 */

export const SIGN = {
  road: 'sign:road', // tiles: stop (止まれ), speed limit 30, pedestrian crossing, no stopping
  misc: 'sign:misc', // tiles: curve mirror, school zone, post box plate, "横断歩道" sub plate
  ads: 'sign:ads', // tiles: four vertical pole adverts
  vendA: 'sign:vendA', // tiles: four vending machine fronts
  vendB: 'sign:vendB', // tiles: four more vending machine fronts
  stripe: 'sign:stripe', // yellow/black diagonal stripes for the pole guard sleeve
  plateA: 'sign:plateA', // halves: 桜ヶ丘一丁目 / 二丁目
  plateB: 'sign:plateB', // halves: 三丁目 / 四丁目
  names: 'sign:names', // halves: street name signs (さくら通り / 駅前大通り)
  banners: 'sign:banners', // tiles: four street lamp banners
  bikes: '駐輪場',
} as const;

/** Labels the town builder must put in the atlas for the street furniture. */
export const STREET_SIGN_LABELS: readonly string[] = Object.values(SIGN);

/** Corner points (tile pixels, y down) of the inverted triangle of the stop sign. */
export const STOP_TRI: readonly [number, number][] = [[4, 14], [124, 14], [64, 118]];

type G = CanvasRenderingContext2D;

const RED = '#d4161c';
const BLUE = '#1b5fb4';
const WHITE = '#ffffff';

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function poly(g: G, pts: readonly [number, number][]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** Scales `pts` about the centroid so that the shape shrinks by `d` pixels at every edge (triangles). */
function insetTri(pts: readonly [number, number][], d: number): [number, number][] {
  const cx = (pts[0]![0] + pts[1]![0] + pts[2]![0]) / 3;
  const cy = (pts[0]![1] + pts[1]![1] + pts[2]![1]) / 3;
  // inradius of the triangle
  const a = Math.hypot(pts[1]![0] - pts[2]![0], pts[1]![1] - pts[2]![1]);
  const b = Math.hypot(pts[0]![0] - pts[2]![0], pts[0]![1] - pts[2]![1]);
  const c = Math.hypot(pts[0]![0] - pts[1]![0], pts[0]![1] - pts[1]![1]);
  const s = (a + b + c) / 2;
  const area = Math.abs((pts[1]![0] - pts[0]![0]) * (pts[2]![1] - pts[0]![1]) - (pts[2]![0] - pts[0]![0]) * (pts[1]![1] - pts[0]![1])) / 2;
  const r = area / s;
  const k = Math.max(0, (r - d) / r);
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as [number, number]);
}

// ---- tile drawers (128 x 128 unless noted) ---------------------------------------------------------------------

function stopSign(g: G, font: string): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  const inner = insetTri(STOP_TRI, 8);
  g.fillStyle = RED;
  g.lineJoin = 'round';
  g.strokeStyle = RED;
  g.lineWidth = 6;
  poly(g, inner);
  g.fill();
  g.stroke();
  g.fillStyle = WHITE;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 20px ${font}`;
  g.fillText('止まれ', 64, 37);
}

function speedSign(g: G, font: string): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fillStyle = WHITE;
  g.fill();
  g.beginPath();
  g.arc(64, 64, 57, 0, Math.PI * 2);
  g.moveTo(102, 64);
  g.arc(64, 64, 38, 0, Math.PI * 2, true);
  g.fillStyle = RED;
  g.fill('evenodd');
  g.fillStyle = '#16181c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 52px ${font}`;
  g.fillText('30', 64, 68);
}

function crossingSign(g: G): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  rr(g, 5, 5, 118, 118, 10);
  g.fillStyle = BLUE;
  g.fill();
  // white triangle with the walking pedestrian
  g.fillStyle = WHITE;
  poly(g, [[64, 17], [17, 103], [111, 103]]);
  g.fill();
  g.fillStyle = BLUE;
  // head, body, legs, arms (a walking pictogram)
  g.beginPath();
  g.arc(66, 46, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = BLUE;
  g.lineCap = 'round';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(64, 56);
  g.lineTo(60, 76);
  g.moveTo(63, 62);
  g.lineTo(75, 70);
  g.moveTo(63, 62);
  g.lineTo(52, 68);
  g.moveTo(60, 76);
  g.lineTo(70, 90);
  g.moveTo(60, 76);
  g.lineTo(50, 90);
  g.stroke();
  // zebra bars along the bottom
  for (let i = 0; i < 4; i++) g.fillRect(34 + i * 16, 94, 9, 6);
}

function noStoppingSign(g: G): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fillStyle = RED;
  g.fill();
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fillStyle = BLUE;
  g.fill();
  g.strokeStyle = RED;
  g.lineWidth = 11;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(30, 30);
  g.lineTo(98, 98);
  g.moveTo(98, 30);
  g.lineTo(30, 98);
  g.stroke();
}

function curveMirror(g: G): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  g.save();
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fillStyle = '#f08a00'; // orange rim
  g.fill();
  g.beginPath();
  g.arc(64, 64, 53, 0, Math.PI * 2);
  g.clip();
  // the street as the mirror sees it: sky, houses, trees and a bent road
  const sky = g.createLinearGradient(0, 11, 0, 117);
  sky.addColorStop(0, '#7fb6ea');
  sky.addColorStop(0.55, '#d9ecfa');
  sky.addColorStop(1, '#9ab0c0');
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2e6d0';
  g.fillRect(14, 40, 40, 34);
  g.fillStyle = '#b8503f';
  poly(g, [[10, 42], [34, 22], [58, 42]]);
  g.fill();
  g.fillStyle = '#7fbf6a';
  g.beginPath();
  g.arc(92, 52, 20, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8dcc6';
  g.fillRect(78, 66, 40, 22);
  g.fillStyle = '#5b5f68';
  poly(g, [[0, 128], [0, 84], [64, 76], [128, 90], [128, 128]]);
  g.fill();
  g.strokeStyle = '#f4f0dc';
  g.lineWidth = 3;
  g.setLineDash([9, 7]);
  g.beginPath();
  g.moveTo(10, 112);
  g.quadraticCurveTo(66, 82, 128, 104);
  g.stroke();
  g.setLineDash([]);
  // highlight
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 42, Math.PI * 1.08, Math.PI * 1.42);
  g.stroke();
  g.restore();
}

function schoolZone(g: G, font: string): void {
  g.fillStyle = '#ffd400';
  g.fillRect(0, 0, 128, 128);
  // black frame of the diamond sign (the diamond's corners are the middles of the tile edges)
  g.strokeStyle = '#17181a';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  poly(g, [[64, 6], [122, 64], [64, 122], [6, 64]]);
  g.stroke();
  g.fillStyle = '#17181a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 21px ${font}`;
  g.fillText('通学路', 64, 38);
  // two children
  const kid = (x: number, h: number): void => {
    g.beginPath();
    g.arc(x, 62, 5, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#17181a';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, 68);
    g.lineTo(x, 84);
    g.moveTo(x, 84);
    g.lineTo(x - 5, 84 + h);
    g.moveTo(x, 84);
    g.lineTo(x + 5, 84 + h);
    g.moveTo(x - 7, 74);
    g.lineTo(x + 7, 74);
    g.stroke();
  };
  kid(52, 11);
  kid(76, 11);
}

function postPlate(g: G, font: string): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = RED;
  g.lineWidth = 5;
  g.strokeRect(5, 5, 118, 118);
  g.fillStyle = RED;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 62px ${font}`;
  g.fillText('〒', 38, 66);
  g.fillStyle = '#7a7e86';
  for (let i = 0; i < 4; i++) g.fillRect(70, 26 + i * 20, 44, 7);
}

/** Supplementary plate "横断歩道": a 3:1 plate drawn into a square tile, so the glyphs are stretched vertically x3. */
function crossingPlate(g: G, font: string): void {
  g.fillStyle = WHITE;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#17181a';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 122, 122);
  g.save();
  g.translate(64, 64);
  g.scale(1, 3);
  g.fillStyle = '#17181a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 27px ${font}`;
  g.fillText('横断歩道', 0, 1);
  g.restore();
}

/** A tall pole advert, drawn in a logical 36 x 120 box (the tile is stretched on a 3 x 10 board). */
function advert(bg: string, fg: string, band: string, lines: string[], tel: string): (g: G, font: string) => void {
  return (g, font) => {
    g.save();
    g.scale(128 / 36, 128 / 120);
    g.fillStyle = bg;
    g.fillRect(0, 0, 36, 120);
    g.fillStyle = band;
    g.fillRect(0, 0, 36, 7);
    g.fillRect(0, 113, 36, 7);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.reduce((m, s) => Math.max(m, s.length), 0);
    const size = Math.min(26, Math.floor(88 / n));
    g.font = `bold ${size}px ${font}`;
    const col = lines.length === 1 ? [18] : [26, 10];
    lines.forEach((ln, k) => {
      for (let i = 0; i < ln.length; i++) g.fillText(ln[i]!, col[k]!, 14 + size / 2 + i * size);
    });
    g.font = `bold 6px ${font}`;
    g.fillText(tel, 18, 108);
    g.restore();
  };
}

/** A street lamp banner (街路灯フラッグ): a tall flag with stacked lettering, in a logical 36 x 120 box. */
function banner(bg: string, fg: string, accent: string, text: string, blossom: boolean): (g: G, font: string) => void {
  return (g, font) => {
    g.save();
    g.scale(128 / 36, 128 / 120);
    g.fillStyle = bg;
    g.fillRect(0, 0, 36, 120);
    g.fillStyle = accent;
    g.fillRect(0, 0, 36, 5);
    g.fillRect(0, 115, 36, 5);
    let y0 = 12;
    if (blossom) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        g.fillStyle = '#f7a8c4';
        g.beginPath();
        g.arc(18 + Math.cos(a) * 5.2, 21 + Math.sin(a) * 5.2, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.arc(18, 21, 2.2, 0, Math.PI * 2);
      g.fill();
      y0 = 34;
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = text.length;
    const size = Math.min(22, Math.floor((112 - y0) / n));
    g.font = `bold ${size}px ${font}`;
    for (let i = 0; i < n; i++) g.fillText(text[i]!, 18, y0 + size / 2 + i * size);
    g.restore();
  };
}

/** The lit front of a vending machine, drawn in a logical 56 x 90 box. */
function vending(body: string, trim: string, head: string, label: string, seed: number): (g: G, font: string) => void {
  return (g, font) => {
    g.save();
    g.scale(128 / 56, 128 / 90);
    g.fillStyle = body;
    g.fillRect(0, 0, 56, 90);
    // header with the machine's slogan
    g.fillStyle = head;
    g.fillRect(2, 2, 52, 11);
    g.fillStyle = trim;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 8px ${font}`;
    g.fillText(label, 28, 8);
    // the lit product window
    g.fillStyle = '#14181d';
    g.fillRect(2, 15, 52, 44);
    g.fillStyle = '#f1f6f4';
    g.fillRect(3, 16, 50, 42);
    let s = seed;
    const rnd = (): number => {
      s = (s * 16807 + 11) % 2147483647;
      return (s % 1000) / 1000;
    };
    const cols = ['#d63a2f', '#2f7fd0', '#f2b632', '#3f9a4a', '#8a5a3a', '#f0f0f0', '#e07ab0', '#6a4fb0'];
    for (let row = 0; row < 3; row++) {
      const y = 18 + row * 13.4;
      g.fillStyle = '#c9d2d6';
      g.fillRect(3, y + 9.4, 50, 1.2);
      for (let i = 0; i < 6; i++) {
        const col = cols[Math.floor(rnd() * cols.length)]!;
        g.fillStyle = col;
        if (row === 1 && i % 2) {
          g.fillRect(5 + i * 8.2, y + 3.4, 5.4, 6); // cans
          g.fillStyle = '#e8ecee';
          g.fillRect(5 + i * 8.2, y + 3.4, 5.4, 1.4);
        } else {
          g.fillRect(5.2 + i * 8.2, y + 1.6, 4.8, 7.8); // bottles
          g.fillStyle = '#e8ecee';
          g.fillRect(6.4 + i * 8.2, y, 2.4, 2);
        }
      }
      // price chips
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) g.fillRect(4.6 + i * 8.2, y + 11, 6, 1.7);
    }
    // cold / hot labels, buttons
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i < 4 ? '#2f7fd0' : '#d63a2f';
      g.fillRect(4.6 + i * 8.2, 60.5, 6, 2.4);
      g.fillStyle = '#ffffff';
      g.fillRect(5.6 + i * 8.2, 64.5, 4, 3);
    }
    // coin slot and return lever on the right, the dispenser flap at the bottom left
    g.fillStyle = '#2b2f36';
    g.fillRect(36, 70, 16, 17);
    g.fillStyle = '#8c939c';
    g.fillRect(38, 72, 12, 6);
    g.fillStyle = '#111';
    g.fillRect(42, 74, 4, 1.2);
    g.fillStyle = '#d63a2f';
    g.beginPath();
    g.arc(44, 83, 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#23272d';
    g.fillRect(4, 71, 28, 16);
    g.fillStyle = '#3b4048';
    g.fillRect(5, 72, 26, 3);
    g.restore();
  };
}

/** 2:1 blue address plate (街区表示板) in a 256 x 128 half cell. */
function plate(town: string, kana: string, ward: string, romaji: string): (g: G, font: string) => void {
  return (g, font) => {
    g.fillStyle = BLUE;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = WHITE;
    g.lineWidth = 5;
    rr(g, 8, 8, 240, 112, 12);
    g.stroke();
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 20px ${font}`;
    g.fillText(kana, 128, 30);
    g.font = `bold 38px ${font}`;
    g.fillText(`${town}${ward}`, 128, 68);
    g.fillRect(24, 91, 208, 2);
    g.font = `bold 15px ${font}`;
    g.fillText(romaji, 128, 106);
  };
}

/** Street name sign, 2:1 (white on green like the road guide signs). */
function streetName(name: string, romaji: string): (g: G, font: string) => void {
  return (g, font) => {
    g.fillStyle = '#12704a';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = WHITE;
    g.lineWidth = 4;
    rr(g, 7, 7, 242, 114, 10);
    g.stroke();
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 54;
    g.font = `bold ${size}px ${font}`;
    while (g.measureText(name).width > 212 && size > 20) {
      size -= 2;
      g.font = `bold ${size}px ${font}`;
    }
    g.fillText(name, 128, 58);
    g.font = `bold 17px ${font}`;
    g.fillText(romaji, 128, 102);
  };
}

type Tile = (g: G, font: string) => void;

function tiles(fns: readonly Tile[], size: number): SignStyle['draw'] {
  return (g, _w, _h, font) => {
    fns.forEach((fn, k) => {
      g.save();
      g.translate(k * size, 0);
      g.beginPath();
      g.rect(0, 0, size, 128);
      g.clip();
      fn(g, font);
      g.restore();
    });
  };
}

/**
 * Diagonal yellow/black stripes for the guard sleeve (巻き付け標識). The sleeve is 4 stripe periods around and
 * the picture is mapped once around and once along it, so the stripes run at about 45 degrees.
 * `PERIOD` is the stripe period in world units along the axis; circumference / PERIOD must be a whole number.
 */
export const SLEEVE = { height: 26, circumference: 5 * 2.51, period: 2.51, pad: 6 };

function stripes(g: G): void {
  const W = 512;
  const H = 128;
  g.fillStyle = '#f5c518';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b1b1d';
  // The sleeve covers the texture rows pad..H-pad (the rest only keeps filtering off the neighbouring cells):
  // texture x -> arc length s = x / W * circumference, row y -> height h = (H - pad - y) / (H - 2 pad) * height.
  const sx = W / SLEEVE.circumference;
  const sy = (H - 2 * SLEEVE.pad) / SLEEVE.height;
  const hTop = (H - SLEEVE.pad) / sy; // height at texture row 0
  const hBot = (H - SLEEVE.pad - H) / sy; // height at the last row
  // stripes are the bands where (s + h) mod period < period / 2; the line s + h = c crosses row 0 at
  // x = (c - hTop) * sx and the last row at x = (c - hBot) * sx
  const k0 = -Math.ceil(hTop / SLEEVE.period) - 1;
  const k1 = Math.ceil(SLEEVE.circumference / SLEEVE.period) + 1;
  for (let k = k0; k <= k1; k++) {
    const c0 = k * SLEEVE.period;
    const c1 = c0 + SLEEVE.period / 2;
    g.beginPath();
    g.moveTo((c0 - hTop) * sx, 0);
    g.lineTo((c1 - hTop) * sx, 0);
    g.lineTo((c1 - hBot) * sx, H);
    g.lineTo((c0 - hBot) * sx, H);
    g.closePath();
    g.fill();
  }
}

export const STREET_SIGN_STYLES: Record<string, SignStyle> = {
  [SIGN.road]: {
    bg: WHITE,
    fg: '#000',
    draw: tiles([(g, f) => stopSign(g, f), (g, f) => speedSign(g, f), (g) => crossingSign(g), (g) => noStoppingSign(g)], 128),
  },
  [SIGN.misc]: {
    bg: WHITE,
    fg: '#000',
    draw: tiles([(g) => curveMirror(g), (g, f) => schoolZone(g, f), (g, f) => postPlate(g, f), (g, f) => crossingPlate(g, f)], 128),
  },
  [SIGN.ads]: {
    bg: WHITE,
    fg: '#000',
    draw: tiles(
      [
        advert('#ffffff', '#1b5fb4', '#1b5fb4', ['さくら歯科'], '0120-81-0000'),
        advert('#ffe45c', '#c8281e', '#c8281e', ['ひだまり不動産'], '0120-22-1234'),
        advert('#2f8a5a', '#ffffff', '#f2d64a', ['桜ヶ丘接骨院'], '0120-55-0808'),
        advert('#e8628e', '#ffffff', '#ffffff', ['春風クリーニング'], '0120-33-4545'),
      ],
      128,
    ),
  },
  [SIGN.vendA]: {
    bg: WHITE,
    fg: '#000',
    draw: tiles(
      [
        vending('#c92f2a', '#c92f2a', '#f4f1ea', 'つめた〜い', 3),
        vending('#2a63b6', '#2a63b6', '#eaf2fb', 'ドリンク', 17),
        vending('#e9ecee', '#ffffff', '#1f6b3c', 'お茶・コーヒー', 29),
        vending('#2f2f36', '#f5d36a', '#1b1b20', 'あったか〜い', 41),
      ],
      128,
    ),
  },
  [SIGN.vendB]: {
    bg: WHITE,
    fg: '#000',
    draw: tiles(
      [
        vending('#ef8a1f', '#c8661a', '#fff1d6', 'ジュース', 53),
        vending('#5aa9e6', '#1f6aa8', '#e8f4ff', 'お水・お茶', 67),
        vending('#2e8b57', '#1f6b3c', '#e8f6ec', 'ミネラル', 79),
        vending('#d9c8a4', '#6b4a2a', '#f3ead6', '缶コーヒー', 97),
      ],
      128,
    ),
  },
  [SIGN.stripe]: { bg: '#f5c518', fg: '#000', draw: (g) => stripes(g) },
  [SIGN.plateA]: {
    bg: BLUE,
    fg: WHITE,
    draw: tiles([plate('桜ヶ丘', 'さくらがおか', '一丁目', 'SAKURAGAOKA 1-CHOME'), plate('桜ヶ丘', 'さくらがおか', '二丁目', 'SAKURAGAOKA 2-CHOME')], 256),
  },
  [SIGN.plateB]: {
    bg: BLUE,
    fg: WHITE,
    draw: tiles([plate('桜ヶ丘', 'さくらがおか', '三丁目', 'SAKURAGAOKA 3-CHOME'), plate('桜ヶ丘', 'さくらがおか', '四丁目', 'SAKURAGAOKA 4-CHOME')], 256),
  },
  [SIGN.names]: {
    bg: '#12704a',
    fg: WHITE,
    draw: tiles([streetName('さくら通り', 'Sakura-dori'), streetName('駅前大通り', 'Ekimae-odori')], 256),
  },
  [SIGN.banners]: {
    bg: '#f9c6d8',
    fg: '#000',
    draw: tiles(
      [
        banner('#f9c6d8', '#b01e55', '#e8628e', 'さくら通り', true),
        banner('#ffffff', '#d4467a', '#f7a8c4', '桜まつり', true),
        banner('#2f9a8a', '#ffffff', '#f2d64a', '春の大売出し', false),
        banner('#ffe45c', '#c8281e', '#c8281e', 'ひだまり商店街', false),
      ],
      128,
    ),
  },
  [SIGN.bikes]: { bg: BLUE, fg: WHITE, accent: WHITE },
};
