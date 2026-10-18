import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Progress } from '../src/gameplay/state';

const output = path.resolve('screenshots', process.env.GP08_DEPTH_TAG ?? 'depth-play');
const state = (page: Page): Promise<Progress> => page.evaluate(() => window.__gp08.gameplay!.snapshot());
const close = async (page: Page): Promise<void> => { if (await page.locator('dialog[open]').count()) await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click(); };

/** The position hook shortens travel, but all accept/observe/return/save choices use the real UI. */
async function boot(page: Page): Promise<void> {
  await page.goto('/?model=public&gfx=low', { timeout: 300000 });
  await page.waitForFunction(() => window.__gp08?.ready && window.__gp08.gameplay, null, { timeout: 300000 });
  await page.evaluate(() => {
    const w = window.__gp08, g = w.gameplay as any;
    w.scene!.getEngine().stopRenderLoop();
    w.scene!.getEngine().getDeltaTime = () => 0;
    document.getElementById('hud')!.hidden = true;
    g.ui.message(''); g.updateNearby();
  });
}

async function render(page: Page): Promise<void> {
  await page.evaluate(() => { const w = window.__gp08; w.scene!.getEngine().resize(); (w.gameplay as any).updateNearby(); w.scene!.render(); });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.locator('dialog[open]').evaluateAll(nodes => Promise.all(nodes.flatMap(node => node.getAnimations().map(animation => animation.finished))));
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', timeout: 180000 });
}

async function place(page: Page, id: string): Promise<void> {
  await close(page);
  await page.evaluate(id => {
    const w = window.__gp08, g = w.gameplay as any;
    if (g.interiors.indoor) g.interiors.leave();
    w.player!.standUp();
    const p = g.places.find((p: { id: string }) => p.id === id);
    w.player!.position.set(p.x, p.y, p.z); g.resumeAvailable = false; g.contextKey = ''; g.updateNearby();
  }, id);
  await render(page);
}

async function talk(page: Page, id: string): Promise<void> {
  await close(page);
  await page.evaluate(id => {
    const w = window.__gp08, g = w.gameplay as any;
    if (g.interiors.indoor) g.interiors.leave();
    w.player!.standUp();
    const resident = g.contacts().find((c: { id: string }) => c.id === id);
    w.player!.position.set(resident.x, resident.y, resident.z); g.updateNearby();
  }, id);
  await page.locator('.life-interact').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /(?:小さな物語を聞く|物語の続きを話す)：/ }).click();
}

async function discovery(page: Page): Promise<void> {
  await close(page);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await page.getByRole('button', { name: '今いる場所の景色を手帳に残す', exact: true }).click();
}

