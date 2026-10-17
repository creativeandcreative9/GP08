import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { errandFor, residentName, SHOPS, validResident } from '../src/gameplay/errands';
import { acceptErrand, buy, cancelErrand, consume, deliverErrand, greet, ITEMS, ITEM_IDS, MAX_MONEY, newProgress, parseProgress, SAVE_KEY } from '../src/gameplay/state';
import { blocked, inReach, shopContacts } from '../src/gameplay/world';
import type { Town } from '../src/town/build';

/** An actual version-1 save, without the new errand fields. */
function legacySave() {
  return {
    version: 1, money: 0, inventory: { dango: 0, tea: 2, onigiri: 0, coffee: 0 },
    greeted: ['resident-1'], boughtDango: true, ateDango: true, rewarded: true, position: { x: 0, z: 428 },
  };
}

test('resident names and delivery offers are stable for the generated cast', () => {
  expect(['resident-0', 'resident-1', 'resident-2'].map(id => errandFor(id)?.shop)).toEqual(['e-wagashi', 'w-conbini', 'w-cafe']);
  expect(residentName('resident-0')).toBe('佐倉 はる');
  expect(new Set(Array.from({ length: 110 }, (_, i) => residentName(`resident-${i}`))).size).toBe(110);
  for (const id of ['', 'resident--1', 'resident-01', 'resident-10000', 'shop-1', '<b>']) {
    expect(validResident(id)).toBe(false);
    expect(errandFor(id)).toBeUndefined();
  }
});

test('the cafe has an approachable service point beyond its non-walkable terrace', () => {
  const town = {
    spots: { 'w-cafe': { x: 0, z: 0, fx: 0, fz: 1, hu: 66, hv: 56 } },
    obstacles: [
      { minX: -66, maxX: 66, minZ: -56, maxZ: 56 },
      { minX: -74, maxX: 74, minZ: 56, maxZ: 100 },
    ],
    heightAt: () => 0,
  } as unknown as Town;
  const contacts = shopContacts(town);
  expect(contacts).toHaveLength(1);
  const cafe = contacts[0]!;
  expect(cafe.id).toBe('w-cafe');
  expect(blocked(cafe.x, cafe.z, town.obstacles)).toBe(false);
  expect(cafe.z).toBeGreaterThanOrEqual(104);
  expect(inReach({ x: cafe.x, z: cafe.z + 10, y: 0 }, cafe, town.obstacles)).toBe(true);
});

test('only a greeted resident can give an errand and only one can be active', () => {
  const p = newProgress();
  expect(acceptErrand(p, 'resident-0').ok).toBe(false);
  expect(p.errand).toBeNull();
  greet(p, 'resident-0');
  greet(p, 'resident-1');
  expect(acceptErrand(p, 'resident-0').ok).toBe(true);
  expect(acceptErrand(p, 'resident-0').ok).toBe(false);
  expect(acceptErrand(p, 'resident-1').ok).toBe(false);
  expect(p.errand).toEqual({ resident: 'resident-0' });
  expect(p.money).toBe(1200);
});

test('all three delivery routes pay once, need no upfront money and fund a purchase', () => {
  for (const id of ['resident-0', 'resident-1', 'resident-2']) {
    const p = newProgress();
    p.money = 0;
    greet(p, id);
    const offer = errandFor(id)!;
    acceptErrand(p, id);
    const wrongShop = Object.keys(SHOPS).find(shop => shop !== offer.shop)!;
    expect(deliverErrand(p, wrongShop).ok).toBe(false);
    expect(p.money).toBe(0);
    expect(p.errand).toEqual({ resident: id });
    expect(deliverErrand(p, offer.shop).ok).toBe(true);
    expect(p.money).toBe(400);
    expect(p.errand).toBeNull();
    expect(p.completedErrands).toEqual([id]);
    expect(deliverErrand(p, offer.shop).ok).toBe(false);
    expect(acceptErrand(p, id).ok).toBe(false);
    expect(p.money).toBe(400);
    const item = ITEM_IDS.find(item => ITEMS[item].shop === offer.shop)!;
    expect(buy(p, item, offer.shop).ok).toBe(true);
    expect(p.money).toBe(400 - ITEMS[item].price);
  }
});

