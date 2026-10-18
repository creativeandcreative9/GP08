import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { makeRng } from './util';

/**
 * Procedural textures for the street surface (pavers, kerb blocks, tactile paving, gutter grates, manhole covers,
 * asphalt). They are drawn once on a canvas with a fixed seed (never the town RNG, so the town layout does not
 * change) and repeat along the road with WRAP addressing. Texture detail costs no vertices, which is why the
 * street surface is mostly textured strips instead of per-tile geometry.
 *
 * Canvas row 0 is v = 1 (DynamicTexture flips Y), the same convention as the sign atlas.
 */

type G = CanvasRenderingContext2D;
type C3 = readonly [number, number, number];

function make(scene: Scene, name: string, w: number, h: number, draw: (g: G) => void, wrapV = true): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  draw(t.getContext() as G);
  t.update(true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = wrapV ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

const css = (c: C3, f = 1, a = 1): string =>
  `rgba(${Math.min(255, Math.round(c[0] * f))},${Math.min(255, Math.round(c[1] * f))},${Math.min(255, Math.round(c[2] * f))},${a})`;

/** Adds per-pixel brightness noise (fine grain). */
function grain(g: G, w: number, h: number, amp: number, rnd: () => number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  g.putImageData(img, 0, 0);
}

/** A soft round stain that wraps around the texture edges, so that the texture still tiles. */
function blot(g: G, w: number, h: number, x: number, y: number, r: number, c: C3, a: number): void {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      const cx = x + ox;
      const cy = y + oy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, css(c, 1, a));
      gr.addColorStop(1, css(c, 1, 0));
      g.fillStyle = gr;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

/** Staggered 32 x 16 cm concrete pavers, with fine joints and quiet warm-grey variation. */
export function paveTexture(scene: Scene): DynamicTexture {
  const W = 2048, H = 256, T = 128, J = 2;
  return make(scene, 'streetPave', W, H, (g) => {
    const rnd = makeRng(1701), tile = document.createElement('canvas'); tile.width = tile.height = T;
    const t = tile.getContext('2d')!;
    g.fillStyle = '#b4b0a6'; g.fillRect(0, 0, W, H);
    const stones: C3[] = [[211, 207, 199], [207, 204, 197], [214, 210, 202], [209, 207, 201]];
    for (let ty = 0; ty < H / T; ty++) for (let tx = 0; tx < W / T; tx++) {
      t.clearRect(0, 0, T, T);
      // Individual slabs vary quietly; alternating warm/cool rows read as a checkerboard from the street.
      const base = stones[Math.floor(rnd() * stones.length)]!, k = .99 + rnd() * .02;
      const x = J / 2, y = J / 2, size = T - J, gradient = t.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, css(base, k * 1.012)); gradient.addColorStop(1, css(base, k * .988)); t.fillStyle = gradient; t.fillRect(x, y, size, size);
      t.fillStyle = 'rgba(255,255,255,.14)'; t.fillRect(x, y, size, 1); t.fillRect(x, y, 1, size);
      t.fillStyle = 'rgba(60,50,38,.09)'; t.fillRect(x, y + size - 1, size, 1); t.fillRect(x + size - 1, y, 1, size);
      const chips = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < chips; i++) { t.fillStyle = rnd() < .5 ? 'rgba(70,62,50,.15)' : 'rgba(255,255,255,.12)'; t.fillRect(x + 6 + rnd() * (size - 14), y + 6 + rnd() * (size - 14), 2 + rnd() * 3, 1 + rnd() * 2); }
      const at = tx * T - (ty % 2) * T / 2;
      g.drawImage(tile, at, ty * T); if (at < 0) g.drawImage(tile, at + W, ty * T);
    }
    for (let i = 0; i < 26; i++) blot(g, W, H, rnd() * W, rnd() * H, 50 + rnd() * 150, rnd() < .6 ? [70, 62, 50] : [255, 250, 235], .02 + rnd() * .025);
    grain(g, W, H, 6, rnd);
  });
}

/**
 * Kerb stones: 16 blocks of 6 world units in a row (the texture repeats every 96 units), light grey with a
 * different tone per block, thin dark joints, grime near the bottom and a few chips. v runs from the foot of the
 * kerb (0) to its top (1); the same strip is used for the top face (road side 0 -> sidewalk side 1).
 */
