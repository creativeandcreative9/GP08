import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { Bone, Matrix, NullEngine, Scene, Skeleton } from '@babylonjs/core';
import { Gait } from '../src/player/gait';
import { canRest, occupied, restPlaces } from '../src/gameplay/rest';
import { newProgress, SAVE_KEY } from '../src/gameplay/state';
import type { Contact } from '../src/gameplay/world';

const town = { heightAt: () => 0, obstacles: [] };
const bench = restPlaces(town)[0]!;

test('resting requires a nearby approach from the front, the same ground level and a clear path', () => {
  expect(canRest(bench.exit, bench, [], [])).toBe(true);
  expect(canRest({ ...bench.exit, x: bench.x - bench.fx * 14 }, bench, [], [])).toBe(false);
  expect(canRest({ ...bench.exit, x: bench.x + bench.fx * 30 }, bench, [], [])).toBe(false);
  expect(canRest({ ...bench.exit, y: 20 }, bench, [], [])).toBe(false);
  const wall = [{ minX: bench.exit.x - 5, maxX: bench.exit.x + 5, minZ: bench.z - 5, maxZ: bench.z + 5 }];
  expect(canRest(bench.exit, bench, [], wall)).toBe(false);
  const start = { ...bench.exit, z: bench.z + 18 };
  expect(canRest(start, bench, [], [])).toBe(true);
  expect(canRest(start, bench, [], [{ minX: start.x - 3, maxX: start.x + 3, minZ: bench.z + 7, maxZ: bench.z + 11 }])).toBe(false);
});

test('occupied benches cannot be used, while shops and people on another floor do not reserve seats', () => {
  const person: Contact = { id: 'resident-1', name: '先客', line: '', kind: 'resident', x: bench.x, z: bench.z + 5, y: 7 };
  expect(occupied(bench, [person])).toBe(true);
  expect(canRest(bench.exit, bench, [person], [])).toBe(false);
  expect(occupied(bench, [{ ...person, kind: 'shop' }])).toBe(false);
  expect(occupied(bench, [{ ...person, y: 40 }])).toBe(false);
  expect(occupied(bench, [{ ...person, z: bench.z + 30 }])).toBe(false);
});

test('rest places exclude blocked seats and blocked exits without changing the remaining builder order', () => {
  const all = restPlaces(town);
  const seat = all[0]!, exit = all[1]!.exit;
  const result = restPlaces({ ...town, obstacles: [
    { minX: seat.x - 1, maxX: seat.x + 1, minZ: seat.z - 1, maxZ: seat.z + 1 },
    { minX: exit.x - 1, maxX: exit.x + 1, minZ: exit.z - 1, maxZ: exit.z + 1 },
  ] });
  expect(result.map(b => b.id)).toEqual(all.slice(2).map(b => b.id));
  for (const b of result) {
    expect(Math.hypot(b.exit.x - b.x, b.exit.z - b.z)).toBeGreaterThan(8);
    expect((b.exit.x - b.x) * b.fx + (b.exit.z - b.z) * b.fz).toBeGreaterThan(8);
  }
});

test('a seated gait lowers the hips, keeps both feet grounded and restores the walk pose without drift', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const skeleton = new Skeleton('rig', 'rig', scene);
    const bone = (name: string, parent: Bone | null, x: number, y: number, z = 0): Bone => new Bone(name, skeleton, parent, Matrix.Translation(x, y, z));
    const root = bone('全ての親', null, 0, 0), center = bone('センター', root, 0, 10);
    const hip = bone('左足', center, 1, 0);
    bone('左ひざ', hip, 0, -4.5);
    const left = bone('左足ＩＫ', root, 1, 1), right = bone('右足ＩＫ', root, -1, 1);
    const upper = bone('上半身', center, 0, 1);
    bone('左腕', upper, 2, 2); bone('右腕', upper, -2, 2);
    const gait = new Gait(skeleton.bones);
    for (let i = 0; i < 4; i++) {
      gait.sit(0.1, 6);
      expect(center.position.y).toBeCloseTo(6.5);
      expect(left.position.y).toBe(1);
      expect(right.position.y).toBe(1);
      expect(left.position.z).toBeLessThan(-3);
      gait.update(0, 0);
      expect(center.position.y).toBe(10);
      expect(left.position.z).toBe(0);
      expect(right.position.z).toBe(0);
    }
    gait.update(0.1, 20);
    expect(gait.state.blend).toBeGreaterThan(0);
    expect(gait.state.phase).toBeGreaterThan(0);
    expect(center.position.y).toBeGreaterThan(9.5);
  } finally { scene.dispose(); engine.dispose(); }
});

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__gp08?.ready && !!window.__gp08.gameplay, null, { timeout: 240000 });
}
async function frames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__gp08.frames);
  await page.waitForFunction(({ start, count }) => window.__gp08.frames >= start + count, { start, count }, { timeout: 60000 });
}