test('cancelling returns the parcel without rewards or inventory changes and allows another request', () => {
  const p = newProgress();
  greet(p, 'resident-0');
  greet(p, 'resident-1');
  const inventory = { ...p.inventory };
  acceptErrand(p, 'resident-0');
  expect(cancelErrand(p).ok).toBe(true);
  expect(p.errand).toBeNull();
  expect(p.completedErrands).toEqual([]);
  expect(p.inventory).toEqual(inventory);
  expect(p.money).toBe(1200);
  expect(cancelErrand(p).ok).toBe(false);
  expect(acceptErrand(p, 'resident-1').ok).toBe(true);
});

test('version-1 progress migrates without losing money, items, the first goal or position', () => {
  const old = legacySave();
  const migrated = parseProgress(JSON.stringify(old))!;
  expect(migrated).toEqual({ ...old, version: 3, life: newProgress().life, errand: null, completedErrands: [] });
  acceptErrand(migrated, 'resident-1');
  const pending = parseProgress(JSON.stringify(migrated))!;
  expect(pending.errand).toEqual({ resident: 'resident-1' });
  deliverErrand(pending, 'w-conbini');
  const completed = parseProgress(JSON.stringify(pending))!;
  expect(completed.completedErrands).toEqual(['resident-1']);
  expect(completed.money).toBe(400);
  expect(completed.inventory.tea).toBe(2);
  expect(completed.rewarded).toBe(true);
  completed.completedErrands.push('resident-2');
  expect(pending.completedErrands).toEqual(['resident-1']);
});

test('new saves reject inconsistent errands and strip untrusted destinations and rewards', () => {
  const p = newProgress();
  greet(p, 'resident-0');
  for (const changes of [
    { errand: undefined }, { completedErrands: undefined }, { completedErrands: ['resident-1'] },
    { completedErrands: ['resident-0'], errand: { resident: 'resident-0' } },
    { errand: { resident: 'resident-1' } }, { errand: { resident: 'resident-00' } },
    { errand: [] }, { completedErrands: null }, { completedErrands: ['<img>'] },
  ]) expect(parseProgress(JSON.stringify({ ...p, ...changes }))).toBeNull();
  const parsed = parseProgress(JSON.stringify({ ...p, errand: { resident: 'resident-0', shop: 'w-cafe', reward: 999999, name: '<img>' } }))!;
  expect(parsed.errand).toEqual({ resident: 'resident-0' });
  expect(deliverErrand(parsed, 'w-cafe').ok).toBe(false);
  expect(deliverErrand(parsed, 'e-wagashi').ok).toBe(true);
  expect(parsed.money).toBe(1600);
});

test('rewards never create an unsaveable balance at the wallet limit', () => {
  const p = newProgress();
  greet(p, 'resident-0');
  acceptErrand(p, 'resident-0');
  p.money = MAX_MONEY - 100;
  expect(deliverErrand(p, 'e-wagashi').ok).toBe(false);
  expect(p.errand).not.toBeNull();
  expect(p.completedErrands).toEqual([]);
  p.boughtDango = true;
  p.inventory.dango = 1;
  consume(p, 'dango');
  expect(p.money).toBe(MAX_MONEY);
  expect(parseProgress(JSON.stringify(p))).not.toBeNull();
});

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
}

async function residentNearPlaza(page: Page, exclude?: string): Promise<string> {
  return page.evaluate(exclude => {
    const town = window.__gp08.scene!.metadata.town;
    const resident = window.__gp08.gameplay!.contacts().find(c => c.kind === 'resident' && c.id !== exclude && Math.hypot(c.x, c.z) < 700 && !town.obstacles.some(
      (o: { minX: number; maxX: number; minZ: number; maxZ: number }) => c.x > o.minX - 4 && c.x < o.maxX + 4 && c.z > o.minZ - 4 && c.z < o.maxZ + 4,
    ));
    if (!resident) throw new Error('No reachable resident in the plaza');
    return resident.id;
  }, exclude);
}

async function approach(page: Page, id: string): Promise<void> {
  await page.evaluate(id => {
    const c = window.__gp08.gameplay!.contacts().find(c => c.id === id);
    if (!c) throw new Error(`Contact disappeared: ${id}`);
    window.__gp08.player!.position.set(c.x, window.__gp08.scene!.metadata.town.heightAt(c.x, c.z), c.z);
  }, id);
}

