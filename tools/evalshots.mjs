// Comparison shots for the visual evaluation (docs/20261016_visual_eval.md).
//
// Usage: node tools/evalshots.mjs [--tag 20261016_r0] [--views ref1,ref2,ref3,ref4,ref5] [--wait 1500]
//                                 [--refs ../gp08-assets/refs] [--query "&extra=1"]
//
// Saves screenshots/eval/<tag>/<view>.png (screenshots/ is git-ignored: never commit them) and
// screenshots/eval/<tag>/metrics.json, and prints a table of image metrics.
// Reference images (ref1.png / ref1.jpg ... in the --refs directory, default ../gp08-assets/refs) are
// optional: when present, the same metrics are computed for them and a similarity score (0-100) is printed.
// They are private material: keep them in the private asset repository, never in this repository.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const tag = arg('tag', `${today}_eval`);
const views = arg('views', 'ref1,ref2,ref3,ref4,ref5').split(',').filter(Boolean);
const wait = Number(arg('wait', '1500'));
const extra = arg('query', '');
const refsDir = path.resolve(arg('refs', path.join('..', 'gp08-assets', 'refs')));
const port = Number(process.env.GP08_PORT ?? 5178);
const outDir = path.resolve('screenshots', 'eval', tag);

/**
 * Image metrics, computed in the page on a 640x360 copy of the image (after cropping `top`/`bottom` fractions,
 * e.g. a video player's controls). All are resolution independent.
 */
async function metricsInPage({ url, top, bottom }) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = 640;
  const H = 360;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const sy = img.height * top;
  g.drawImage(img, 0, sy, img.width, img.height * (1 - top - bottom), 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const n = W * H;
  const L = new Float32Array(n);
  let sumL = 0;
  let sumS = 0;
  let pink = 0;
  let rgS = 0, ybS = 0, rgQ = 0, ybQ = 0;
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    L[i] = l;
    sumL += l;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const s = mx > 0 ? (mx - mn) / mx : 0;
    sumS += s;
    let h = 0;
    if (mx > mn) {
      if (mx === r) h = ((gg - b) / (mx - mn)) % 6;
      else if (mx === gg) h = (b - r) / (mx - mn) + 2;
      else h = (r - gg) / (mx - mn) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    if ((h >= 315 || h <= 12) && s >= 0.1 && s <= 0.65 && mx >= 0.6) pink++;
    const rg = (r - gg) * 255, yb = (0.5 * (r + gg) - b) * 255;
    rgS += rg; ybS += yb; rgQ += rg * rg; ybQ += yb * yb;
    const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const meanL = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (L[i] - meanL) ** 2;
  // colour entropy (bits, 4 bits per channel)
  let entropy = 0;
  for (const c of hist.values()) {
    const p = c / n;
    entropy -= p * Math.log2(p);
  }
  // edges (Sobel) and fine detail (Laplacian)
  let edges = 0;
  let lap = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1];
      const gy = L[i + W - 1] + 2 * L[i + W] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - W] - L[i - W + 1];
      if (Math.hypot(gx, gy) > 0.12) edges++;
      lap += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]);
    }
  }
  const inner = (W - 2) * (H - 2);
  // local structure: mean std inside 8x8 blocks, and "shade" = share of pixels clearly darker than their surroundings
  let blockStd = 0;
  let blocks = 0;
  for (let by = 0; by + 8 <= H; by += 8) {
    for (let bx = 0; bx + 8 <= W; bx += 8) {
      let s = 0, q = 0;
      for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
        const v = L[y * W + x];
        s += v;
        q += v * v;
      }
      const m = s / 64;
      blockStd += Math.sqrt(Math.max(0, q / 64 - m * m));
      blocks++;
    }
  }
  // integral image for a 25x25 box mean
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += L[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
    }
  }
  let shade = 0;
  const R = 12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      if (L[y * W + x] < m * 0.72) shade++;
    }
  }
  const mrg = rgS / n, myb = ybS / n;
  const colorfulness = Math.sqrt(Math.max(0, rgQ / n - mrg * mrg) + Math.max(0, ybQ / n - myb * myb)) + 0.3 * Math.hypot(mrg, myb);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    edges: r3(edges / inner), // share of edge pixels: amount of drawn detail
    detail: r3((lap / inner) * 100), // mean |Laplacian| x100: fine texture
    blockStd: r3((blockStd / blocks) * 100), // mean local contrast x100
    entropy: r3(entropy), // colour entropy in bits (flat colours -> low)
    shade: r3(shade / n), // share of pixels in local shadow (cast shadows, AO, crevices)
    lumaMean: r3(meanL),
    lumaStd: r3(Math.sqrt(varL / n)),
    saturation: r3(sumS / n),
    colorfulness: r3(colorfulness),
    pink: r3(pink / n), // cherry blossom pink share
  };
}

