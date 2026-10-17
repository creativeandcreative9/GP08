import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('phone portrait and landscape keep the menu, interaction and movement controls reachable', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css'); const { GameUI } = await load('/src/gameplay/ui.ts');
    const { newProgress } = await load('/src/gameplay/state.ts'); const { touchControls } = await load('/src/player/touch.ts');
    const ui = new GameUI({ interact() {}, inventory() {}, journal() {}, guide() {}, map() {}, save() {}, life() {}, settings() {}, modal() {} });
    ui.update(newProgress()); ui.time('1日目 14:00 · 晴れ · 桜まつり'); ui.navigate('目的地：和菓子屋 · 北へ約120m。地図で経路を確認しよう。');
    ui.nearby({ id: 'resident-0', name: '佐倉 はる', kind: 'resident' });
    ui.message('公園の花びらを探してみよう。暮らしの手帳で収集品とまつりの進み具合を確認できます。');
    touchControls({ setTouch() {} });
  });
  const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  fs.mkdirSync('screenshots', { recursive: true });
  for (const [width, height, name] of [[390, 844, 'portrait'], [844, 390, 'landscape']] as const) {
    await page.setViewportSize({ width, height });
    const boxes = [];
    for (const label of ['持ち物 [I]', '地図 [M]', '設定']) {
      const button = page.getByRole('button', { name: label, exact: true }); await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); boxes.push(box);
    }
    const prompt = page.locator('.life-interact'), pad = page.locator('.touch-pad');
    await expect(prompt).toBeInViewport(); await expect(pad).toBeInViewport();
    const p = (await prompt.boundingBox())!, stick = (await pad.boundingBox())!;
    expect(intersects(p, stick)).toBe(false);
    for (const box of boxes) expect(intersects(box, p)).toBe(false);
    await page.screenshot({ path: `screenshots/touch-${name}.png` });
  }
});
