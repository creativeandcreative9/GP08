import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function hud(page: Page): Promise<void> {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css');
    const { GameUI } = await load('/src/gameplay/ui.ts');
    const { newProgress } = await load('/src/gameplay/state.ts');
    const { touchControls } = await load('/src/player/touch.ts');
    const noop = (): void => {};
    const ui = new GameUI({ interact: noop, inventory: noop, journal: noop, guide: noop, map: noop, save: noop,
      settings: noop, modal: noop, life: () => {
        ui.page('今日の寄り道');
        ui.addAction('住人に会いに公園へ', noop);
        ui.addAction('海辺で小さな発見を探す', noop);
        ui.addAction('自宅へ案内してもらう', noop);
      } });
    (window as unknown as { experienceUI: typeof ui }).experienceUI = ui;
    ui.update(newProgress()); ui.time('2日目 08:00 · 雨');
    ui.promptText('室内を歩こう · 出口は玄関側 [E]');
    touchControls({ setTouch: noop });
  });
}

test('night and morning messages leave touch actions clear in both phone orientations', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await hud(page);
  const states = [
    { title: '新しい朝、今日はどこへ', body: 'おつかいも持ち物も、昨日の続きから。外に出て、今日の街を歩いてみよう。', action: '街へ出る' },
    { title: 'おかえりなさい。家でひと休み', body: '左奥の布団で眠ると次の朝8時になります。ここから「朝まで休む」を選んでも眠れます。', action: '朝まで休む' },
    { title: '日が暮れたら、どう過ごそう', body: '夜は住人も家で休みます。自宅で眠ると次の朝8時へ。持ち物やおつかいはそのまま、夜の散歩も自由です。', action: '自宅への帰り道を案内', secondary: '夜の散歩を続ける' },
  ];
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const state of states) {
      await page.evaluate(state => {
        const ui = (window as unknown as { experienceUI: import('../src/gameplay/ui').GameUI }).experienceUI;
        ui.contextHint({ title: state.title, body: state.body, actionLabel: state.action, onAction() {}, secondaryLabel: state.secondary, onSecondary() {} });
        ui.navigate('自宅の中 · WASD / スティックで移動');
        ui.celebration('また、ここで朝を迎える', '家で眠り、新しい朝を迎えた。昨日歩いた道を、今日はもう知っている。暮らしの手帳に残しました。');
        ui.message('おはようございます。新しい一日が始まりました。', 0);
        ui.promptText('室内を歩こう · 出口は玄関側 [E]');
      }, state);
      await expect(page.locator('.life-goal')).toBeHidden();
      const selectors = ['.life-context', '.life-celebration', '.life-interact', '.life-notice', '.touch-controls', '.life-toolbar'];
      const boxes = [];
      for (const selector of selectors) {
        const element = page.locator(selector);
        await expect(element).toBeInViewport();
        boxes.push({ selector, ...(await element.boundingBox())! });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlap, `${width}×${height} ${state.title}: ${a.selector} overlaps ${b.selector}`).toBe(false);
      }
      for (const label of ['持ち物 [I]', '地図 [M]', '暮らし', '設定', state.action]) {
        const button = page.getByRole('button', { name: label, exact: true });
        await expect(button).toBeInViewport();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      // An enabled two-line action must fit too, not only the short resting prompt.
      await page.evaluate(() => (window as unknown as { experienceUI: import('../src/gameplay/ui').GameUI }).experienceUI
        .promptText('佐倉 はると話す · おつかいのことを聞いてみよう [E]'));
      const prompt = (await page.locator('.life-interact').boundingBox())!;
      for (const box of boxes.filter(b => b.selector !== '.life-interact')) {
        expect(prompt.x < box.x + box.width && prompt.x + prompt.width > box.x && prompt.y < box.y + box.height && prompt.y + prompt.height > box.y,
          `${width}×${height}: long action overlaps ${box.selector}`).toBe(false);
      }
      await page.screenshot({ path: testInfo.outputPath(`hud-${width}-${states.indexOf(state)}.png`) });
    }
  }
});

test('reduced-motion HUD keeps keyboard dialog focus and restores the main action on Escape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await hud(page);
  await page.evaluate(() => (window as unknown as { experienceUI: import('../src/gameplay/ui').GameUI }).experienceUI
    .celebration('歩いた道が、景色になる', '今日の思い出を、手帳に残しました。'));
  await expect(page.locator('.life-celebration')).toBeVisible();
  expect(await page.locator('.life-celebration').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  expect(await page.locator('.life-interact').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.getByRole('button', { name: '暮らし', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.locator('.touch-controls')).toBeHidden();
  await page.getByRole('button', { name: '住人に会いに公園へ', exact: true }).focus();
  for (const label of ['海辺で小さな発見を探す', '自宅へ案内してもらう', '閉じる [Esc]']) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '自宅へ案内してもらう', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.life-interact')).toBeFocused();
  await expect(page.locator('.touch-controls')).toBeVisible();
});
