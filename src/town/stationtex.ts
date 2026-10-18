import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { FONT_STACK } from './signs';
import { makeRng } from './util';

type G = CanvasRenderingContext2D;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const font = (size: number, weight = 'bold'): string => `${weight} ${size}px ${FONT_STACK}`;

function text(g: G, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 'bold'): void {
  g.font = font(size, weight);
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** Draws text shrunk until it fits `maxW`. */
function fitText(g: G, s: string, x: number, y: number, maxW: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 'bold'): void {
  let sz = size;
  g.font = font(sz, weight);
  while (sz > 8 && g.measureText(s).width > maxW) {
    sz -= 2;
    g.font = font(sz, weight);
  }
  text(g, s, x, y, sz, color, align, weight);
}

function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function makeTexture(scene: Scene, name: string, w: number, h: number, draw: (g: G) => void, repeat: boolean): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  tex.anisotropicFilteringLevel = 8;
  tex.wrapU = repeat ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = repeat ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  draw(tex.getContext() as G);
  tex.update(true);
  return tex;
}

// --- repeating surface textures ------------------------------------------------------------------

/** Pale terrazzo-like floor tiles: 4 x 4 tiles per texture (one tile = 7.5 units = 60 cm). */
function floorTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationFloor', 512, 512, (g) => {
    const rnd = makeRng(7101);
    const n = 4;
    const t = 512 / n;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const v = 0.93 + rnd() * 0.07;
        g.fillStyle = `rgb(${Math.round(205 * v)},${Math.round(207 * v)},${Math.round(216 * v)})`;
        g.fillRect(tx * t, ty * t, t, t);
        // soft mottling
        for (let i = 0; i < 6; i++) {
          const gr = g.createRadialGradient(tx * t + rnd() * t, ty * t + rnd() * t, 2, tx * t + rnd() * t, ty * t + rnd() * t, 50);
          gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,255' : '150,140,125'},0.10)`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(tx * t, ty * t, t, t);
        }
        // terrazzo chips
        for (let i = 0; i < 60; i++) {
          const x = tx * t + rnd() * t;
          const y = ty * t + rnd() * t;
          const r = 0.45 + rnd() * .65;
          const c = rnd();
          g.fillStyle = c < 0.4 ? 'rgba(255,255,255,0.18)' : c < 0.75 ? 'rgba(125,130,145,0.12)' : 'rgba(170,160,175,0.10)';
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // joints (half widths at the borders so that the texture tiles seamlessly)
    for (let k = 0; k <= n; k++) {
      g.strokeStyle = 'rgba(115,120,135,0.48)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(k * t, 0);
      g.lineTo(k * t, 512);
      g.moveTo(0, k * t);
      g.lineTo(512, k * t);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(k * t + 2, 0);
      g.lineTo(k * t + 2, 512);
      g.moveTo(0, k * t + 2);
      g.lineTo(512, k * t + 2);
      g.stroke();
    }
  }, true);
}

/** Suspended grid ceiling: 4 x 4 white panels per texture (one panel = 7.5 units). */
function ceilingTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationCeiling', 512, 512, (g) => {
    const rnd = makeRng(7102);
    const n = 4;
    const t = 512 / n;
    g.fillStyle = '#f6f6f3';
    g.fillRect(0, 0, 512, 512);
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const v = 0.965 + rnd() * 0.03;
        g.fillStyle = `rgb(${Math.round(250 * v)},${Math.round(250 * v)},${Math.round(247 * v)})`;
        g.fillRect(tx * t + 3, ty * t + 3, t - 6, t - 6);
        // fine perforations
        g.fillStyle = 'rgba(120,120,125,0.09)';
        for (let y = 10; y < t - 8; y += 7) {
          for (let x = 10 + ((y / 7) % 2) * 3; x < t - 8; x += 7) g.fillRect(tx * t + x, ty * t + y, 1.4, 1.4);
        }
      }
    }
    // T-bar grid
    for (let k = 0; k <= n; k++) {
      g.strokeStyle = 'rgba(150,152,158,0.95)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(k * t, 0);
      g.lineTo(k * t, 512);
      g.moveTo(0, k * t);
      g.lineTo(512, k * t);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(k * t + 2, 0);
      g.lineTo(k * t + 2, 512);
      g.moveTo(0, k * t + 2);
      g.lineTo(512, k * t + 2);
      g.stroke();
    }
  }, true);
}

/** Painted wall boards: faint vertical seams every 11 units and a soft mottling (no fine noise: it would shimmer). */
function wallPanelTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationWall', 256, 256, (g) => {
    const rnd = makeRng(7103);
    g.fillStyle = '#d9d6dc';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 16 + rnd() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,255' : '165,160,180'},${0.07 + rnd() * 0.06})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const x of [0, 128, 256]) {
      g.fillStyle = 'rgba(120,120,135,0.13)';
      g.fillRect(x - 1.5, 0, 3, 256);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x + 1.5, 0, 2, 256);
    }
  }, true);
}