test('a zero-money player migrates, cancels, resumes and delivers an errand, then starts the next one', async ({ page }) => {
  test.skip(!fs.existsSync('private-assets/seisen/清泉吹雪太眉LO.pmx'), 'private model pack required');
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: SAVE_KEY, progress: legacySave() });
  await page.goto('/?model=fubuki&gfx=low');
  await ready(page);
  await expect(page.locator('.life-bar')).toContainText('所持金 0円');
  expect(await page.evaluate(() => window.__gp08.gameplay!.contacts().filter(c => c.kind === 'shop').map(c => c.id).sort())).toEqual(Object.keys(SHOPS).sort());
  const id = await residentNearPlaza(page);
  const offer = errandFor(id)!;
  const name = residentName(id);
  await approach(page, id);
  await expect(page.locator('.life-interact')).toContainText(name, { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'おつかいを引き受ける', exact: true }).click();
  await expect(page.locator('.life-goal')).toContainText('街のおつかい');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyJ');
  await page.getByRole('button', { name: 'この依頼を取りやめる', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('今は配達中のおつかいはありません');
  await expect(page.locator('.life-bar')).toContainText('所持金 0円');
  await page.keyboard.press('Escape');
  await approach(page, id);
  await expect(page.locator('.life-interact')).toContainText(name, { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'おつかいを引き受ける', exact: true }).click();
  await page.keyboard.press('Escape');

  await page.reload();
  await ready(page);
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog')).toContainText(name);
  await expect(page.getByRole('dialog')).toContainText(offer.parcel);
  await page.getByRole('button', { name: '配達先へ案内', exact: true }).click();
  await expect(page.locator('.life-navigation')).toContainText(SHOPS[offer.shop].name);
  await approach(page, offer.shop);
  await expect(page.locator('.life-interact')).toContainText('で買い物', { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.evaluate(() => window.__gp08.player!.position.set(0, 0, 0));
  const handOver = page.getByRole('button', { name: new RegExp(`${offer.parcel}を渡す`) });
  await handOver.click();
  await expect(page.getByRole('dialog')).toContainText('店先から離れています');
  await expect(page.locator('.life-bar')).toContainText('所持金 0円');
  await approach(page, offer.shop);
  await handOver.click();
  await expect(page.locator('.life-bar')).toContainText('所持金 400円');
  await expect(handOver).toHaveCount(0);
  const item = ITEM_IDS.find(item => ITEMS[item].shop === offer.shop)!;
  await page.getByRole('button', { name: new RegExp(`${ITEMS[item].name}を買う`) }).click();
  await expect(page.locator('.life-bar')).toContainText(`所持金 ${400 - ITEMS[item].price}円`);
  await page.keyboard.press('Escape');

  await page.reload();
  await ready(page);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.version).toBe(3);
  expect(saved.money).toBe(400 - ITEMS[item].price);
  expect(saved.inventory.tea).toBe(2);
  expect(saved.inventory[item]).toBe(1);
  expect(saved.rewarded).toBe(true);
  expect(saved.completedErrands).toEqual([id]);
  expect(saved.errand).toBeNull();
  await approach(page, id);
  await expect(page.locator('.life-interact')).toContainText(name, { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog')).toContainText('届けてくれてありがとう');
  await expect(page.getByRole('button', { name: 'おつかいを引き受ける', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const next = await residentNearPlaza(page, id);
  await approach(page, next);
  await expect(page.locator('.life-interact')).toContainText(residentName(next), { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'おつかいを引き受ける', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.life-goal')).toContainText('街のおつかい');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).errand, SAVE_KEY)).toEqual({ resident: next });
  // Capture the actual gameplay UI only after interactions finish; no model images are committed.
  await page.evaluate(() => window.__gp08.scene!.getEngine().stopRenderLoop());
  fs.mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/errands-hud.png', timeout: 120000 });
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog')).toContainText('おつかい完了：1件');
  await page.screenshot({ path: 'screenshots/errands-journal.png', timeout: 120000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__gp08.scene!.render());
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'screenshots/errands-journal-portrait.png', timeout: 120000 });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
});