export function kerbTexture(scene: Scene): DynamicTexture {
  const W = 4096;
  const H = 128;
  const B = 256;
  const J = 3;
  return make(
    scene,
    'streetKerb',
    W,
    H,
    (g) => {
      const rnd = makeRng(4242);
      g.fillStyle = '#92938c';
      g.fillRect(0, 0, W, H);
      for (let b = 0; b < W / B; b++) {
        const l = 184 + rnd() * 16;
        const base: C3 = [l + (rnd() - 0.5) * 6, l, l - 2 - rnd() * 5];
        const x = b * B + J / 2;
        const w = B - J;
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, css(base, 1.04));
        gr.addColorStop(0.6, css(base, 1.0));
        gr.addColorStop(1, css(base, 0.92));
        g.fillStyle = gr;
        g.fillRect(x, 0, w, H);
        // a lit edge along the top of the face and a dark weathered edge at the foot
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(x, 0, w, 2);
        g.fillStyle = 'rgba(40,34,26,0.12)';
        g.fillRect(x, H - 7, w, 7);
        const n = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          g.fillStyle = 'rgba(55,52,46,0.35)';
          g.fillRect(x + 8 + rnd() * (w - 30), 10 + rnd() * (H - 30), 4 + rnd() * 16, 2 + rnd() * 4);
        }
      }
      for (let i = 0; i < 40; i++) blot(g, W, H, rnd() * W, rnd() * H, 40 + rnd() * 90, rnd() < 0.5 ? [60, 55, 45] : [255, 255, 250], 0.04 + rnd() * 0.05);
      grain(g, W, H, 12, rnd);
    },
    false,
  );
}

/**
 * Yellow guidance blocks (線状ブロック): four blocks of 4 x 4 world units along the strip (repeats every 16 units),
 * each with four raised bars running along the strip.
 */
export function tactileLineTexture(scene: Scene): DynamicTexture {
  const W = 512;
  const H = 128;
  return make(scene, 'streetTactile', W, H, (g) => {
    const rnd = makeRng(77);
    g.fillStyle = '#cfa416';
    g.fillRect(0, 0, W, H);
    for (let b = 0; b < 4; b++) {
      const x0 = b * 128;
      g.fillStyle = '#dfb72b';
      g.fillRect(x0 + 3, 3, 122, 122);
      for (let i = 0; i < 4; i++) {
        const y = 10 + i * 29;
        g.fillStyle = '#b99a27'; // shallow shadow under the matte bar
        g.fillRect(x0 + 10, y + 4, 108, 22);
        g.fillStyle = '#edca43';
        g.fillRect(x0 + 10, y, 108, 20);
        g.fillStyle = '#f4dc7d'; // narrow worn edge, without a metallic stripe
        g.fillRect(x0 + 10, y, 108, 2);
        g.fillStyle = '#d3af32'; // shaded lower edge
        g.fillRect(x0 + 10, y + 18, 108, 2);
      }
    }
    grain(g, W, H, 8, rnd);
  });
}

