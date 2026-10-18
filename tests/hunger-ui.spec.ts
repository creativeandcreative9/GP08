import { expect, test, type Page } from '@playwright/test';
import type { GameUI } from '../src/gameplay/ui';
import type { Progress } from '../src/gameplay/state';

test.use({ hasTouch: true });

declare global { interface Window { hungerHarness: { ui: GameUI; progress: Progress; shop(): void } } }

async function hud(page: Page): Promise<void> {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css'); await load('/src/gameplay/wayfinder.css');
    const { GameUI } = await load('/src/gameplay/ui.ts');
    const { newProgress, consume, buy } = await load('/src/gameplay/state.ts');
    const { Wayfinder } = await load('/src/gameplay/wayfinder.ts');
    const { touchControls } = await load('/src/player/touch.ts');
    const progress = newProgress(); progress.hunger = 75; progress.inventory.dango = 1; progress.inventory.tea = 1;
    const noop = (): void => {};
    const ui = new GameUI({ interact: noop, inventory: () => ui.inventory(progress, (id: string) => {
      const result = consume(progress, id); ui.update(progress); return result;
    }), journal: noop, guide: noop, map: noop, save: noop, settings: noop, modal: noop, life: noop });
    ui.update(progress); ui.time('1日目 14:00 · 晴れ · 桜まつり'); ui.promptText('近くの人と話す [E]');
    const guide = new Wayfinder();
    guide.update({ enabled: true, visible: true, target: { id: 'beach', name: '海辺の散歩道' },
      player: { x: 0, z: 0 }, waypoint: { x: 0, z: 100 }, cameraForward: { x: 0, z: 1 }, distanceMetres: 120, arrived: false });
    touchControls({ setTouch: noop });
    window.hungerHarness = { ui, progress, shop: () => ui.shop({ id: 'e-wagashi', name: '和菓子屋', kind: 'shop', line: '散歩のおともに。' }, progress,
      (id: string) => buy(progress, id, 'e-wagashi'), () => ({ ok: false, message: '' })) };
  });
}

test('hunger opens useful food information and eating refreshes the reading without changing button names', async ({ page }) => {
  await hud(page);
  const hunger = page.locator('.life-hunger');
  await expect(hunger).toHaveAccessibleName('空腹度 75 / 100、空腹。持ち物を開く');
  await hunger.click();
  await expect(page.getByRole('dialog', { name: '持ち物' })).toBeVisible();
  await expect(page.locator('.life-hunger-summary')).toHaveText('いまの空腹度 75 / 100 · 空腹');
  await expect(page.getByRole('dialog')).toContainText('自宅で無料の食事');
  await expect(page.getByRole('dialog')).toContainText('空腹でも走れます');
  const dango = page.getByRole('button', { name: '三色だんごを食べる（1個）', exact: true });
  await expect(dango).toHaveAccessibleDescription('空腹度 −25');
  await expect(page.getByRole('button', { name: '緑茶を飲む（1個）', exact: true })).toHaveAccessibleDescription('空腹度 −3');
  await dango.click();
  await expect(page.locator('.life-hunger-summary')).toHaveText('いまの空腹度 50 / 100 · 小腹');
  expect(await page.evaluate(() => window.hungerHarness.progress.hunger)).toBe(50);
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
  await expect(hunger).toHaveAccessibleName('空腹度 50 / 100、小腹。持ち物を開く');
  await expect(page.locator('.life-interact')).toBeFocused();
  await page.evaluate(() => window.hungerHarness.shop());
  await expect(page.getByRole('button', { name: '三色だんごを買う · 180円（所持 0個）', exact: true })).toHaveAccessibleDescription('食べると空腹度 −25');
  await expect(page.getByRole('button', { name: '緑茶を買う · 150円（所持 1個）', exact: true })).toHaveAccessibleDescription('飲むと空腹度 −3');
});

test('vitals name hunger states and show continuous sprint speed only while running', async ({ page }) => {
  await hud(page);
  for (const [hunger, label] of [[0, '満腹'], [30, '小腹'], [70, '空腹'], [100, '空腹']] as const) {
    await page.evaluate(hunger => window.hungerHarness.ui.vitals(hunger, 2.1, true), hunger);
    await expect(page.locator('.life-hunger')).toHaveAccessibleName(`空腹度 ${hunger} / 100、${label}。持ち物を開く`);
    await expect(page.locator('.life-sprint')).toHaveText('走る ×2.1');
    await expect(page.locator('.life-sprint')).toBeVisible();
  }
  await page.evaluate(() => window.hungerHarness.ui.vitals(100, 3, true));
  await expect(page.locator('.life-sprint')).toHaveText('走る ×3.0');
  expect(await page.locator('.life-sprint').evaluate(node => node.closest('[aria-live="polite"], [aria-live="assertive"], [role="status"]') === null)).toBe(true);
  await page.evaluate(() => window.hungerHarness.ui.vitals(100, 1, false));
  await expect(page.locator('.life-sprint')).toBeHidden();
});

test('food and sprint readings fit with touch menus and route guidance in both orientations', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await hud(page);
  await page.evaluate(() => {
    const { ui, progress } = window.hungerHarness;
    progress.money = 1_000_000; ui.update(progress); ui.vitals(100, 3, true);
  });
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const hunger = page.locator('.life-hunger');
    await expect(hunger).toBeInViewport({ ratio: 1 });
    expect((await hunger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const boxes = [];
    for (const selector of ['.life-identity', '.life-toolbar', '.life-wayfinder']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      boxes.push({ selector, ...(await page.locator(selector).boundingBox())! });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y,
        `${width}×${height}: ${a.selector} overlaps ${b.selector}`).toBe(false);
    }
    for (const selector of ['.life-identity', '.life-status', '.life-resources']) {
      expect(await page.locator(selector).evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${width}: ${selector} overflows`).toBe(true);
    }
    for (const label of ['持ち物 [I]', '地図 [M]', '暮らし', '設定']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`hunger-${width}.png`) });
  }
});
