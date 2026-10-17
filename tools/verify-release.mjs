import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { PNG } from 'pngjs';
// Run after npm run build. The server exposes only dist/, under a subdirectory.
const directory = path.resolve('dist'), output = path.resolve('screenshots');
const port = Number(process.env.GP08_RELEASE_PORT ?? 5190);
const base = `http://127.0.0.1:${port}/game/`;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const files = fs.readdirSync(directory, { recursive: true }).filter(file => fs.statSync(path.join(directory, file)).isFile());
const entrypoints = Object.fromEntries(files.filter(file => /^assets\/index-[\w-]+\.(js|css)$/.test(file)).map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
if (!Object.keys(entrypoints).some(file => file.endsWith('.js'))) throw new Error('Missing built application entry');
if (files.some(file => /\.(pmx|pmd|vmd|vpd|zip|png|jpe?g|bmp|tga)$/i.test(file))) throw new Error('Unexpected private/archive/image asset in dist');
const server = http.createServer((req, res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
  if (!relative.startsWith('/game/')) { res.writeHead(404).end(); return; }
  const filename = path.resolve(directory, relative.slice('/game/'.length) || 'index.html');
  if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(filename).pipe(res);
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
let browser;
const errors = [], privateRequests = [], reports = [];
fs.mkdirSync(output, { recursive: true });
const luminance = filename => {
  const png = PNG.sync.read(fs.readFileSync(filename)); let total = 0;
  for (let i = 0; i < png.data.length; i += 4) total += .2126 * png.data[i] + .7152 * png.data[i + 1] + .0722 * png.data[i + 2];
  return total / (png.width * png.height * 255);
};
try {
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const watch = page => {
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (new URL(r.url()).pathname.includes('/private/')) privateRequests.push(r.url()); });
    page.on('console', m => { if (m.text().startsWith('[town] town meshes:')) reports.push(m.text()); });
  };
  watch(page);
  await page.addInitScript(() => {
    window.__releaseAudio = [];
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = new Proxy(OriginalAudioContext, { construct(target, args) {
      const context = Reflect.construct(target, args); window.__releaseAudio.push(context); return context;
    } });
    const view = new URL(location.href).searchParams.get('release-view');
    if (!view) return;
    const p = JSON.parse(localStorage.getItem('gp08.life.v1'));
    p.life.minute = view === 'night' ? 1200 : 840; p.life.day = 4; p.life.weather = view === 'rain' ? 'rain' : 'clear'; p.life.sound = false;
    p.position = view === 'rain' ? { x: -69.2, z: -994.6 } : null;
    localStorage.setItem('gp08.life.v1', JSON.stringify(p));
  });
  const ready = async () => page.waitForFunction(() => window.__gp08?.ready, null, { timeout: 300000 });
  await page.goto(base, { timeout: 300000 }); await ready();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('.life-bar')).toContainText('所持金 1,200円');
  await page.getByRole('button', { name: '持ち物 [I]', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('まだ何も持っていません'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '音をオンにする（BGM・環境音・足音）', exact: true }).click();
  await page.waitForFunction(() => window.__releaseAudio.some(context => context.state === 'running'), null, { timeout: 30000 });
  const audioOn = await page.evaluate(() => window.__releaseAudio.map(context => context.state));
  await page.getByRole('button', { name: '音をオフにする', exact: true }).click();
  await page.waitForFunction(() => window.__releaseAudio.every(context => context.state === 'suspended'), null, { timeout: 30000 });
  const audioOff = await page.evaluate(() => window.__releaseAudio.map(context => context.state));
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('canvas').screenshot({ path: path.join(output, 'release-day-canvas.png'), timeout: 180000 });
  await page.screenshot({ path: path.join(output, 'release-day.png'), timeout: 180000 });
  await page.goto(`${base}?release-view=night`, { timeout: 300000 }); await ready();
  await expect(page.locator('.life-clock')).toContainText('20:');
  await page.screenshot({ path: path.join(output, 'release-night.png'), timeout: 180000 });
  await page.goto(`${base}?release-view=rain`, { timeout: 300000 }); await ready();
  const f = await page.evaluate(() => window.__gp08.frames); await page.waitForFunction(f => window.__gp08.frames >= f + 15, f, { timeout: 180000 });
  await expect(page.locator('.life-clock')).toContainText('雨');
  await page.screenshot({ path: path.join(output, 'release-rain.png'), timeout: 180000 });
  const result = { verifiedAt: new Date().toISOString(), entrypoints, files: files.length, privateRequests, errors, reports, audioOn, audioOff, dayLuma: luminance(path.join(output, 'release-day.png')), nightLuma: luminance(path.join(output, 'release-night.png')), builtState: await page.evaluate(() => ({ ready: window.__gp08.ready, debugScene: !!window.__gp08.scene, errors: window.__gp08.errors, saveVersion: JSON.parse(localStorage.getItem('gp08.life.v1')).version })) };
  // Close the desktop renderer before the touch viewport: only one software GPU workload at a time.
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); watch(mobile);
  await mobile.goto(base, { timeout: 300000 });
  await mobile.waitForFunction(() => window.__gp08?.ready, null, { timeout: 300000 });
  const saveMobile = async () => {
    await mobile.getByRole('button', { name: '設定', exact: true }).tap();
    await mobile.getByRole('button', { name: '今の進行を保存', exact: true }).tap();
    await mobile.getByRole('button', { name: '閉じる [Esc]', exact: true }).tap();
    return mobile.evaluate(() => JSON.parse(localStorage.getItem('gp08.life.v1')).position);
  };
  const before = await saveMobile(), pad = await mobile.locator('.touch-pad').boundingBox();
  expect(pad).not.toBeNull();
  const touch = await mobile.context().newCDPSession(mobile), x = pad.x + pad.width / 2, y = pad.y + pad.height / 2;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 32 }] });
  const startFrame = await mobile.evaluate(() => window.__gp08.frames);
  await mobile.waitForFunction(f => window.__gp08.frames >= f + 8, startFrame, { timeout: 180000 });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await saveMobile();
  result.touchDistance = Math.hypot(after.x - before.x, after.z - before.z);
  expect(result.touchDistance).toBeGreaterThan(1);
  // Exercise the shipped, opt-in measurement UI without exposing production scene internals.
  await mobile.getByRole('button', { name: '設定', exact: true }).tap();
  await mobile.getByRole('button', { name: '動作を30秒測る', exact: true }).tap();
  await expect(mobile.locator('.life-notice')).toContainText('計測完了', { timeout: 180000 });
  await mobile.getByRole('button', { name: '設定', exact: true }).tap();
  const measurement = mobile.getByRole('textbox', { name: '動作確認の結果', exact: true });
  result.performanceCheck = JSON.parse(await measurement.inputValue());
  expect(result.performanceCheck.durationMs).toBeGreaterThanOrEqual(30000);
  expect(result.performanceCheck.frames).toBeGreaterThan(1);
  expect(result.performanceCheck.meanFPS).toBeGreaterThan(0);
  expect(result.performanceCheck.start.mode).toBe('auto');
  expect(result.performanceCheck.end.quality).toBe('low');
  expect(result.performanceCheck.build).toMatch(/^index-[\w-]+\.js$/);
  expect(result.performanceCheck).not.toHaveProperty('url');
  expect(result.performanceCheck).not.toHaveProperty('save');
  await measurement.scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: path.join(output, 'release-performance.png'), timeout: 180000 });
  await mobile.getByRole('button', { name: '閉じる [Esc]', exact: true }).tap();
  await mobile.screenshot({ path: path.join(output, 'release-portrait.png'), timeout: 180000 });
  await mobile.setViewportSize({ width: 844, height: 390 });
  await expect(mobile.getByRole('button', { name: '設定', exact: true })).toBeInViewport();
  await expect(mobile.locator('.touch-pad')).toBeInViewport();
  await mobile.screenshot({ path: path.join(output, 'release-landscape.png'), timeout: 180000 });
  result.mobileErrors = await mobile.evaluate(() => window.__gp08.errors);
  expect(result.dayLuma - result.nightLuma).toBeGreaterThan(.04); expect(privateRequests).toEqual([]); expect(errors).toEqual([]); expect(result.builtState.errors).toEqual([]); expect(result.mobileErrors).toEqual([]); expect(result.builtState.debugScene).toBe(false); expect(result.builtState.saveVersion).toBe(3); expect(reports.length).toBe(4);
  fs.writeFileSync(path.join(output, 'release-check.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
