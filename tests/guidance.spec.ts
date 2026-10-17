import { expect, test, type Page } from '@playwright/test';
import { newProgress, SAVE_KEY, type Progress } from '../src/gameplay/state';

interface GuidanceHarness {
  snapshot(): Progress;
  refresh(): void;
  step(seconds: number, frames?: number): void;
  trySleepingOutside(): void;
  approachHome(): void;
  approachBench(): string;
}
declare global { interface Window { guidanceHarness: GuidanceHarness } }

/** Real controller and DOM, with a tiny town and NullEngine instead of a GPU world. */
async function start(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css');
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { TransformNode } = await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const { HemisphericLight } = await load('/node_modules/@babylonjs/core/Lights/hemisphericLight.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { Player } = await load('/src/player/player.ts');
    const { createPublicAvatar } = await load('/src/player/avatar.ts');
    const { Gameplay } = await load('/src/gameplay.ts');
    const engine = new NullEngine(), scene = new Scene(engine), canvas = document.querySelector('canvas')!;
    const camera = new ArcRotateCamera('test', -Math.PI / 2, 1.25, 60, new Vector3(), scene);
    new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    new DirectionalLight('sun', new Vector3(-1, -1, 1), scene);
    const town = {
      root: new TransformNode('town', scene), spots: {}, obstacles: [], lamps: [],
      home: { x: 300, z: -160 }, summitDeck: { x: -600, y: 0, z: -600 }, heightAt: () => 0,
    };
    scene.metadata = { town };
    const player = new Player({ scene, camera, avatar: createPublicAvatar(scene), spawn: { x: 0, z: 0 } });
    camera.getViewMatrix(true);
    const game = new Gameplay({ scene, camera, town, rendering: { quality: 'low', addShadowCaster() {} } }, player, canvas);
    const refresh = (): void => { camera.getViewMatrix(true); game.updateNearby(); game.updateWayfinder(); };
    window.guidanceHarness = {
      snapshot: () => game.snapshot(), refresh,
      step: (seconds, frames = 1) => {
        const delta = engine.getDeltaTime;
        engine.getDeltaTime = () => seconds * 1000;
        try { for (let i = 0; i < frames; i++) scene.onBeforeRenderObservable.notifyObservers(scene); }
        finally { engine.getDeltaTime = delta; }
        refresh();
      },
      trySleepingOutside: () => game.sleep(),
      approachHome: () => { player.position.set(town.home.x, 0, town.home.z); refresh(); },
      approachBench: () => {
        const bench = game.restSpots().find((b: { x: number; z: number }) => b.x < 0 && b.z === 180)!;
        player.position.set(bench.exit.x, bench.exit.y, bench.exit.z); refresh();
        return bench.id;
      },
    };
  });
}

async function boot(page: Page, progress: Progress): Promise<void> {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: SAVE_KEY, progress });
  await start(page);
}

const snapshot = (page: Page): Promise<Progress> => page.evaluate(() => window.guidanceHarness.snapshot());
const refresh = (page: Page): Promise<void> => page.evaluate(() => window.guidanceHarness.refresh());

test('21:00 offers returning home or continuing a walk without skipping the night or opening a forced dialog', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 }; progress.life.minute = 21 * 60;
  await boot(page, progress);
  await expect(page.locator('.life-context')).toContainText('朝8時');
  await expect(page.getByRole('button', { name: '自宅への帰り道を案内', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '夜の散歩を続ける', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await snapshot(page)).life.minute).toBe(1260);
  await page.evaluate(() => window.guidanceHarness.step(1, 3));
  expect((await snapshot(page)).life).toMatchObject({ day: 1, minute: 1263 });
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.evaluate(() => window.guidanceHarness.step(1, 3));
  expect((await snapshot(page)).life.minute).toBe(1263);
});

test('choosing a night walk dismisses only tonight’s hint and preserves the choice after a reload', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 }; progress.life.minute = 1260;
  await boot(page, progress);
  await page.getByRole('button', { name: '夜の散歩を続ける', exact: true }).click();
  await expect(page.locator('.life-context')).not.toBeVisible();
  expect((await snapshot(page)).preferences.nightHintDay).toBe(2);
  expect((await snapshot(page)).life).toMatchObject({ day: 1, minute: 1260 });
  await page.reload(); await start(page);
  await expect(page.getByRole('button', { name: '夜の散歩を続ける', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await expect(page.getByRole('button', { name: '自宅へ案内してもらう', exact: true })).toBeVisible();
});

test('home guidance and the optional arrow survive reload, while turning the arrow off retains text and map guidance', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 }; progress.life.minute = 1260;
  await boot(page, progress);
  await page.getByRole('button', { name: '自宅への帰り道を案内', exact: true }).click();
  await expect(page.locator('.life-wayfinder')).toBeVisible();
  await expect(page.locator('.life-wayfinder')).toHaveAttribute('data-destination', 'home');
  await expect(page.locator('.life-navigation')).toContainText('自宅');
  expect((await snapshot(page)).preferences.destination).toBe('home');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('.life-wayfinder')).not.toBeVisible();
  await page.getByRole('button', { name: '目的地の矢印をオフにする', exact: true }).click();
  expect((await snapshot(page)).preferences.wayfinding).toBe(false);
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click(); await refresh(page);
  await expect(page.locator('.life-wayfinder')).not.toBeVisible();
  await expect(page.locator('.life-navigation')).toContainText('自宅');
  await page.reload(); await start(page);
  expect((await snapshot(page)).preferences).toMatchObject({ destination: 'home', wayfinding: false });
  await expect(page.locator('.life-wayfinder')).not.toBeVisible();
  await page.getByRole('button', { name: '地図 [M]', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('自宅');
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '目的地の矢印をオンにする', exact: true }).click();
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click(); await refresh(page);
  await expect(page.locator('.life-wayfinder')).toBeVisible();
});

