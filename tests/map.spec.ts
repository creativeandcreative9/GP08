import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { mapPlaces, navigationText, worldToMap, type MapPlace } from '../src/gameplay/map';
import { mapToWorld } from '../src/town/layout';
import { BEACH_WIDTH, coastS } from '../src/town/heights';
import type { Town } from '../src/town/build';
import { newProgress, SAVE_KEY } from '../src/gameplay/state';

test('map projection preserves world position and puts north at the top', () => {
  for (const [x, y] of [[650, 500], [0, 0], [-60, 900], [1400, 1050], [-900, 2500]]) {
    const p = worldToMap(mapToWorld(x, y));
    expect(p.x).toBeCloseTo(x, 8);
    expect(p.y).toBeCloseTo(y, 8);
  }
  expect(worldToMap({ x: 0, z: 100 }).y).toBeLessThan(worldToMap({ x: 0, z: 0 }).y);
});

test('map destinations use real shop doors and the deck surface, omitting blocked landmarks', () => {
  const town = {
    summitDeck: { x: -3800, z: -2100, y: 1008 }, heightAt: () => 1000,
    obstacles: [{ minX: -10, maxX: 10, minZ: 170, maxZ: 190 }],
  } as unknown as Town;
  const places = mapPlaces(town, [{ id: 'w-cafe', name: '喫茶 はるいろ', kind: 'shop', line: '', x: -991, z: 95, y: 0 }]);
  expect(places.find(p => p.id === 'w-cafe')).toMatchObject({ x: -991, z: 95, y: 0, kind: 'shop' });
  expect(places.find(p => p.id === 'summit')).toMatchObject(town.summitDeck);
  const beach = places.find(p => p.id === 'beach')!;
  expect(coastS(beach.x, beach.z)).toBeCloseTo(-BEACH_WIDTH * 0.8);
  expect(places.some(p => p.id === 'plaza')).toBe(false);
  expect(new Set(places.map(p => p.id)).size).toBe(places.length);
});

test('navigation uses compass directions and metres, with different shop and landmark arrivals', () => {
  const origin = { x: 0, z: 0, y: 0 };
  const target: MapPlace = { id: 'beach', name: '海辺', kind: 'landmark', ...origin };
  for (const [x, z, direction] of [[0, 100, '北'], [100, 0, '東'], [0, -100, '南'], [-100, 0, '西']] as const) {
    expect(navigationText(origin, { ...target, x, z }, { obstacles: [] })).toContain(`直線約8m · ${direction}へ`);
  }
  expect(navigationText(origin, target, { obstacles: [] })).toContain('海辺に到着');
  expect(navigationText(origin, target, { obstacles: [] })).not.toContain('買い物');
  expect(navigationText(origin, { ...target, y: 40 }, { obstacles: [] })).not.toContain('到着');
  const shop = { ...target, kind: 'shop' as const, x: 20 };
  expect(navigationText(origin, shop, { obstacles: [] })).toContain('E キーで買い物');
  expect(navigationText(origin, shop, { obstacles: [{ minX: 8, maxX: 12, minZ: -5, maxZ: 5 }] })).not.toContain('到着');
});

test('the map retains outlying current positions and accessible destination controls on small screens', async ({ page }) => {
  // Exercise the real DOM component without loading the 3D scene or private assets.
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const stylePath = '/src/style.css';
    await import(/* @vite-ignore */ stylePath);
    const modulePath = '/src/gameplay/ui.ts';
    const { GameUI } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/gameplay/ui');
    const ui = new GameUI({ interact() {}, inventory() {}, journal() {}, guide() {}, map() {}, save() {}, life() {}, settings() {}, modal() {} });
    const places: MapPlace[] = [{ id: 'shop', name: 'お店', kind: 'shop', x: 0, z: 0, y: 0 },
      ...Array.from({ length: 6 }, (_, i): MapPlace => ({ id: `place-${i}`, name: `散歩の目的地${i + 1}`, kind: 'landmark', x: i * 200, z: 100, y: 0 }))];
    ui.map({ x: 9500, z: -9500 }, places, 'shop', 'shop', place => ui.message(place.name));
  });
  const drawing = page.locator('.life-map');
  const dimensions = await drawing.evaluate(node => {
    const box = (node as SVGSVGElement).viewBox.baseVal;
    const current = node.querySelector('[data-current]') as SVGGraphicsElement;
    const at = current.transform.baseVal.getItem(0).matrix;
    return { x: at.e, y: at.f, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
  });
  expect(dimensions.x).toBeGreaterThan(dimensions.left);
  expect(dimensions.x).toBeLessThan(dimensions.right);
  expect(dimensions.y).toBeGreaterThan(dimensions.top);
  expect(dimensions.y).toBeLessThan(dimensions.bottom);
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.locator('.life-map').evaluate(node => node.getBoundingClientRect().width)).toBeLessThan(390);
  await page.getByRole('button', { name: '7. 散歩の目的地6へ案内', exact: true }).focus();
  await expect(page.getByRole('button', { name: '7. 散歩の目的地6へ案内', exact: true })).toBeInViewport();
  const choice = page.getByRole('button', { name: '1. お店（配達先）へ案内', exact: true });
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.life-notice')).toHaveText('お店');
});

test('a player can inspect the map, select a landmark, and return to the active delivery', async ({ page }) => {
  test.skip(!fs.existsSync('private-assets/seisen/清泉吹雪太眉LO.pmx'), 'private model pack required');
  test.setTimeout(600000);
  const progress = newProgress();
  progress.money = 0;
  progress.greeted = ['resident-0'];
  progress.errand = { resident: 'resident-0' };
  await page.addInitScript(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: SAVE_KEY, progress });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?model=fubuki&gfx=low');
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
  await page.keyboard.press('KeyM');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('街の地図');
  await expect(page.locator('.life-map-places button')).toHaveCount(8);
  await expect(page.getByRole('button', { name: /和菓子屋（配達先）へ案内/ })).toHaveAttribute('aria-pressed', 'true');
  const at = await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z, frame: window.__gp08.frames }));
  const transform = await page.locator('[data-current]').getAttribute('transform');
  const projected = worldToMap(at);
  expect(transform).toBe(`translate(${projected.x} ${projected.y})`);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(frame => window.__gp08.frames >= frame + 3, at.frame, { timeout: 60000 });
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z }))).toEqual({ x: at.x, z: at.z });
  fs.mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/map-desktop.png', timeout: 60000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'screenshots/map-portrait.png', timeout: 60000 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: /駅前公園へ案内/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.life-navigation')).toContainText('駅前公園');
  await page.evaluate(() => window.__gp08.player!.position.set(0, 0, 180));
  await expect(page.locator('.life-navigation')).toContainText('駅前公園に到着', { timeout: 30000 });
  await page.getByRole('button', { name: '地図 [M]', exact: true }).click();
  await expect(page.getByRole('button', { name: /駅前公園へ案内/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /和菓子屋（配達先）へ案内/ })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyJ');
  await expect(dialog).not.toHaveClass(/life-dialog-map/);
  await expect(dialog).toContainText('佐倉 はる');
  await page.getByRole('button', { name: '配達先へ案内', exact: true }).click();
  await expect(page.locator('.life-navigation')).toContainText('和菓子屋');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.version).toBe(3);
  expect(saved.errand).toEqual(progress.errand);
  expect(saved.money).toBe(0);
  expect(saved.inventory).toEqual(progress.inventory);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  expect(errors).toEqual([]);
});