/** Small pale-blue wall tiles (8 x 8 per texture) for the lower part of the walls. */
function wallTileTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationTile', 256, 256, (g) => {
    const rnd = makeRng(7104);
    const n = 8;
    const t = 256 / n;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const v = 0.94 + rnd() * 0.08;
        g.fillStyle = `rgb(${Math.round(192 * v)},${Math.round(218 * v)},${Math.round(232 * v)})`;
        g.fillRect(tx * t, ty * t, t, t);
        const gr = g.createLinearGradient(tx * t, ty * t, tx * t + t, ty * t + t);
        gr.addColorStop(0, 'rgba(255,255,255,0.28)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(tx * t, ty * t, t, t);
      }
    }
    g.strokeStyle = 'rgba(238,244,247,0.95)';
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      g.moveTo(k * t, 0);
      g.lineTo(k * t, 256);
      g.moveTo(0, k * t);
      g.lineTo(256, k * t);
    }
    g.stroke();
  }, true);
}

/** Yellow tactile paving: left cell = guiding bars, right cell = warning dots (each 128 x 128, one tile). */
function tactileTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationTactile', 256, 128, (g) => {
    for (let c = 0; c < 2; c++) {
      const x0 = c * 128;
      g.fillStyle = '#f2c21c';
      g.fillRect(x0, 0, 128, 128);
      g.fillStyle = 'rgba(255,240,170,0.18)';
      g.fillRect(x0, 0, 128, 64);
      if (c === 0) {
        for (let k = 0; k < 4; k++) {
          const x = x0 + 14 + k * 32;
          g.fillStyle = 'rgba(150,105,0,0.55)';
          roundRect(g, x + 3, 4, 17, 120, 8);
          g.fill();
          g.fillStyle = '#ffe270';
          roundRect(g, x, 4, 17, 120, 8);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)';
          roundRect(g, x + 3, 8, 5, 112, 3);
          g.fill();
        }
      } else {
        for (let iy = 0; iy < 5; iy++) {
          for (let ix = 0; ix < 5; ix++) {
            const cx = x0 + 14 + ix * 25;
            const cy = 14 + iy * 25;
            g.fillStyle = 'rgba(150,105,0,0.55)';
            g.beginPath();
            g.arc(cx + 2.5, cy + 2.5, 9, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#ffe270';
            g.beginPath();
            g.arc(cx, cy, 9, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.5)';
            g.beginPath();
            g.arc(cx - 3, cy - 3, 3.5, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      g.strokeStyle = 'rgba(160,120,10,0.9)';
      g.lineWidth = 3;
      g.strokeRect(x0 + 1.5, 1.5, 125, 125);
    }
  }, false);
}



/** Platform paving: pale concrete slabs with joints, 4 x 4 per texture (one slab = 15 units = 1.2 m). */
function platformTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'stationPlatform', 256, 256, (g) => {
    const rnd = makeRng(7105);
    const n = 4;
    const t = 256 / n;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const v = 0.98 + rnd() * 0.035;
        g.fillStyle = `rgb(${Math.round(211 * v)},${Math.round(209 * v)},${Math.round(201 * v)})`;
        g.fillRect(tx * t, ty * t, t, t);
        for (let i = 0; i < 4; i++) {
          const x = tx * t + rnd() * t;
          const y = ty * t + rnd() * t;
          const r = 10 + rnd() * 22;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,250' : '150,140,125'},${0.06 + rnd() * 0.06})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,110,95,0.18)';
      g.fillRect(rnd() * 256, rnd() * 256, 1, 1);
    }
    g.strokeStyle = 'rgba(135,132,121,0.34)';
    g.lineWidth = .8;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      g.moveTo(k * t, 0);
      g.lineTo(k * t, 256);
      g.moveTo(0, k * t);
      g.lineTo(256, k * t);
    }
    g.stroke();
  }, true);
}

/** Soft diagonal reflections on a faintly tinted pane (alpha texture for the window glass). */
function glassTexture(scene: Scene): DynamicTexture {
  const tex = makeTexture(scene, 'stationGlass', 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(214,232,250,0.12)';
    g.fillRect(0, 0, 256, 256);
    g.save();
    g.translate(128, 128);
    g.rotate(0.38);
    for (const [x0, w, a] of [[-70, 30, 0.34], [-14, 9, 0.26], [44, 46, 0.2]] as [number, number, number][]) {
      const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x0, -400, w, 800);
    }
    g.restore();
  }, true);
  tex.hasAlpha = true;
  return tex;
}

// --- sign atlas ----------------------------------------------------------------------------------

interface AtlasItem {
  name: string;
  w: number;
  h: number;
  draw: (g: G, w: number, h: number) => void;
}

const NAVY = '#12306b';
const BLUE = '#1a56a8';

function circled(g: G, n: string, x: number, y: number, r: number, bg: string, fg: string): void {
  g.fillStyle = bg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  text(g, n, x, y + r * 0.06, r * 1.35, fg, 'center', 'bold');
}

function blossom(g: G, x: number, y: number, r: number, color: string, center = '#ffe27a'): void {
  g.fillStyle = color;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.46, r * 0.36, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = center;
  g.beginPath();
  g.arc(x, y, r * 0.2, 0, Math.PI * 2);
  g.fill();
}

