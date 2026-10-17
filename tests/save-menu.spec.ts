import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY } from '../src/gameplay/state';

async function start(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css');
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { TransformNode } = await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const { Player } = await load('/src/player/player.ts'); const { createPublicAvatar } = await load('/src/player/avatar.ts');
    const { Gameplay } = await load('/src/gameplay.ts');
    const engine = new NullEngine(), scene = new Scene(engine), canvas = document.querySelector('canvas')!;
    const camera = new ArcRotateCamera('test', 0, 1, 60, new Vector3(), scene);
    const town = { root: new TransformNode('town', scene), spots: {}, obstacles: [], summitDeck: { x: -200, y: 0, z: -200 }, heightAt: () => 0 };
    scene.metadata = { town };
    const player = new Player({ scene, camera, avatar: createPublicAvatar(scene), spawn: { x: 0, z: 0 } });
    const game = new Gameplay({ scene, camera, town, rendering: { quality: 'low', addShadowCaster() {} } }, player, canvas);
    (window as unknown as { mini: typeof game }).mini = game;
  });
}

test('save-slot confirmation restores the selected record and reset keeps manual records', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/'); await start(page);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByRole('button', { name: '動作を30秒測る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '記録1に保存', exact: true }).click();
  const original = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}.slot1`)!), SAVE_KEY);
  expect(original.money).toBe(1200);
  await page.keyboard.press('Escape');
  // Simulate a different valid primary save and start the real controller from it.
  await page.addInitScript(key => { if (sessionStorage.getItem('gp08-menu-seeded')) return; const p = JSON.parse(localStorage.getItem(key)!); p.money = 900; p.life.day = 2; localStorage.setItem(key, JSON.stringify(p)); sessionStorage.setItem('gp08-menu-seeded', 'yes'); }, SAVE_KEY);
  await page.reload(); await start(page);
  await expect(page.locator('.life-bar')).toContainText('所持金 900円');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '記録1を読み込む', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('現在の自動保存をこの記録で置き換えます');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).money, SAVE_KEY)).toBe(900);
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'この記録を読み込む', exact: true }).click()]);
  await start(page); await expect(page.locator('.life-bar')).toContainText('所持金 1,200円');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '最初から始める', exact: true }).click();
  expect(await page.evaluate(key => !!localStorage.getItem(key), SAVE_KEY)).toBe(true);
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '自動保存を消して始める', exact: true }).click()]);
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBeNull();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}.slot1`)!), SAVE_KEY)).toEqual(original);
  await start(page); await expect(page.locator('.life-bar')).toContainText('所持金 1,200円');
});
