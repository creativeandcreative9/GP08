import { expect, test, type Page } from '@playwright/test';
import { newProgress, SAVE_KEY, type Progress } from '../src/gameplay/state';

const snapshot = (page: Page): Promise<Progress> => page.evaluate(() => window.__gp08.gameplay!.snapshot());
const movement = (page: Page) => page.evaluate(() => ({
  multiplier: window.__gp08.player!.runMultiplier,
  running: window.__gp08.player!.running,
  speed: window.__gp08.player!.currentSpeed,
  position: window.__gp08.player!.position.asArray(),
}));

/** Freeze loading time, then exercise the real player/controller without rasterizing every simulated frame. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 300000 });
  await page.evaluate(() => {
    const scene = window.__gp08.scene!;
    scene.getEngine().stopRenderLoop();
    scene.getEngine().getDeltaTime = () => 0;
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    (window.__gp08.gameplay as unknown as { updateNearby(): void }).updateNearby();
  });
}

async function step(page: Page, seconds: number, frames = 1): Promise<void> {
  await page.evaluate(({ seconds, frames }) => {
    const scene = window.__gp08.scene!, engine = scene.getEngine(), previousDelta = engine.getDeltaTime;
    engine.getDeltaTime = () => seconds * 1000;
    try {
      for (let i = 0; i < frames; i++) {
        scene.activeCamera!.getViewMatrix(true);
        scene.onBeforeAnimationsObservable.notifyObservers(scene);
        scene.onBeforeRenderObservable.notifyObservers(scene);
      }
    } finally { engine.getDeltaTime = previousDelta; }
    (window.__gp08.gameplay as unknown as { updateNearby(): void }).updateNearby();
  }, { seconds, frames });
}

async function close(page: Page): Promise<void> {
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
}

test('public town running consumes saved hunger, pauses safely, and offers food and free home recovery', async ({ page }) => {
  test.setTimeout(600000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const progress = newProgress();
  progress.hunger = 70;
  progress.money = 0;
  progress.inventory.onigiri = 1;
  progress.position = { x: 0, z: -400 };
  await page.addInitScript(({ key, progress }) => {
    // A controlled hidden state prevents loading speed from changing the saved value before assertions.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: SAVE_KEY, progress });
  await page.goto('/?model=public&gfx=low', { timeout: 300000 });
  await ready(page);
  expect(await page.evaluate(() => window.__gp08.player!.root.name)).toBe('public-player');
  expect((await snapshot(page)).hunger).toBe(70);
  await expect(page.locator('.life-hunger')).toHaveAccessibleName('空腹度 70 / 100、空腹。持ち物を開く');

  // Holding Shift while stationary is not running. Walking consumes the same time-based amount.
  await page.keyboard.down('Shift');
  await step(page, 1, 10);
  const idle = await snapshot(page);
  expect(idle.hunger).toBeGreaterThan(70);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false, speed: 0 });
  await page.keyboard.up('Shift');
  await page.keyboard.down('KeyW');
  const walkingStart = await movement(page);
  await step(page, 1, 10);
  const walking = await snapshot(page);
  expect(walking.hunger - idle.hunger).toBeCloseTo(idle.hunger - 70, 8);
  expect((await movement(page)).position).not.toEqual(walkingStart.position);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false });

  // Actual keyboard movement accumulates acceleration; twenty active seconds reach the 3x cap.
  await page.keyboard.down('Shift');
  await step(page, 1, 10);
  const running = await snapshot(page), halfway = await movement(page);
  expect(halfway.running).toBe(true);
  expect(halfway.multiplier).toBeCloseTo(2, 1);
  expect(running.hunger - walking.hunger).toBeGreaterThan(2 * (walking.hunger - idle.hunger));
  await step(page, 1, 11);
  expect(await movement(page)).toMatchObject({ multiplier: 3, running: true });
  expect((await movement(page)).speed).toBeGreaterThan(115);
  await expect(page.locator('.life-sprint')).toBeVisible();
  await expect(page.locator('.life-sprint')).toContainText('×3.0');

  // Releasing only Shift returns to walking; a later press starts a fresh acceleration period.
  await page.keyboard.up('Shift');
  await step(page, 1);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false });
  await page.keyboard.down('Shift');
  await step(page, 1);
  expect((await movement(page)).multiplier).toBeGreaterThan(1);
  expect((await movement(page)).multiplier).toBeLessThan(1.2);

  // A real modal clears held movement and freezes hunger and the in-game clock.
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const paused = await snapshot(page), pausedMovement = await movement(page);
  expect(pausedMovement).toMatchObject({ multiplier: 1, running: false, speed: 0 });
  await step(page, 1, 20);
  expect((await snapshot(page)).hunger).toBe(paused.hunger);
  expect((await snapshot(page)).life).toEqual(paused.life);
  expect((await movement(page)).position).toEqual(pausedMovement.position);
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await close(page);
  await step(page, 1);
  expect((await snapshot(page)).hunger).toBeGreaterThan(paused.hunger);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false, speed: 0 });

  // Simulated tab hiding exercises visibility listeners; restoring cannot charge the hidden interval.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Shift');
  await step(page, 1, 3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await snapshot(page), hiddenPosition = (await movement(page)).position;
  await step(page, 1, 20);
  expect((await snapshot(page)).hunger).toBe(hidden.hunger);
  expect((await snapshot(page)).life).toEqual(hidden.life);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false, speed: 0, position: hiddenPosition });
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await step(page, 60);
  expect((await snapshot(page)).hunger).toBe(hidden.hunger);
  expect((await snapshot(page)).life).toEqual(hidden.life);
  await step(page, 1);
  expect((await snapshot(page)).hunger).toBeGreaterThan(hidden.hunger);

  // Save/reload preserves the fractional resource and inventory, while sprint is transient.
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await snapshot(page);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).hunger, SAVE_KEY)).toBe(saved.hunger);
  await page.reload({ timeout: 300000 });
  await ready(page);
  expect((await snapshot(page)).hunger).toBe(saved.hunger);
  expect((await snapshot(page)).inventory).toEqual(saved.inventory);
  expect(await movement(page)).toMatchObject({ multiplier: 1, running: false, speed: 0 });

  // Food is consumed through inventory, including the exactly-once quantity and resource changes.
  await page.getByRole('button', { name: '持ち物 [I]', exact: true }).click();
  await expect(page.locator('.life-hunger-summary')).toContainText('いまの空腹度');
  await expect(page.getByRole('button', { name: '自宅で軽食を食べる（無料）', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /おにぎりを食べる/ }).click();
  const fed = await snapshot(page);
  expect(fed.hunger).toBeCloseTo(saved.hunger - 45, 8);
  expect(fed.inventory.onigiri).toBe(0);
  expect(fed.money).toBe(0);
  await expect(page.getByRole('button', { name: /おにぎりを食べる/ })).toHaveCount(0);
  await page.getByRole('button', { name: '自宅の軽食へ案内', exact: true }).click();
  expect((await snapshot(page)).preferences.destination).toBe('home');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Travel is shortened by a position hook; entering, eating and sleeping still use public UI.
  await page.evaluate(() => {
    const w = window.__gp08, home = w.gameplay!.contacts().find(contact => contact.id === 'home')!;
    w.player!.position.set(home.x, home.y, home.z);
    (w.gameplay as unknown as { updateNearby(): void }).updateNearby();
  });
  await expect(page.locator('.life-interact')).toContainText('自宅に入る');
  await page.locator('.life-interact').click();
  expect(await page.evaluate(() => window.__gp08.gameplay!.interiors.current?.id)).toBe('home');
  await page.getByRole('button', { name: '持ち物 [I]', exact: true }).click();
  await page.getByRole('button', { name: '自宅で軽食を食べる（無料）', exact: true }).click();
  expect((await snapshot(page)).hunger).toBe(0);
  expect((await snapshot(page)).money).toBe(0);
  expect((await snapshot(page)).inventory.onigiri).toBe(0);
  await close(page);
  await step(page, 1, 12);
  const beforeSleep = await snapshot(page);
  expect(beforeSleep.hunger).toBeGreaterThan(0);
  await page.getByRole('button', { name: '朝まで休む', exact: true }).click();
  await page.getByRole('button', { name: '眠って翌朝を迎える', exact: true }).click();
  const morning = await snapshot(page);
  expect(morning.hunger).toBe(0);
  expect(morning.life).toMatchObject({ day: beforeSleep.life.day + 1, minute: 480 });
  expect(morning.money).toBe(0);
  expect(morning.inventory).toEqual(beforeSleep.inventory);
  await page.getByRole('button', { name: '街へ出る', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.reload({ timeout: 300000 });
  await ready(page);
  expect((await snapshot(page)).hunger).toBe(0);
  expect((await snapshot(page)).life).toEqual(morning.life);
  expect((await snapshot(page)).money).toBe(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
});