/** Yellow warning blocks (点状ブロック): 2 x 2 blocks of 4 x 4 world units (repeats every 8 units), 4 x 4 domes each. */
export function tactileDotTexture(scene: Scene): DynamicTexture {
  const S = 256;
  return make(scene, 'streetTactileDots', S, S, (g) => {
    const rnd = makeRng(78);
    g.fillStyle = '#c59b14';
    g.fillRect(0, 0, S, S);
    for (let by = 0; by < 2; by++) {
      for (let bx = 0; bx < 2; bx++) {
        const x0 = bx * 128;
        const y0 = by * 128;
        g.fillStyle = '#e6bb1d';
        g.fillRect(x0 + 3, y0 + 3, 122, 122);
        for (let j = 0; j < 4; j++) {
          for (let i = 0; i < 4; i++) {
            const cx = x0 + 16 + i * 32;
            const cy = y0 + 16 + j * 32;
            g.fillStyle = 'rgba(120,88,6,0.75)';
            g.beginPath();
            g.arc(cx + 2.5, cy + 3.5, 11.5, 0, Math.PI * 2);
            g.fill();
            const gr = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 12);
            gr.addColorStop(0, '#fdeea0');
            gr.addColorStop(0.55, '#f5cf32');
            gr.addColorStop(1, '#d4a817');
            g.fillStyle = gr;
            g.beginPath();
            g.arc(cx, cy, 11, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    grain(g, S, S, 8, rnd);
  });
}

/** Gutter cover (側溝蓋): 8 x 3 world units, dark slots between steel bars with a frame (repeats every 8 units). */
export function gutterTexture(scene: Scene): DynamicTexture {
  const W = 256;
  const H = 96;
  return make(scene, 'streetGutter', W, H, (g) => {
    const rnd = makeRng(909);
    g.fillStyle = '#25272b';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) {
      const gr = g.createLinearGradient(x + 7, 0, x + 23, 0);
      gr.addColorStop(0, '#8b8e95');
      gr.addColorStop(0.5, '#6b6e75');
      gr.addColorStop(1, '#52555b');
      g.fillStyle = gr;
      g.fillRect(x + 7, 7, 16, H - 14);
    }
    // frame along both long edges
    g.fillStyle = '#6a6d74';
    g.fillRect(0, 0, W, 7);
    g.fillRect(0, H - 7, W, 7);
    g.fillStyle = '#9a9da4';
    g.fillRect(0, 0, W, 2);
    g.fillRect(0, H - 7, W, 2);
    grain(g, W, H, 10, rnd);
  });
}

/**
 * Opacity masks for round manhole covers (white = visible), two 256 x 256 cells side by side:
 * cell 0 is the solid disc, cell 1 the lighter relief on it (rim, cross-hatching, centre ring).
 * Used as an alpha-tested opacity texture, the colours come from the vertex colours.
 */
export const MANHOLE_MASK = { disc: { u0: 0.01, u1: 0.49 }, relief: { u0: 0.51, u1: 0.99 } } as const;

export function manholeMaskTexture(scene: Scene): DynamicTexture {
  return make(
    scene,
    'streetManhole',
    512,
    256,
    (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      // relief cell
      const cx = 384;
      const cy = 128;
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.lineWidth = 9;
      g.beginPath();
      g.arc(cx, cy, 110, 0, Math.PI * 2);
      g.stroke();
      g.save();
      g.beginPath();
      g.arc(cx, cy, 96, 0, Math.PI * 2);
      g.clip();
      g.lineWidth = 5;
      for (let k = -140; k <= 140; k += 22) {
        g.beginPath();
        g.moveTo(cx + k - 140, cy - 140);
        g.lineTo(cx + k + 140, cy + 140);
        g.moveTo(cx + k + 140, cy - 140);
        g.lineTo(cx + k - 140, cy + 140);
        g.stroke();
      }
      g.restore();
      // plain centre disc where the cross-hatching stops, ring around it
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(cx, cy, 36, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7;
      g.beginPath();
      g.arc(cx, cy, 36, 0, Math.PI * 2);
      g.stroke();
    },
    false,
  );
}

/**
 * Heaps of fallen petals (花びらの吹き溜まり) as opacity masks, four 512 x 128 cells (a quad of 4 : 1) whose bottom
 * edge is laid along the kerb: cells 0-1 are lumpy solid heaps, cells 2-3 are lighter petals lying on the heaps of
 * cells 0-1 (same footprints). The two layers get different pinks from the vertex colours.
 */
export const PETAL_CELLS = 4;

export function petalMaskTexture(scene: Scene): DynamicTexture {
  const CW = 512;
  const H = 128;
  return make(
    scene,
    'streetPetals',
    CW * PETAL_CELLS,
    H,
    (g) => {
      const rnd = makeRng(5150);
      g.fillStyle = '#000';
      g.fillRect(0, 0, CW * PETAL_CELLS, H);
      g.fillStyle = '#fff';
      const gauss = (): number => (rnd() + rnd() + rnd() - 1.5) * 0.8; // about -1 .. 1
      const blob = (x: number, y: number, rx: number, ry: number, rot = 0): void => {
        g.beginPath();
        g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        g.fill();
      };
      for (let cell = 0; cell < 2; cell++) {
        const n = 2 + cell;
        for (let k = 0; k < n; k++) {
          const cx = 110 + ((k + 0.5) / n) * (CW - 220) + (rnd() - 0.5) * 36;
          const w = 58 + rnd() * 46; // half width of the heap
          const h = 50 + rnd() * 40; // its height
          // a lumpy mound: overlapping ellipses, then loose petals around its edge
          for (let i = 0; i < 7; i++) {
            const a = gauss();
            const rx = w * (0.3 + rnd() * 0.3);
            const hh = h * Math.max(0.35, 1 - a * a) * (0.6 + rnd() * 0.4);
            blob(cell * CW + cx + a * w * 0.8, H - 4 - hh * 0.5, rx, hh * 0.55 + 4);
          }
          for (let i = 0; i < 36; i++) {
            const a = gauss();
            blob(cell * CW + cx + a * w * 1.05, H - 6 - Math.pow(rnd(), 1.6) * h * 0.8, 6 + rnd() * 4, 3.4 + rnd() * 2, rnd() * Math.PI);
          }
          // the lighter petals on top, in the same footprint (cells 2-3)
          for (let i = 0; i < 20; i++) {
            const a = gauss();
            const hh = h * Math.max(0.3, 1 - a * a);
            blob((cell + 2) * CW + cx + a * w * 0.85, H - 8 - Math.pow(rnd(), 1.2) * hh * 0.85, 6 + rnd() * 3.5, 3.4 + rnd() * 1.8, rnd() * Math.PI);
          }
        }
        for (let i = 0; i < 26; i++) blob(cell * CW + 24 + rnd() * (CW - 48), H - 6 - Math.pow(rnd(), 2.4) * 70, 5 + rnd() * 3, 3 + rnd() * 1.8, rnd() * Math.PI);
      }
    },
    false,
  );
}

/**
 * Asphalt: 512 x 128 world units (4 texels per unit) with fine grain, soft tone changes, a few repair patches,
 * hairline cracks and faint wheel tracks. v = 0.5 is the centre line.
 */
export function asphaltTexture(scene: Scene): DynamicTexture {
  const W = 2048;
  const H = 512;
  return make(scene, 'streetAsphalt', W, H, (g) => {
    const rnd = makeRng(31337);
    const base: C3 = [100, 103, 114];
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const dark = rnd() < 0.55;
      blot(g, W, H, rnd() * W, rnd() * H, 60 + rnd() * 220, dark ? [40, 42, 50] : [150, 152, 160], 0.035 + rnd() * 0.04);
    }
    // wheel tracks: slightly polished / darker bands in each lane
    for (const v of [0.28, 0.72]) {
      const y = v * H;
      const gr = g.createLinearGradient(0, y - 38, 0, y + 38);
      gr.addColorStop(0, 'rgba(20,20,26,0)');
      gr.addColorStop(0.5, 'rgba(20,20,26,0.07)');
      gr.addColorStop(1, 'rgba(20,20,26,0)');
      g.fillStyle = gr;
      g.fillRect(0, y - 38, W, 76);
    }
    // small repair patches
    for (let i = 0; i < 9; i++) {
      const w = 60 + rnd() * 200;
      const h = 30 + rnd() * 90;
      const x = 10 + rnd() * (W - w - 20);
      const y = 10 + rnd() * (H - h - 20);
      g.fillStyle = rnd() < 0.55 ? 'rgba(18,18,24,0.09)' : 'rgba(190,192,200,0.05)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(15,15,20,0.14)';
      g.lineWidth = 1.5;
      g.strokeRect(x, y, w, h);
    }
    // trench repairs: narrow strips across the whole road
    for (let i = 0; i < 2; i++) {
      const x = 200 + rnd() * (W - 400);
      const w = 14 + rnd() * 12;
      g.fillStyle = 'rgba(18,18,24,0.09)';
      g.fillRect(x, 0, w, H);
      g.fillStyle = 'rgba(15,15,20,0.2)';
      g.fillRect(x, 0, 2, H);
      g.fillRect(x + w - 2, 0, 2, H);
    }
    // hairline cracks
    g.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      let x = 40 + rnd() * (W - 80);
      let y = 40 + rnd() * (H - 80);
      let a = rnd() * Math.PI * 2;
      g.strokeStyle = 'rgba(25,26,32,0.36)';
      g.lineWidth = 1 + rnd() * 0.9;
      g.beginPath();
      g.moveTo(x, y);
      const n = 8 + Math.floor(rnd() * 14);
      for (let k = 0; k < n; k++) {
        a += (rnd() - 0.5) * 1.1;
        x += Math.cos(a) * (8 + rnd() * 14);
        y += Math.sin(a) * (8 + rnd() * 14);
        if (x < 6 || x > W - 6 || y < 6 || y > H - 6) break; // keep the texture seamless: cracks never cross its edges
        g.lineTo(x, y);
      }
      g.stroke();
    }
    grain(g, W, H, 15, rnd);
  });
}