const toDataUrl = (file) => {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};

let server;
let browser;
let failed = false;
try {
  fs.mkdirSync(outDir, { recursive: true });
  server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true } });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => {
    failed = true;
    console.error(`[pageerror] ${e.message}`);
  });
  const ours = {};
  for (const v of views) {
    await page.goto(`http://127.0.0.1:${port}/?model=none&view=${v}${extra}`);
    await page.waitForFunction(() => window.__gp08 && window.__gp08.ready === true, null, { timeout: 120000 });
    await page.addStyleTag({ content: '#hud, #help { display: none !important; }' });
    await page.waitForTimeout(wait);
    const file = path.join(outDir, `${v}.png`);
    await page.locator('canvas').screenshot({ path: file });
    const fps = await page.evaluate(() => document.getElementById('fps')?.textContent ?? '');
    ours[v] = { file: path.relative(process.cwd(), file), fps, ...(await page.evaluate(metricsInPage, { url: toDataUrl(file), top: 0, bottom: 0 })) };
    console.log(`shot ${v}: ${ours[v].file} (${fps})`);
  }

  // optional reference images
  const refs = {};
  if (fs.existsSync(refsDir)) {
    const blank = await browser.newPage();
    for (const v of views) {
      const f = ['.png', '.jpg', '.jpeg', '.webp'].map((e) => path.join(refsDir, v + e)).find((p) => fs.existsSync(p));
      if (!f) continue;
      // reference frames are video screenshots: drop the player controls at the bottom
      refs[v] = await blank.evaluate(metricsInPage, { url: toDataUrl(f), top: 0.03, bottom: 0.17 });
    }
  }

  const keys = ['edges', 'detail', 'blockStd', 'entropy', 'shade', 'lumaMean', 'lumaStd', 'saturation', 'colorfulness', 'pink'];
  const rows = [['view', ...keys]];
  for (const v of views) {
    rows.push([v, ...keys.map((k) => String(ours[v][k]))]);
    if (refs[v]) rows.push([`  ${v} (reference)`, ...keys.map((k) => String(refs[v][k]))]);
  }
  const width = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(width[i])).join('  '));

  // similarity to the references: 100 = same metric values (only for views that have a reference image)
  const sim = {};
  for (const v of views) {
    if (!refs[v]) continue;
    const s = keys.map((k) => {
      const a = ours[v][k];
      const b = refs[v][k];
      const scale = Math.max(Math.abs(b), 0.02);
      return Math.max(0, 1 - Math.abs(a - b) / scale);
    });
    sim[v] = Math.round((s.reduce((x, y) => x + y, 0) / s.length) * 100);
  }
  if (Object.keys(sim).length) console.log('similarity to the reference images (0-100):', sim);
  else console.log(`(no reference images in ${refsDir}: metrics are tracked without a similarity score)`);

  // merge with an earlier run of the same tag (e.g. when only some views were re-shot)
  const file = path.join(outDir, 'metrics.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(
    file,
    JSON.stringify(
      { tag, views: { ...prev.views, ...ours }, refs: { ...prev.refs, ...refs }, similarity: { ...prev.similarity, ...sim } },
      null,
      2,
    ),
  );
  console.log(`saved ${path.relative(process.cwd(), path.join(outDir, 'metrics.json'))}`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