function drawStationName(g: G, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#1d62b8');
  gr.addColorStop(1, '#134a94');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  roundRect(g, 10, 10, w - 20, h - 20, 18);
  g.stroke();
  blossom(g, 96, h * 0.45, 46, '#ffc4d8');
  blossom(g, w - 96, h * 0.45, 46, '#ffc4d8');
  fitText(g, '桜ヶ丘駅', w / 2, h * 0.43, w - 330, 168, '#ffffff');
  fitText(g, 'Sakuragaoka Station', w / 2, h * 0.83, w - 300, 44, '#dbe8fb', 'center', 'bold');
}

function drawPlatformName(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 20);
  g.fillRect(0, h - 20, w, 20);
  g.fillStyle = '#f08cb0';
  g.fillRect(0, 20, w, 6);
  g.fillRect(0, h - 26, w, 6);
  text(g, 'さくらがおか', w / 2, 62, 34, '#33393f');
  fitText(g, '桜ヶ丘', w / 2, 132, 430, 112, '#111418');
  text(g, 'Sakuragaoka', w / 2, 206, 34, '#33393f');
  // neighbouring stations
  text(g, '◀ 城山', 120, 132, 40, '#33393f');
  text(g, '花見台 ▶', w - 130, 132, 40, '#33393f');
  text(g, 'Shiroyama', 120, 176, 24, '#555b63', 'center', 'normal');
  text(g, 'Hanamidai', w - 130, 176, 24, '#555b63', 'center', 'normal');
}

function drawHanging(g: G, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#173b80');
  gr.addColorStop(1, '#0d2a60');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 4;
  roundRect(g, 8, 8, w - 16, h - 16, 12);
  g.stroke();
  // left: ticket gate
  text(g, '改札口', 305, 98, 124, '#ffffff');
  text(g, 'Ticket Gate', 305, 184, 44, '#cfe0ff', 'center', 'bold');
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(594, 26, 3, h - 52);
  // right: platforms and destinations
  const rows: [string, string, string, string][] = [
    ['1', '花見台・海辺ヶ浜 方面', 'Hanamidai / Umibegahama', '#ffffff'],
    ['2', '城山・見晴台 方面', 'Shiroyama / Miharashidai', '#ffffff'],
  ];
  rows.forEach(([n, jp, en], i) => {
    const y = 66 + i * 94;
    circled(g, n, 658, y + 8, 34, '#ffffff', NAVY);
    text(g, '番線', 744, y + 10, 36, '#ffffff', 'center', 'bold');
    text(g, jp, 810, y - 4, 46, '#ffffff', 'left', 'bold');
    text(g, en, 812, y + 40, 25, '#cfe0ff', 'left', 'normal');
    // arrow
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.moveTo(w - 100, y - 14);
    g.lineTo(w - 60, y + 8);
    g.lineTo(w - 100, y + 30);
    g.closePath();
    g.fill();
  });
}

