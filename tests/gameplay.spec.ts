import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { buy, consume, greet, newProgress, parseProgress, SAVE_KEY } from '../src/gameplay/state';
import { inReach, restorePosition, type Contact } from '../src/gameplay/world';
import type { Town } from '../src/town/build';
import { SPAWN } from '../src/town/layout';

test('shopping checks the store, funds and capacity without charging on failure', () => {
  const p = newProgress();
  expect(buy(p, 'dango', 'w-cafe').ok).toBe(false);
  expect(p.money).toBe(1200);
  expect(buy(p, 'dango', 'e-wagashi').ok).toBe(true);
  expect(p.money).toBe(1020);
  expect(p.inventory.dango).toBe(1);
  p.money = 100;
  expect(buy(p, 'coffee', 'w-cafe').ok).toBe(false);
  expect(p.money).toBe(100);
  p.money = 1000;
  p.inventory.tea = 99;
  expect(buy(p, 'tea', 'e-wagashi').ok).toBe(false);
  expect(p.money).toBe(1000);
  expect(p.inventory.tea).toBe(99);
});

test('the first walk rewards all three steps, in either order, exactly once', () => {
  for (const greetFirst of [true, false]) {
    const p = newProgress();
    if (greetFirst) greet(p, 'resident-1');
    expect(consume(p, 'dango').ok).toBe(false);
    buy(p, 'dango', 'e-wagashi');
    consume(p, 'dango');
    if (!greetFirst) expect(p.rewarded).toBe(false);
    greet(p, 'resident-1');
    expect(p.rewarded).toBe(true);
    expect(p.money).toBe(1520);
    expect(p.inventory.dango).toBe(0);
    greet(p, 'resident-1');
    greet(p, 'resident-2');
    expect(p.money).toBe(1520);
    expect(p.greeted).toEqual(['resident-1', 'resident-2']);
    expect(consume(p, 'dango').ok).toBe(false);
  }
});

test('valid progress round-trips without sharing mutable inventory', () => {
  const p = newProgress();
  buy(p, 'onigiri', 'w-conbini');
  greet(p, 'resident-3');
  p.position = { x: 16, z: 428 };
  const loaded = parseProgress(JSON.stringify(p))!;
  expect(loaded).toEqual(p);
  loaded.inventory.onigiri++;
  expect(p.inventory.onigiri).toBe(1);
});

test('corrupt and incompatible saves cannot introduce invalid money, items or coordinates', () => {
  expect(parseProgress(null)).toBeNull();
  expect(parseProgress('{bad')).toBeNull();
  for (const change of [
    { version: 4 }, { money: -1 }, { money: 0.5 }, { money: '1200' },
    { inventory: { dango: 0, tea: 0, onigiri: 0, coffee: -1 } },
    { inventory: { dango: 100, tea: 0, onigiri: 0, coffee: 0 } },
    { greeted: ['<img src=x>'] }, { greeted: null }, { boughtDango: 'true' },
    { position: { x: null, z: 0 } }, { position: { x: 1e9, z: 0 } },
    { position: [] }, { rewarded: true }, { ateDango: true },
  ]) expect(parseProgress(JSON.stringify({ ...newProgress(), ...change })), JSON.stringify(change)).toBeNull();
});

test('interactions require proximity, the same level and a clear path', () => {
  const c: Contact = { id: 'resident-1', name: '住人', kind: 'resident', line: '', x: 20, z: 0, y: 0 };
  const p = { x: 0, y: 0, z: 0 };
  expect(inReach(p, c, [])).toBe(true);
  expect(inReach({ ...p, x: -10 }, c, [])).toBe(false);
  expect(inReach({ ...p, y: 30 }, c, [])).toBe(false);
  expect(inReach(p, c, [{ minX: 8, maxX: 12, minZ: -5, maxZ: 5 }])).toBe(false);
  expect(inReach(p, c, [{ minX: 8, maxX: 12, minZ: 5, maxZ: 10 }])).toBe(true);
});