test('a player sits, enjoys a snack, uses the map and journal, stands and resumes safely after reload', async ({ page }) => {
  test.skip(!fs.existsSync('private-assets/seisen/清泉吹雪太眉LO.pmx'), 'private model pack required');
  test.setTimeout(600000);
  const progress = newProgress();
  progress.money = 200;
  progress.inventory.tea = 1;
  progress.greeted = ['resident-0'];
  progress.errand = { resident: 'resident-0' };
  await page.addInitScript(({ key, progress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(progress));
  }, { key: SAVE_KEY, progress });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?model=fubuki&gfx=low');
  await ready(page);
  const spot = await page.evaluate(() => {
    const gameplay = window.__gp08.gameplay! as any, people: Contact[] = gameplay.contacts();
    const at = window.__gp08.player!.position;
    const candidates = [...gameplay.restSpots()]
      .sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))
      .filter(b => people.every(p => p.kind !== 'resident' || Math.hypot(p.x - b.x, p.z - b.z) > 24 && Math.hypot(p.x - b.exit.x, p.z - b.exit.z) > 24));
    for (const bench of candidates) {
      window.__gp08.player!.position.set(bench.exit.x, bench.exit.y, bench.exit.z);
      gameplay.updateNearby();
      if (document.querySelector('.life-interact')?.textContent?.includes('ベンチに座る')) return bench;
    }
    const details = candidates.map(b => {
      const nearby = people.filter(p => p.kind === 'resident' && Math.hypot(p.x - b.exit.x, p.z - b.exit.z) < 30)
        .map(p => `${p.id} d=${Math.hypot(p.x - b.exit.x, p.z - b.exit.z).toFixed(1)}`);
      return `${b.id} exit=(${b.exit.x.toFixed(1)},${b.exit.z.toFixed(1)}): ${nearby.join(', ') || 'resident-distance filter passed; actual seat interaction unavailable'}`;
    });
    throw new Error(`No unoccupied plaza bench with an actual seat interaction. Candidates: ${details.join('; ') || 'none'}`);
  });
  await expect(page.locator('.life-interact')).toContainText('ベンチに座る', { timeout: 30000 });
  const standing = await page.evaluate(() => window.__gp08.player!.root.metadata.skeleton.bones.find((b: Bone) => b.name === 'センター').position.y);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.life-rest-status')).toContainText('ひと休み中');
  await expect(page.locator('.life-interact')).toHaveText('立ち上がる [E]');
  expect(await page.evaluate(() => window.__gp08.player!.resting?.id)).toBe(spot.id);
  expect(await page.evaluate(() => window.__gp08.player!.root.metadata.skeleton.bones.find((b: Bone) => b.name === 'センター').position.y)).toBeLessThan(standing - 1);
  await page.keyboard.down('KeyW');
  await frames(page, 3);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => ({ x: window.__gp08.player!.position.x, z: window.__gp08.player!.position.z, speed: window.__gp08.player!.currentSpeed }))).toEqual({ x: spot.x, z: spot.z, speed: 0 });
  await page.keyboard.press('KeyE');
  expect(await page.evaluate(() => window.__gp08.player!.resting)).toBeNull();
  expect(await page.evaluate(() => window.__gp08.player!.resumePosition)).toEqual({ x: spot.exit.x, z: spot.exit.z });
  await expect(page.locator('.life-interact')).toContainText('ベンチに座る', { timeout: 30000 });
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.getByRole('button', { name: /緑茶を飲む/ }).click();
  await expect(page.getByRole('dialog')).toContainText('まだ何も持っていません');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__gp08.player!.resting?.id)).toBe(spot.id);
  await page.keyboard.press('KeyM');
  await expect(page.getByRole('dialog')).toContainText('街の地図');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog')).toContainText('佐倉 はる');
  await page.getByRole('button', { name: '配達先へ案内', exact: true }).click();
  await expect(page.locator('.life-navigation')).toContainText('和菓子屋');
  expect(await page.evaluate(() => window.__gp08.player!.resting?.id)).toBe(spot.id);
  await page.evaluate(() => {
    const camera = window.__gp08.scene!.activeCamera as import('@babylonjs/core').ArcRotateCamera;
    camera.alpha = window.__gp08.player!.resting!.fx > 0 ? Math.PI / 5 : Math.PI - Math.PI / 5;
    camera.beta = 1.3;
    camera.radius = 50;
  });
  await frames(page, 4);
  fs.mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/rest-seated.png', timeout: 60000 });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.version).toBe(3);
  expect(saved.position).toEqual({ x: spot.exit.x, z: spot.exit.z });
  expect(saved.money).toBe(200);
  expect(saved.inventory.tea).toBe(0);
  expect(saved.errand).toEqual(progress.errand);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__gp08.player!.resting)).toBeNull();
  await expect(page.locator('.life-rest-status')).toHaveText('');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.life-rest-status')).toContainText('ひと休み中');
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.__gp08.player!.resting)).toBeNull();
  expect(await page.evaluate(() => window.__gp08.player!.resumePosition)).toEqual({ x: spot.exit.x, z: spot.exit.z });
  await expect(page.locator('.life-rest-status')).toHaveText('');
  await expect(page.locator('.life-bar')).toContainText('所持金 200円');
  await expect(page.locator('.life-goal')).toContainText('街のおつかい');
  await page.keyboard.down('KeyW');
  await frames(page, 4);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(at => Math.hypot(window.__gp08.player!.position.x - at.x, window.__gp08.player!.position.z - at.z), spot.exit)).toBeGreaterThan(0.1);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  expect(errors).toEqual([]);
});