/** Dot-matrix style departure board: rendered small, then expanded to glowing dots. */
function drawDeparture(g: G, w: number, h: number): void {
  const DOT = 4;
  const cols = Math.floor(w / DOT);
  const rowsN = Math.floor(h / DOT);
  g.fillStyle = '#0a0a0c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#26262b';
  g.fillRect(0, 0, w, 5);
  g.fillRect(0, h - 5, w, 5);
  const lines: { type: string; time: string; dest: string; plat: string; col: string; typeCol: string }[] = [
    { type: '普通', time: '10:05', dest: '花見台', plat: '1', col: '#ffb020', typeCol: '#5cff8a' },
    { type: '快速', time: '10:09', dest: '海辺ヶ浜', plat: '1', col: '#ffb020', typeCol: '#ff5a4a' },
    { type: '普通', time: '10:14', dest: '城山', plat: '2', col: '#ffb020', typeCol: '#5cff8a' },
  ];
  const small = document.createElement('canvas');
  small.width = cols;
  small.height = rowsN;
  const s = small.getContext('2d', { willReadFrequently: true }) as G;
  const lineH = Math.floor(rowsN / 3);
  const draw = (str: string, x: number, cy: number, col: string, size: number, align: CanvasTextAlign): void => {
    s.font = `bold ${size}px ${FONT_STACK}`;
    s.textAlign = align;
    s.textBaseline = 'middle';
    s.fillStyle = col;
    s.fillText(str, x, cy);
  };
  s.clearRect(0, 0, cols, rowsN);
  lines.forEach((l, i) => {
    const cy = lineH * i + lineH / 2 + 1;
    draw(l.type, 4, cy, l.typeCol, 15, 'left');
    draw(l.time, 42, cy, l.col, 15, 'left');
    draw(l.dest, 92, cy, l.col, 15, 'left');
    draw(`${l.plat}番線`, cols - 6, cy, '#ffffff', 13, 'right');
  });
  const px = s.getImageData(0, 0, cols, rowsN).data;
  for (let y = 0; y < rowsN; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const a = px[i + 3]!;
      const cx = x * DOT + DOT / 2;
      const cy = y * DOT + DOT / 2;
      if (a > 70) {
        const r = px[i]!;
        const gg = px[i + 1]!;
        const b = px[i + 2]!;
        g.fillStyle = `rgba(${r},${gg},${b},0.22)`;
        g.beginPath();
        g.arc(cx, cy, DOT * 0.95, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgb(${r},${gg},${b})`;
        g.beginPath();
        g.arc(cx, cy, DOT * 0.42, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = 'rgba(70,52,20,0.55)';
        g.beginPath();
        g.arc(cx, cy, DOT * 0.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function drawBoothSign(g: G, w: number, h: number): void {
  g.fillStyle = '#17603b';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  roundRect(g, 6, 6, w - 12, h - 12, 10);
  g.stroke();
  fitText(g, '有人改札', w / 2, h * 0.43, w - 80, 78, '#ffffff');
  text(g, 'Staffed Gate', w / 2, h * 0.82, 24, '#d6f0e0', 'center', 'bold');
}

function drawFare(g: G, w: number, h: number): void {
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, w, h);
  g.fillStyle = NAVY;
  g.fillRect(0, 0, w, 52);
  text(g, '運賃表', 90, 27, 36, '#ffffff', 'center');
  text(g, 'Fare Table  /  大人 Adult', 360, 28, 24, '#cfe0ff', 'left');
  text(g, '桜ヶ丘駅から', w - 30, 27, 26, '#ffffff', 'right');
  // route line with stations
  const stations: [string, number][] = [
    ['峠', 290], ['見晴台', 210], ['城山', 160], ['桜ヶ丘', 0], ['花見台', 160], ['海辺ヶ浜', 260], ['湊町', 340],
  ];
  const y = 150;
  const x0 = 70;
  const x1 = w - 70;
  g.strokeStyle = '#f08cb0';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
  stations.forEach(([name, fare], i) => {
    const x = x0 + ((x1 - x0) * i) / (stations.length - 1);
    const here = fare === 0;
    g.fillStyle = here ? '#f08cb0' : '#ffffff';
    g.strokeStyle = here ? '#a02a5a' : NAVY;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, here ? 20 : 15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    fitText(g, name, x, y - 52, 130, 34, here ? '#a02a5a' : '#1c2433');
    if (here) text(g, '現在地', x, y + 52, 26, '#a02a5a');
    else text(g, `${fare}円`, x, y + 52, 38, '#1c2433');
  });
  g.fillStyle = '#e8edf6';
  g.fillRect(0, h - 40, w, 40);
  text(g, 'ICカードは 現金より 10円 おトクです  /  きっぷは 券売機で', w / 2, h - 20, 22, '#33415c', 'center', 'normal');
}

function drawClock(g: G, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  g.fillStyle = '#2b2f36';
  g.beginPath();
  g.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fbfbf7';
  g.beginPath();
  g.arc(cx, cy, w / 2 - 14, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    const big = k % 5 === 0;
    const r0 = w / 2 - 18;
    const r1 = r0 - (big ? 20 : 9);
    g.strokeStyle = '#22262c';
    g.lineWidth = big ? 5 : 2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    g.stroke();
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    text(g, String(n), cx + Math.sin(a) * (w / 2 - 54), cy - Math.cos(a) * (w / 2 - 54), 30, '#22262c');
  }
  const hand = (ang: number, len: number, wd: number, col: string): void => {
    g.strokeStyle = col;
    g.lineWidth = wd;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - Math.sin(ang) * len * 0.15, cy + Math.cos(ang) * len * 0.15);
    g.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    g.stroke();
  };
  hand(((10 + 2 / 60) / 12) * Math.PI * 2, 66, 9, '#15181d');
  hand((2 / 60) * Math.PI * 2, 96, 6, '#15181d');
  hand((31 / 60) * Math.PI * 2, 100, 2.5, '#d12a2a');
  g.fillStyle = '#15181d';
  g.beginPath();
  g.arc(cx, cy, 8, 0, Math.PI * 2);
  g.fill();
}

function poster(g: G, w: number, h: number, bg0: string, bg1: string, draw: (g: G) => void): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, bg0);
  gr.addColorStop(1, bg1);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  draw(g);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
}

function drawPosterSakura(g: G, w: number, h: number): void {
  poster(g, w, h, '#ffd6e4', '#fff2f6', (p) => {
    for (let i = 0; i < 26; i++) blossom(p, ((i * 97) % 230) + 14, ((i * 61) % 330) + 10, 10 + (i % 4) * 5, i % 3 === 0 ? '#ff9fbf' : '#ffc4d8');
    p.fillStyle = 'rgba(255,255,255,0.78)';
    p.fillRect(14, 70, w - 28, 120);
    text(p, '桜まつり', w / 2, 112, 54, '#c8386b');
    text(p, '4/1 → 4/15', w / 2, 160, 30, '#7a2a48');
    text(p, '花見台公園', w / 2, 230, 34, '#7a2a48');
    text(p, '夜桜ライトアップ', w / 2, 276, 26, '#7a2a48', 'center', 'normal');
    text(p, '電車でお出かけ', w / 2, 318, 24, '#c8386b');
  });
}

function drawPosterManner(g: G, w: number, h: number): void {
  poster(g, w, h, '#fff7c2', '#ffe97a', (p) => {
    p.fillStyle = '#c8281e';
    p.fillRect(0, 0, w, 66);
    text(p, 'ご注意', w / 2, 34, 40, '#ffffff');
    p.strokeStyle = '#c8281e';
    p.lineWidth = 14;
    p.beginPath();
    p.arc(w / 2, 168, 58, 0, Math.PI * 2);
    p.moveTo(w / 2 - 41, 209);
    p.lineTo(w / 2 + 41, 127);
    p.stroke();
    text(p, '駆け込み乗車は', w / 2, 262, 27, '#222');
    text(p, 'おやめください', w / 2, 296, 27, '#222');
    text(p, 'Please do not rush', w / 2, 332, 16, '#444', 'center', 'normal');
  });
}

function drawPosterLost(g: G, w: number, h: number): void {
  poster(g, w, h, '#d8ecff', '#f1f8ff', (p) => {
    p.fillStyle = BLUE;
    p.fillRect(0, 0, w, 70);
    text(p, 'お忘れ物に', w / 2, 24, 32, '#fff');
    text(p, 'ご注意ください', w / 2, 54, 28, '#fff');
    p.fillStyle = '#7a4a28';
    roundRect(p, 70, 130, 116, 86, 8);
    p.fill();
    p.fillStyle = '#c99a62';
    roundRect(p, 100, 106, 56, 32, 10);
    p.fill();
    p.fillStyle = '#fff';
    p.fillRect(80, 146, 96, 8);
    text(p, '電車を降りる前に', w / 2, 262, 24, '#1c2433');
    text(p, 'もう一度 確認を', w / 2, 296, 24, '#1c2433');
    text(p, '遺失物係 ☎ 0120-000-000', w / 2, 334, 15, '#33415c', 'center', 'normal');
  });
}

function drawPosterTour(g: G, w: number, h: number): void {
  poster(g, w, h, '#8fd0ff', '#d6f0c8', (p) => {
    p.fillStyle = '#ffd24a';
    p.beginPath();
    p.arc(w - 60, 90, 34, 0, Math.PI * 2);
    p.fill();
    p.fillStyle = '#4fa86a';
    p.beginPath();
    p.moveTo(0, 250);
    p.quadraticCurveTo(80, 150, 170, 230);
    p.quadraticCurveTo(220, 190, w, 240);
    p.lineTo(w, h);
    p.lineTo(0, h);
    p.closePath();
    p.fill();
    p.fillStyle = '#3f9ad8';
    p.fillRect(0, 288, w, 64);
    for (let i = 0; i < 6; i++) blossom(p, 30 + i * 40, 232 + (i % 2) * 12, 14, '#ffc4d8');
    p.fillStyle = 'rgba(255,255,255,0.85)';
    p.fillRect(12, 18, w - 24, 78);
    text(p, '春の海へ', w / 2, 46, 40, '#14509e');
    text(p, '海辺ヶ浜 観光キャンペーン', w / 2, 80, 19, '#33415c');
  });
}

function drawNotice(g: G, w: number, h: number): void {
  const rnd = makeRng(7110);
  g.fillStyle = '#6b4a2b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#b98a57';
  g.fillRect(14, 14, w - 28, h - 28);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(90,60,30,0.22)' : 'rgba(255,230,190,0.2)';
    g.fillRect(14 + rnd() * (w - 28), 14 + rnd() * (h - 28), 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const papers: [number, number, number, number, string, string][] = [
    [34, 34, 150, 110, '#ffffff', 'お知らせ'],
    [204, 28, 120, 150, '#fff6bf', '工事のご案内'],
    [346, 40, 130, 96, '#ffd9e3', '桜まつり'],
    [40, 172, 110, 160, '#ffffff', ''],
    [176, 204, 146, 126, '#d8ecff', 'ダイヤ改正'],
    [346, 168, 126, 164, '#ffffff', '防犯のお願い'],
  ];
  for (const [x, y, pw, ph, col, title] of papers) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 4, y + 5, pw, ph);
    g.fillStyle = col;
    g.fillRect(x, y, pw, ph);
    if (title) fitText(g, title, x + pw / 2, y + 22, pw - 16, 22, '#8a1f2b');
    g.fillStyle = 'rgba(60,70,90,0.55)';
    for (let k = 0; k < Math.floor((ph - 44) / 14); k++) g.fillRect(x + 10, y + 40 + k * 14, pw - 20 - ((k * 37) % 30), 4);
    g.fillStyle = '#d22';
    g.beginPath();
    g.arc(x + pw / 2, y + 7, 5, 0, Math.PI * 2);
    g.fill();
  }
  text(g, '掲示板', w - 44, h - 10, 12, '#f5e6c8');
}

function drawTimetable(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 62);
  text(g, '時刻表', 80, 22, 32, '#ffffff');
  text(g, '桜ヶ丘', 250, 22, 26, '#ffffff');
  text(g, '① 花見台・海辺ヶ浜 方面', w / 2, 47, 17, '#dbe8fb', 'center', 'normal');
  const rnd = makeRng(7120);
  const hours = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const rowH = (h - 70) / hours.length;
  hours.forEach((hr, i) => {
    const y = 66 + i * rowH;
    g.fillStyle = i % 2 ? '#f2f5fa' : '#ffffff';
    g.fillRect(0, y, w, rowH);
    g.fillStyle = '#dde6f4';
    g.fillRect(0, y, 40, rowH);
    text(g, String(hr), 20, y + rowH / 2, 15, '#1c2433');
    const peak = hr >= 7 && hr <= 9;
    const n = peak ? 7 : 4;
    let m = Math.floor(rnd() * 8);
    let s = '';
    for (let k = 0; k < n; k++) {
      s += `${String(m).padStart(2, '0')}  `;
      m += Math.floor(60 / n) + Math.floor(rnd() * 3);
      if (m > 59) break;
    }
    text(g, s.trim(), 50, y + rowH / 2, 14, '#1c2433', 'left', 'normal');
  });
}

function drawRouteMap(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 46);
  text(g, '路線図  Route Map', 24, 24, 30, '#ffffff', 'left');
  const names: [string, string][] = [
    ['峠', 'Toge'], ['見晴台', 'Miharashidai'], ['城山', 'Shiroyama'], ['桜ヶ丘', 'Sakuragaoka'], ['花見台', 'Hanamidai'], ['海辺ヶ浜', 'Umibegahama'], ['湊町', 'Minatomachi'],
  ];
  const y = 150;
  const x0 = 80;
  const x1 = w - 80;
  g.strokeStyle = '#f08cb0';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(x0 - 40, y);
  g.lineTo(x1 + 40, y);
  g.stroke();
  names.forEach(([jp, en], i) => {
    const x = x0 + ((x1 - x0) * i) / (names.length - 1);
    const here = jp === '桜ヶ丘';
    g.fillStyle = here ? '#f08cb0' : '#ffffff';
    g.strokeStyle = here ? '#a02a5a' : '#555b63';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(x, y, here ? 24 : 16, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    text(g, jp, x, y - 56, here ? 38 : 32, here ? '#a02a5a' : '#1c2433');
    text(g, en, x, y + 56, 20, '#555b63', 'center', 'normal');
  });
  text(g, '現在地  You are here', x0 + ((x1 - x0) * 3) / 6, y + 100, 22, '#a02a5a');
}

function drawInfoMap(g: G, w: number, h: number): void {
  g.fillStyle = '#eef6ea';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 64);
  text(g, '周辺案内図', w / 2, 30, 38, '#ffffff');
  text(g, 'Area Map', w / 2, 52, 15, '#cfe0ff', 'center', 'normal');
  // sea, rail, roads, parks
  g.fillStyle = '#9fd6ec';
  g.fillRect(0, 64, w, 80);
  g.fillStyle = '#d8d2c0';
  g.fillRect(0, 150, w, 12);
  g.strokeStyle = '#8a8d96';
  g.setLineDash([14, 10]);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, 190);
  g.lineTo(w, 190);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#ffffff';
  for (const [rx, ry, rw, rh] of [[0, 330, w, 20], [w / 2 - 12, 200, 24, h - 200], [90, 200, 18, h - 200], [w - 110, 200, 18, h - 200]] as [number, number, number, number][]) g.fillRect(rx, ry, rw, rh);
  g.fillStyle = '#bfe3a8';
  g.beginPath();
  g.ellipse(w / 2, 292, 90, 36, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9d4c8';
  for (const [bx, by, bw, bh] of [[120, 210, 60, 50], [300, 212, 70, 44], [130, 370, 70, 50], [300, 372, 80, 54], [130, 450, 70, 40], [300, 450, 80, 40]] as [number, number, number, number][]) g.fillRect(bx, by, bw, bh);
  text(g, '駅前公園', w / 2, 292, 20, '#2f6f45');
  text(g, '桜ヶ丘駅', w / 2, 178, 22, '#ffffff');
  text(g, '海', w / 2, 104, 30, '#3a86b0');
  text(g, 'コンビニ', 150, 396, 17, '#1c2433');
  text(g, '和菓子屋', 340, 398, 17, '#1c2433');
  text(g, 'カフェ', 164, 474, 17, '#1c2433');
  text(g, '病院', 340, 474, 17, '#1c2433');
  // you are here
  g.fillStyle = '#d12a2a';
  g.beginPath();
  g.arc(w / 2, 232, 11, 0, Math.PI * 2);
  g.fill();
  text(g, '現在地', w / 2 + 52, 232, 22, '#d12a2a');
}

function drawSignGreen(label: string, en: string): (g: G, w: number, h: number) => void {
  return (g, w, h) => {
    g.fillStyle = '#17603b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    roundRect(g, 5, 5, w - 10, h - 10, 8);
    g.stroke();
    fitText(g, label, w / 2, h * 0.42, w - 40, 56, '#ffffff');
    text(g, en, w / 2, h * 0.8, 20, '#d6f0e0');
  };
}

function drawSignBlue(label: string, en: string): (g: G, w: number, h: number) => void {
  return (g, w, h) => {
    g.fillStyle = BLUE;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    roundRect(g, 5, 5, w - 10, h - 10, 8);
    g.stroke();
    fitText(g, label, w / 2, h * 0.42, w - 40, 56, '#ffffff');
    text(g, en, w / 2, h * 0.8, 20, '#cfe0ff');
  };
}

function drawPlatformGuide(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 14);
  g.fillRect(0, h - 14, w, 14);
  circled(g, '1', 60, h / 2, 32, BLUE, '#fff');
  text(g, '花見台・海辺ヶ浜方面', 110, h / 2 - 8, 30, '#1c2433', 'left');
  text(g, 'Hanamidai / Umibegahama', 112, h / 2 + 30, 18, '#555b63', 'left', 'normal');
  circled(g, '2', w - 310, h / 2, 32, BLUE, '#fff');
  text(g, '城山・見晴台方面', w - 262, h / 2 - 8, 30, '#1c2433', 'left');
  text(g, 'Shiroyama / Miharashidai', w - 260, h / 2 + 30, 18, '#555b63', 'left', 'normal');
}

function drawExitSign(g: G, w: number, h: number): void {
  g.fillStyle = '#12905a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, h);
  g.fillRect(w - 8, 0, 8, h);
  text(g, '非常口', w / 2 + 28, h * 0.42, 52, '#ffffff');
  text(g, 'EXIT', w / 2 + 28, h * 0.82, 22, '#d6f6e6');
  // running figure
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(48, 30, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(46, 44);
  g.lineTo(40, 72);
  g.moveTo(44, 56);
  g.lineTo(62, 62);
  g.moveTo(44, 54);
  g.lineTo(28, 64);
  g.moveTo(40, 72);
  g.lineTo(54, 88);
  g.moveTo(40, 72);
  g.lineTo(26, 92);
  g.stroke();
}

function drawTicketScreen(g: G, w: number, h: number): void {
  g.fillStyle = '#e6f4ff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, w, 40);
  text(g, 'きっぷを お買い求めください', w / 2, 21, 22, '#ffffff');
  const fares = ['150', '160', '190', '220', '260', '340'];
  fares.forEach((f, i) => {
    const x = 12 + (i % 3) * 82;
    const y = 54 + Math.floor(i / 3) * 56;
    g.fillStyle = '#ffffff';
    roundRect(g, x, y, 74, 46, 6);
    g.fill();
    g.strokeStyle = '#1a56a8';
    g.lineWidth = 2;
    g.stroke();
    text(g, f, x + 37, y + 24, 28, '#12306b');
  });
  g.fillStyle = '#f08cb0';
  roundRect(g, 12, 170, 110, 40, 6);
  g.fill();
  text(g, 'ICチャージ', 67, 191, 20, '#fff');
  g.fillStyle = '#ffd24a';
  roundRect(g, 134, 170, 110, 40, 6);
  g.fill();
  text(g, '定期券', 189, 191, 20, '#3a2a00');
}

function binLabel(jp: string, en: string, bg: string, fg = '#ffffff'): (g: G, w: number, h: number) => void {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    fitText(g, jp, w / 2, h * 0.42, w - 16, 30, fg);
    text(g, en, w / 2, h * 0.8, 13, fg, 'center', 'normal');
  };
}

function drawBinBoard(g: G, w: number, h: number): void {
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2e7d4f';
  g.fillRect(0, 0, w, 40);
  text(g, 'ごみは 分別して お捨てください', w / 2, 21, 24, '#ffffff');
  text(g, 'Please separate your trash', w / 2, 62, 15, '#444', 'center', 'normal');
}


function drawVending(g: G, w: number, h: number): void {
  g.fillStyle = '#eef1f4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fdfdfb';
  g.fillRect(12, 12, w - 24, 262);
  g.strokeStyle = '#98a1ad';
  g.lineWidth = 3;
  g.strokeRect(12, 12, w - 24, 262);
  const cols = ['#2f7fd0', '#e8452c', '#3aa76a', '#f2b632', '#8a5a3a', '#7a4fc0', '#e87aa6', '#2fb7c4', '#d4d8de', '#e8452c', '#2f7fd0', '#3aa76a'];
  for (let r = 0; r < 3; r++) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(14, 22 + r * 84 + 74, w - 28, 3);
    for (let c = 0; c < 4; c++) {
      const x = 24 + c * 52;
      const y = 22 + r * 84;
      const col = cols[r * 4 + c]!;
      g.fillStyle = col;
      roundRect(g, x + 4, y + 14, 30, 50, 7);
      g.fill();
      g.fillStyle = r === 1 ? '#fff6d8' : '#ffffff';
      g.fillRect(x + 7, y + 30, 24, 16);
      g.fillStyle = col;
      g.fillRect(x + 14, y + 4, 10, 12);
      g.fillStyle = '#c8281e';
      g.fillRect(x + 2, y + 66, 34, 8);
      text(g, '130', x + 19, y + 70.5, 8, '#ffffff', 'center', 'bold');
    }
  }
  g.fillStyle = '#c8281e';
  g.fillRect(12, 284, w - 24, 26);
  text(g, 'つめたい  /  あたたかい', w / 2, 297, 17, '#ffffff');
  g.fillStyle = '#d8dde3';
  g.fillRect(12, 318, w - 24, 22);
  g.fillStyle = '#4a5260';
  g.fillRect(24, 325, 44, 8);
  g.fillStyle = '#9aa2ad';
  g.beginPath();
  g.arc(w - 40, 329, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b2f36';
  roundRect(g, 30, 350, w - 60, 40, 6);
  g.fill();
}

/** All atlas entries (names are the lookup keys used by the builders). */
function atlasItems(): AtlasItem[] {
  return [
    { name: 'hanging', w: 1536, h: 224, draw: drawHanging },
    { name: 'stationName', w: 1024, h: 256, draw: drawStationName },
    { name: 'platformName', w: 1024, h: 256, draw: drawPlatformName },
    { name: 'departure', w: 1024, h: 256, draw: drawDeparture },
    { name: 'routeMap', w: 1024, h: 256, draw: drawRouteMap },
    { name: 'platformGuide', w: 1024, h: 160, draw: drawPlatformGuide },
    { name: 'fare', w: 1024, h: 214, draw: drawFare },
    { name: 'boothSign', w: 512, h: 128, draw: drawBoothSign },
    { name: 'exitSign', w: 256, h: 128, draw: drawExitSign },
    { name: 'ticketSign', w: 512, h: 128, draw: drawSignBlue('きっぷうりば', 'Tickets') },
    { name: 'toiletSign', w: 384, h: 96, draw: drawSignBlue('お手洗い', 'Restroom') },
    { name: 'platformSign', w: 512, h: 128, draw: drawSignBlue('ホームへ', 'To the platforms') },
    { name: 'officeSign', w: 384, h: 96, draw: drawSignGreen('事務室', 'Staff only') },
    { name: 'notice', w: 512, h: 384, draw: drawNotice },
    { name: 'infoMap', w: 512, h: 512, draw: drawInfoMap },
    { name: 'timetable', w: 384, h: 512, draw: drawTimetable },
    { name: 'clock', w: 256, h: 256, draw: drawClock },
    { name: 'posterSakura', w: 256, h: 352, draw: drawPosterSakura },
    { name: 'posterManner', w: 256, h: 352, draw: drawPosterManner },
    { name: 'posterLost', w: 256, h: 352, draw: drawPosterLost },
    { name: 'posterTour', w: 256, h: 352, draw: drawPosterTour },
    { name: 'ticketScreen', w: 256, h: 224, draw: drawTicketScreen },
    { name: 'vending', w: 240, h: 400, draw: drawVending },
    { name: 'binBoard', w: 512, h: 96, draw: drawBinBoard },
    { name: 'binBurn', w: 128, h: 96, draw: binLabel('もえるごみ', 'Burnable', '#c8281e') },
    { name: 'binCan', w: 128, h: 96, draw: binLabel('かん・びん', 'Cans / Bottles', '#1f6fb8') },
    { name: 'binPet', w: 128, h: 96, draw: binLabel('ペットボトル', 'PET bottles', '#1f9a58') },
    { name: 'binPaper', w: 128, h: 96, draw: binLabel('新聞・雑誌', 'Paper', '#d9a21a', '#2a1f00') },
    { name: 'officeWindowSign', w: 384, h: 96, draw: drawSignGreen('駅務室 窓口', 'Station Office') },
  ];
}

export class StationTextures {
  readonly floor: DynamicTexture;
  readonly ceiling: DynamicTexture;
  readonly wallPanel: DynamicTexture;
  readonly wallTile: DynamicTexture;
  readonly tactile: DynamicTexture;
  readonly glass: DynamicTexture;
  readonly platform: DynamicTexture;
  readonly atlas: DynamicTexture;
  private readonly cells = new Map<string, UvRect>();

  constructor(scene: Scene) {
    this.floor = floorTexture(scene);
    this.ceiling = ceilingTexture(scene);
    this.wallPanel = wallPanelTexture(scene);
    this.wallTile = wallTileTexture(scene);
    this.tactile = tactileTexture(scene);
    this.glass = glassTexture(scene);
    this.platform = platformTexture(scene);

    // shelf packing of the sign atlas
    const W = 2048;
    const GAP = 10;
    const items = atlasItems().sort((a, b) => b.h - a.h);
    const placed: { it: AtlasItem; x: number; y: number }[] = [];
    let x = GAP;
    let y = GAP;
    let rowH = 0;
    for (const it of items) {
      if (x + it.w + GAP > W) {
        x = GAP;
        y += rowH + GAP;
        rowH = 0;
      }
      placed.push({ it, x, y });
      x += it.w + GAP;
      rowH = Math.max(rowH, it.h);
    }
    const H = Math.ceil((y + rowH + GAP) / 16) * 16;
    this.atlas = new DynamicTexture('stationSigns', { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.atlas.anisotropicFilteringLevel = 8;
    const g = this.atlas.getContext() as G;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    for (const { it, x: px, y: py } of placed) {
      g.save();
      g.translate(px, py);
      g.beginPath();
      g.rect(0, 0, it.w, it.h);
      g.clip();
      it.draw(g, it.w, it.h);
      g.restore();
      // DynamicTexture flips Y: canvas row 0 is v = 1 (a half texel inset avoids bleeding at the borders)
      this.cells.set(it.name, {
        u0: (px + 0.5) / W,
        u1: (px + it.w - 0.5) / W,
        v1: 1 - (py + 0.5) / H,
        v0: 1 - (py + it.h - 0.5) / H,
      });
    }
    this.atlas.update(true);
  }

  /** Texture coordinates of a sign in the atlas. */
  uv(name: string): UvRect {
    const r = this.cells.get(name);
    if (!r) throw new Error(`no station sign ${name}`);
    return r;
  }
}