test('only explicit rest inside home advances to 08:00 and keeps money, food and the accepted errand', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 }; progress.life.minute = 1260;
  progress.money = 875; progress.inventory.tea = 2; progress.greeted = ['resident-0']; progress.errand = { resident: 'resident-0' };
  await boot(page, progress);
  await page.evaluate(() => window.guidanceHarness.trySleepingOutside());
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await snapshot(page)).life).toMatchObject({ day: 1, minute: 1260 });
  await page.evaluate(() => window.guidanceHarness.approachHome());
  await expect(page.locator('.life-interact')).toContainText('自宅に入る');
  await page.locator('.life-interact').click();
  await refresh(page);
  await expect(page.locator('.life-context')).toContainText('おかえりなさい');
  await expect(page.locator('.life-wayfinder')).not.toBeVisible();
  await page.getByRole('button', { name: '朝まで休む', exact: true }).click();
  expect((await snapshot(page)).life).toMatchObject({ day: 1, minute: 1260 });
  await expect(page.getByRole('dialog')).toContainText('今日の思い出「この街で、最初の声」');
  await expect(page.getByRole('dialog')).toContainText('おつかいと持ち物はそのまま');
  await page.getByRole('button', { name: '眠って翌朝を迎える', exact: true }).click();
  const morning = await snapshot(page);
  expect(morning.life).toMatchObject({ day: 2, minute: 480 });
  expect(morning.money).toBe(875); expect(morning.inventory.tea).toBe(2); expect(morning.errand).toEqual(progress.errand);
  expect(morning.journey.memories.some(memory => memory.id === 'tomorrow')).toBe(true);
  await expect(page.locator('.life-context')).toContainText('新しい朝');
  await page.getByRole('button', { name: '街へ出る', exact: true }).click();
  await expect(page.locator('.life-navigation')).not.toContainText('自宅の中');
  await page.reload(); await start(page);
  expect((await snapshot(page)).life).toMatchObject({ day: 2, minute: 480 });
  expect((await snapshot(page)).journey.memories.filter(memory => memory.id === 'tomorrow')).toHaveLength(1);
});

test('a real bench-and-snack interaction earns a dated memory that survives reload in the life album', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 }; progress.inventory.tea = 1;
  await boot(page, progress);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await expect(page.locator('.life-memory-card')).toHaveCount(7);
  const picnic = page.locator('[data-memory="picnic"]');
  await expect(picnic).toContainText('これから出会う景色');
  await expect(picnic).toContainText('座ってから');
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
  await page.evaluate(() => window.guidanceHarness.approachBench());
  await expect(page.locator('.life-interact')).toContainText('ベンチに座る');
  await page.locator('.life-interact').click();
  await expect(page.locator('.life-rest-status')).toContainText('ひと休み中');
  await page.getByRole('button', { name: '持ち物 [I]', exact: true }).click();
  await page.getByRole('button', { name: /緑茶を飲む/ }).click();
  expect((await snapshot(page)).inventory.tea).toBe(0);
  expect((await snapshot(page)).journey.memories.filter(memory => memory.id === 'picnic')).toHaveLength(1);
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await expect(picnic).toContainText('思い出に残りました'); await expect(picnic).toContainText('1日目 14:00');
  await expect(page.locator('[data-memory="sea"]')).toContainText('これから出会う景色');
  await page.reload(); await start(page);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await expect(picnic).toContainText('思い出に残りました');
  expect((await snapshot(page)).journey.memories.filter(memory => memory.id === 'picnic')).toHaveLength(1);
});

test('choosing the sea respects the player’s plan instead of repeating a different suggested activity after reload', async ({ page }) => {
  const progress = newProgress(); progress.position = { x: 0, z: 0 };
  progress.greeted = ['resident-0']; progress.boughtDango = true; progress.ateDango = true; progress.rewarded = true;
  await boot(page, progress);
  await expect(page.locator('.life-context')).toBeVisible();
  await expect(page.locator('.life-context')).toContainText('小さな「ありがとう」');
  expect((await snapshot(page)).preferences.destination).toBeNull();
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  const dialog = page.getByRole('dialog');
  expect((await dialog.getByRole('button').allTextContents()).slice(0, 3)).toEqual([
    '住人に会いに公園へ', '海辺で小さな発見を探す', '自宅へ案内してもらう',
  ]);
  await dialog.getByRole('button', { name: '海辺で小さな発見を探す', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.life-context')).not.toBeVisible();
  await expect(page.locator('.life-navigation')).toContainText('海辺');
  expect((await snapshot(page)).preferences.destination).toBe('beach');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).preferences.destination, SAVE_KEY)).toBe('beach');
  expect((await snapshot(page)).journey.memories.some(memory => memory.id === 'kindness')).toBe(false);
  await page.reload(); await start(page);
  expect((await snapshot(page)).preferences.destination).toBe('beach');
  await expect(page.locator('.life-context')).not.toBeVisible();
  await expect(page.locator('.life-navigation')).toContainText('海辺');
});