test('save positions inside obstacles, at sea or out of bounds restore to the plaza', () => {
  const town = { obstacles: [{ minX: 10, maxX: 20, minZ: 10, maxZ: 20 }] } as unknown as Town;
  expect(restorePosition(town, { x: 15, z: 15 })).toEqual(SPAWN);
  expect(restorePosition(town, { x: 0, z: 5000 })).toEqual(SPAWN);
  expect(restorePosition(town, { x: Number.NaN, z: 0 })).toEqual(SPAWN);
  expect(restorePosition(town, { x: 12000, z: 0 })).toEqual(SPAWN);
  expect(restorePosition(town, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
});

const hasModels = fs.existsSync('private-assets/seisen/清泉吹雪太眉LO.pmx');
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
}

/** Approach a real contact; transactions and dialog actions still go through the visible UI. */
async function approach(page: Page, id: string): Promise<void> {
  await page.evaluate(id => {
    const contact = window.__gp08.gameplay!.contacts().find(c => c.id === id)!;
    const town = window.__gp08.scene!.metadata.town;
    window.__gp08.player!.position.set(contact.x, town.heightAt(contact.x, contact.z), contact.z);
  }, id);
}

test('a player talks, shops, eats, earns the goal reward and resumes after reload', async ({ page }) => {
  test.skip(!hasModels, 'private model pack required');
  test.setTimeout(600000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?model=fubuki&gfx=low');
  await ready(page);
  const resident = await page.evaluate(() => {
    const town = window.__gp08.scene!.metadata.town;
    return window.__gp08.gameplay!.contacts().find(c => c.kind === 'resident' && !town.obstacles.some(
      (o: { minX: number; maxX: number; minZ: number; maxZ: number }) => c.x > o.minX - 4 && c.x < o.maxX + 4 && c.z > o.minZ - 4 && c.z < o.maxZ + 4,
    ) && Math.hypot(c.x, c.z) < 700)?.id;
  });
  expect(resident).toBeTruthy();
  await approach(page, resident!);
  await expect(page.locator('.life-interact')).toContainText('と話す', { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog')).toBeVisible();
  const at = await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z, f: window.__gp08.frames }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction(f => window.__gp08.frames >= f + 3, at.f, { timeout: 60000 });
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z }))).toEqual({ x: at.x, z: at.z });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await approach(page, 'e-wagashi');
  await expect(page.locator('.life-interact')).toContainText('和菓子屋で買い物', { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: /三色だんごを買う/ }).click();
  await expect(page.locator('.life-bar')).toContainText('1,020円');
  // A stale shop dialog must never permit a remote purchase.
  await page.evaluate(() => window.__gp08.player!.position.set(0, 0, 0));
  await page.getByRole('button', { name: /三色だんごを買う/ }).click();
  await expect(page.getByRole('dialog')).toContainText('店先から離れています');
  await expect(page.locator('.life-bar')).toContainText('1,020円');
  await page.keyboard.press('Escape');
  await approach(page, 'e-wagashi');
  await page.keyboard.press('KeyI');
  await page.getByRole('button', { name: /三色だんごを食べる/ }).click();
  await expect(page.locator('.life-goal')).toContainText('達成');
  await expect(page.locator('.life-bar')).toContainText('1,520円');
  await expect(page.getByRole('dialog')).toContainText('まだ何も持っていません');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.rewarded).toBe(true);
  expect(saved.inventory.dango).toBe(0);
  expect(saved.greeted.length).toBe(1);
  await page.reload();
  await ready(page);
  await expect(page.locator('.life-goal')).toContainText('達成');
  await expect(page.locator('.life-bar')).toContainText('1,520円');
  const position = await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z }));
  expect(position.x).toBeCloseTo(saved.position.x, 2);
  expect(position.z).toBeCloseTo(saved.position.z, 2);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  expect(errors).toEqual([]);
});

test('blocked browser storage leaves the game playable and reports that saving is unavailable', async ({ page }) => {
  test.skip(!hasModels, 'private model pack required');
  test.setTimeout(300000);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.goto('/?model=fubuki&gfx=low');
  await ready(page);
  await expect(page.locator('.life-save-status')).toHaveText('保存できません');
  await expect(page.locator('.life-notice')).toContainText('このタブを閉じると進行が失われます');
  await page.getByRole('button', { name: '持ち物 [I]', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('まだ何も持っていません');
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
});