test('real town stories, discoveries, scenic pauses and personal records remain coherent across a new day and reload', async ({ page }) => {
  test.setTimeout(900000);
  fs.mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  const people = await page.evaluate(() => {
    const w = window.__gp08, g = w.gameplay as any;
    return [0, 1, 2].map(remainder => g.contacts().find((c: { id: string; kind: string; x: number; z: number }) => c.kind === 'resident'
      && Number(c.id.slice(9)) % 3 === remainder && !w.scene!.metadata.town.obstacles.some((o: any) => c.x > o.minX - 4 && c.x < o.maxX + 4 && c.z > o.minZ - 4 && c.z < o.maxZ + 4))?.id as string);
  });
  expect(people.every(Boolean)).toBe(true);
  const initial = await state(page);
  const chapters = [
    { id: 'sakura', place: 'plaza', choice: '木陰で、ひと息つく', action: '木陰でひと息つく' },
    { id: 'sea', place: 'beach', choice: '遠くの海へ、目を向ける', action: '水平線に目を向ける' },
    { id: 'station', place: 'station', choice: 'この街へ帰る人を思う', action: '帰り道を思いながら耳を澄ます' },
  ];
  for (const [i, chapter] of chapters.entries()) {
    if (i === 2) {
      await place(page, 'home'); await page.locator('.life-interact').click();
      await page.getByRole('button', { name: '朝まで休む', exact: true }).click();
      await shot(page, 'sleep-story-day');
      await page.getByRole('button', { name: '眠って翌朝を迎える', exact: true }).click();
      await page.getByRole('button', { name: '街へ出る', exact: true }).click();
    }
    await talk(page, people[i]!);
    await shot(page, `story-${chapter.id}-offer`);
    if (i === 0) {
      await page.getByRole('button', { name: '今は聞くだけにする', exact: true }).click();
      expect((await state(page)).stories.arcs).toHaveLength(0);
      await talk(page, people[i]!);
    }
    await page.getByRole('button', { name: chapter.choice, exact: true }).click();
    expect((await state(page)).stories.arcs.find(arc => arc.id === chapter.id)?.stage).toBe('accepted');
    if (i === 0) {
      await close(page); await boot(page);
      await page.getByRole('button', { name: '続きや過ごし方を選ぶ', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('物語の続き');
      await expect(page.getByRole('button', { name: '別の過ごし方を選ぶ', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'そのまま街を歩く', exact: true })).toBeVisible();
      await shot(page, 'resume-unfinished');
      await page.getByRole('button', { name: '物語の続きへ', exact: true }).click();
      expect((await state(page)).preferences.destination).toBe('plaza');
    }
    await place(page, chapter.place);
    await discovery(page);
    if (i === 0) {
      await page.getByRole('button', { name: chapter.action, exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('ベンチに座ってから');
      expect((await state(page)).stories.arcs[0]!.stage).toBe('accepted');
      await close(page);
      const benchId = await page.evaluate(() => {
        const w = window.__gp08, g = w.gameplay as any;
        if (g.currentPlace() !== 'plaza') throw new Error(`Expected to remain in plaza before resting; current place: ${g.currentPlace()}`);
        const plaza = g.places.find((p: any) => p.id === 'plaza');
        if (!plaza) throw new Error('The plaza destination is missing');
        const candidates = g.restSpots().filter((b: any) => Math.hypot(b.x - plaza.x, b.z - plaza.z) < 240);
        const contacts = g.contacts().filter((c: any) => c.kind === 'resident');
        for (const bench of candidates) {
          // A collectible can take priority at the exact stand-up point. Also try
          // approaching a little farther from the seat, through the same real UI gate.
          for (const farther of [0, 8]) {
            const x = bench.exit.x + bench.fx * farther, z = bench.exit.z + bench.fz * farther;
            w.player!.position.set(x, w.scene!.metadata.town.heightAt(x, z), z);
            g.updateNearby();
            if (g.currentPlace() === 'plaza' && document.querySelector('.life-interact')?.textContent?.includes('座る')) return bench.id;
          }
        }
        const details = candidates.map((b: any) => {
          const nearby = contacts.filter((c: any) => Math.hypot(c.x - b.x, c.z - b.z) < 20)
            .map((c: any) => `${c.id} d=${Math.hypot(c.x - b.x, c.z - b.z).toFixed(1)} dy=${Math.abs(c.y - b.y).toFixed(1)}`);
          return `${b.id} (${b.x.toFixed(1)},${b.z.toFixed(1)}): ${nearby.join(', ') || 'no nearby residents; actual interaction unavailable'}`;
        });
        throw new Error(`No usable bench in the current plaza radius. Candidates: ${details.join('; ') || 'none'}`);
      });
      expect(benchId).toBeTruthy();
      await expect(page.locator('.life-interact')).toContainText('座る');
      await page.locator('.life-interact').click();
      expect(await page.evaluate(() => !!window.__gp08.player!.resting)).toBe(true);
      await discovery(page);
    }
    await page.getByRole('button', { name: chapter.action, exact: true }).click();
    expect((await state(page)).stories.arcs.find(arc => arc.id === chapter.id)?.stage).toBe('observed');
    await shot(page, `story-${chapter.id}-observation`);
    await page.getByRole('button', { name: /に会いに行く$/ }).last().click();
    expect((await state(page)).preferences.destination).toBe(people[i]);
    await talk(page, people[i]!);
    await page.getByRole('button', { name: '見つけたことを伝える', exact: true }).click();
    expect((await state(page)).stories.arcs.find(arc => arc.id === chapter.id)?.stage).toBe('completed');
    await shot(page, `story-${chapter.id}-return`);
  }
  const complete = await state(page);
  expect(complete.money).toBe(initial.money);
  expect(complete.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(() => ['plaza', 'beach'].map(id => window.__gp08.scene!.getMeshByName(`vista-keepsake-${id}`)!.isEnabled()))).toEqual([true, true]);

  // Scene geometry really contains this station wall; the landmark's radius alone is insufficient.
  await close(page);
  await page.evaluate(() => { const w = window.__gp08, g = w.gameplay as any; w.player!.position.set(38, 6, 638); g.updateNearby(); });
  expect(await page.evaluate(() => (window.__gp08.gameplay as any).currentPlace())).toBeUndefined();
  await place(page, 'summit');
  await page.evaluate(() => { window.__gp08.player!.position.y += 30; });
  expect(await page.evaluate(() => (window.__gp08.gameplay as any).currentPlace())).toBeUndefined();

  await close(page);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await page.getByRole('button', { name: '散歩', exact: true }).click();
  await page.locator('.life-theme-card').nth(1).click();
  await shot(page, 'walk-themes');
  for (const id of ['home', 'summit', 'beach', 'station', 'w-cafe', 'plaza']) {
    await place(page, id);
    await discovery(page);
    await page.getByRole('button', { name: '景色を手帳に残す', exact: true }).click();
    expect((await state(page)).exploration.observations.some(card => card.place === id)).toBe(true);
    await shot(page, `discovery-${id}`);
    if (['plaza', 'beach', 'summit'].includes(id)) {
      const before = await page.evaluate(() => ({ camera: window.__gp08.scene!.activeCamera!.name, position: window.__gp08.player!.position.asArray(), mask: window.__gp08.player!.root.layerMask }));
      await page.getByRole('button', { name: '手帳を閉じて、景色を眺める', exact: true }).click();
      await expect(page.getByRole('button', { name: '街歩きに戻る', exact: true })).toBeFocused();
      expect(await page.evaluate(() => (window.__gp08.player as any).controlsEnabled)).toBe(false);
      await render(page); await shot(page, `vista-${id}`);
      await page.keyboard.press('KeyW');
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => ({ camera: window.__gp08.scene!.activeCamera!.name, position: window.__gp08.player!.position.asArray(), mask: window.__gp08.player!.root.layerMask }))).toEqual(before);
      expect(await page.evaluate(() => (window.__gp08.player as any).controlsEnabled)).toBe(true);
    }
  }
  await close(page);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await page.getByRole('button', { name: '絵はがき', exact: true }).click();
  await page.locator('.life-postcard').filter({ hasText: '街の先の、ひろがり' }).getByRole('button', { name: '大切な場所にする', exact: true }).click();
  expect((await state(page)).exploration.favorite).toBe('beach');
  await shot(page, 'favorite-postcard');
  const earned = await state(page);

  // Clock hooks are explicit: this verifies date-dependent copy, not waiting speed or a walked route.
  await place(page, 'home');
  await page.locator('.life-interact').click();
  await page.getByRole('button', { name: '朝まで休む', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('あなたがこの街に残した時間');
  await shot(page, 'sleep-day-one');
  await page.getByRole('button', { name: '眠って翌朝を迎える', exact: true }).click();
  await page.getByRole('button', { name: '街へ出る', exact: true }).click();
  await close(page);
  await boot(page);
  expect((await state(page)).stories).toEqual(earned.stories);
  expect((await state(page)).exploration).toEqual(earned.exploration);
  await expect(page.locator('.life-context')).toContainText('あなたの散歩の、続きから');
  await page.getByRole('button', { name: '続きや過ごし方を選ぶ', exact: true }).click();
  await shot(page, 'resume-next-day');
  for (const [i, expected] of [[0, '木陰'], [1, '遠くの話']] as const) {
    await talk(page, people[i]!);
    await expect(page.getByRole('dialog')).toContainText(expected);
    await shot(page, `reunion-${i}`);
  }
  await place(page, 'home'); await page.locator('.life-interact').click();
  await page.getByRole('button', { name: '朝まで休む', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('今日、あなたがこの街に残した時間');
  await shot(page, 'sleep-quiet-day');
  await close(page);
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  await page.getByRole('button', { name: '人の物語', exact: true }).click();
  await shot(page, 'three-stories-complete');
  await page.getByRole('button', { name: '日々の記録', exact: true }).click();
  await shot(page, 'record-desktop');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await render(page);
    await page.getByRole('button', { name: '絵はがき', exact: true }).click();
    expect(await page.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await shot(page, `postcard-${viewport.width}`);
    await page.getByRole('button', { name: '人の物語', exact: true }).click();
    await shot(page, `story-${viewport.width}`);
    await expect(page.getByRole('button', { name: '閉じる [Esc]', exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const id of ['plaza', 'beach']) {
    await place(page, id);
    await page.evaluate(() => { const g = window.__gp08.gameplay as any; g.progress.life.minute = 1260; g.progress.life.weather = 'rain'; g.updateNearby(); });
    await render(page); await discovery(page);
    await expect(page.getByRole('dialog')).toContainText('いま、この場所で');
    await expect(page.getByRole('dialog')).toContainText('雨の日の寄り道');
    await shot(page, `revisit-night-rain-${id}`);
  }
  expect((await state(page)).exploration.observations).toEqual(earned.exploration.observations);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ errors, people, initial, earned, final: await state(page), positionHooks: true, fullRouteWalked: false }, null, 2));
});
