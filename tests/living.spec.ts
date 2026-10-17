import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { SAVE_KEY } from '../src/gameplay/state';

test('the public player collects, joins the festival, enters shops, sleeps, and keeps progress', async ({ page }) => {
  test.setTimeout(600000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?model=public&gfx=low');
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
  // Simulation and UI assertions do not need to continuously rasterize the entire town in SwiftShader.
  await page.evaluate(() => window.__gp08.scene!.getEngine().stopRenderLoop());
  expect(await page.evaluate(() => window.__gp08.player!.root.name)).toBe('public-player');
  const approach = async (id: string): Promise<void> => {
    await page.evaluate(id => {
      const c = window.__gp08.gameplay!.contacts().find(c => c.id === id)!;
      if (!c) throw new Error(`missing contact ${id}`);
      window.__gp08.player!.position.set(c.x, c.y, c.z);
    }, id);
    await page.keyboard.press('KeyE');
  };
  const residentIds = await page.evaluate(() => window.__gp08.gameplay!.contacts().filter(c => c.kind === 'resident' && Math.hypot(c.x, c.z) < 650).slice(0, 3).map(c => c.id));
  expect(residentIds).toHaveLength(3);
  for (const id of residentIds) { await approach(id); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); }
  const drops = await page.evaluate(() => window.__gp08.scene!.meshes.filter(m => m.name.startsWith('collect-petal')).slice(0, 3).map(m => ({ x: m.position.x, z: m.position.z })));
  expect(drops).toHaveLength(3);
  for (const p of drops) { await page.evaluate(p => window.__gp08.player!.position.set(p.x, 0, p.z), p); await page.keyboard.press('KeyE'); }
  expect(await page.evaluate(() => window.__gp08.gameplay!.snapshot().life.petals)).toBe(3);
  await approach('festival');
  await page.getByRole('button', { name: '花びらを渡して記念品を受け取る', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('600円と緑茶');
  expect(await page.evaluate(() => window.__gp08.gameplay!.snapshot().money)).toBe(1800);
  await page.keyboard.press('Escape');
  await approach('e-wagashi');
  await page.getByRole('button', { name: 'お店の中に入る', exact: true }).click();
  expect(await page.evaluate(() => window.__gp08.gameplay!.interiors.current?.id)).toBe('e-wagashi');
  expect(await page.evaluate(() => window.__gp08.scene!.meshes.filter(m => m.name.startsWith('life_')).every(m => !m.isEnabled()))).toBe(true);
  const outside = await page.evaluate(() => window.__gp08.player!.resumePosition);
  await page.evaluate(() => window.__gp08.player!.position.set(16005, 2000, 16008));
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: /三色だんごを買う/ }).click();
  expect(await page.evaluate(() => window.__gp08.gameplay!.snapshot().inventory.dango)).toBe(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__gp08.scene!.render());
  fs.mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/living-room.png', timeout: 120000 });
  await page.evaluate(() => window.__gp08.gameplay!.save());
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).position, SAVE_KEY)).toEqual(outside);
  await page.evaluate(() => window.__gp08.player!.position.set(16000, 2000, 15950)); await page.keyboard.press('KeyE');
  expect(await page.evaluate(() => window.__gp08.gameplay!.interiors.indoor)).toBe(false);
  expect(await page.evaluate(() => window.__gp08.scene!.meshes.filter(m => m.name.startsWith('life_')).every(m => m.isEnabled()))).toBe(true);
  await approach('home');
  await page.evaluate(() => window.__gp08.player!.position.set(15986, 2000, 16028)); await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: '眠って翌朝を迎える', exact: true }).click();
  expect(await page.evaluate(() => window.__gp08.gameplay!.snapshot().life)).toMatchObject({ day: 2, minute: 480, petals: 0 });
  await page.evaluate(() => window.__gp08.player!.position.set(16000, 2000, 15950)); await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '記録1に保存', exact: true }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}.slot1`)!).life.day, SAVE_KEY)).toBe(2);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]); expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  await page.evaluate(() => window.__gp08.scene!.render());
  fs.mkdirSync('screenshots', { recursive: true }); await page.screenshot({ path: 'screenshots/living-public.png', timeout: 120000 });
  await page.reload();
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
  await page.evaluate(() => window.__gp08.scene!.getEngine().stopRenderLoop());
  expect(await page.evaluate(() => window.__gp08.gameplay!.snapshot())).toMatchObject({ version: 3, money: 1620, inventory: { dango: 1, tea: 1 }, life: { day: 2, festivalDay: 1 } });
});
