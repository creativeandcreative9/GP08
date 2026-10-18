import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function journal(page: Page): Promise<void> {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    await load('/src/style.css');
    const { GameUI } = await load('/src/gameplay/ui.ts');
    const noop = (): void => {};
    const ui = new GameUI({ interact: noop, inventory: noop, journal: noop, guide: noop, map: noop, save: noop, settings: noop, modal: noop, life: noop });
    ui.promptText('街歩きを続ける [E]');
    (window as unknown as { journalUI: import('../src/gameplay/ui').GameUI }).journalUI = ui;
  });
}

test('journal sections and favorite actions keep focus through synchronous page rebuilds', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await journal(page);
  await page.evaluate(() => {
    const ui = (window as unknown as { journalUI: import('../src/gameplay/ui').GameUI }).journalUI;
    let favorite = false;
    const sections = ['散歩', '物語', '絵はがき', '記録'];
    const render = (section: string): void => {
      ui.page('暮らしの手帳');
      ui.sectionNav(sections.map(label => ({ label, active: label === section, action: () => render(label) })));
      if (section === '散歩') ui.themeCards([{ id: 'sea', title: '海の音を聞きに', body: '急がず、砂浜で小さな発見を。', scene: 'sea', action() {} }]);
      if (section === '物語') ui.storyCard({ id: 'letter', title: 'まだ渡していない手紙', person: '佐倉 はる', body: ['「坂の上から見た街を、母に伝えたくて。」', 'あなたの言葉を、はるはゆっくり読み返した。'], step: 2, totalSteps: 3, choice: '見晴らしのいい場所を、一緒に探す' }, [{ label: '続きを聞く', action() {}, primary: true }]);
      if (section === '絵はがき') ui.postcard({ id: 'sea-1', title: '雨がやむのを待つ海辺', body: '静かな波の音を、しばらく聞いていた。', day: 2, minute: 890, weather: 'rain', scene: 'sea', place: '海辺', favorite }, [
        { label: favorite ? 'お気に入りを外す' : 'お気に入りに残す', pressed: favorite, action: () => { favorite = !favorite; render('絵はがき'); } },
        { label: 'この場所へ案内', action() {} },
      ]);
      if (section === '記録') ui.timeline([
        { id: 'sea', title: '海辺でひと休み', body: '雨の音と、静かな波。', day: 2, minute: 890, kind: 'postcard' },
        { id: 'morning', title: '新しい朝の散歩', body: '家を出て、公園へ。', day: 2, minute: 480, kind: 'walk' },
        { id: 'hello', title: '最初のあいさつ', body: '知らない街で声を交わした。', day: 1, minute: 900, kind: 'memory' },
      ]);
    };
    render('散歩');
  });
  const dialog = page.getByRole('dialog', { name: '暮らしの手帳' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: '物語', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'まだ渡していない手紙' })).toBeVisible();
  await expect(page.getByRole('button', { name: '物語', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: '物語', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '絵はがき', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '絵はがき', exact: true })).toBeFocused();
  await expect(dialog).toContainText('2日目 14:50 · 雨');
  await page.getByRole('button', { name: 'お気に入りに残す', exact: true }).click();
  const remove = page.getByRole('button', { name: 'お気に入りを外す', exact: true });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(remove).toBeFocused();
  await expect(page.locator('.life-postcard-favorite')).toHaveText('大切な一枚');
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(page.locator('.life-journal-timeline')).toContainText('海辺でひと休み');
  await expect(page.locator('.life-timeline-day-title')).toHaveText(['2日目', '1日目']);
  const secondDay = page.locator('.life-timeline-day').first();
  await expect(secondDay.locator('ol > li')).toHaveCount(2);
  await expect(secondDay.locator('.life-timeline-when small')).toHaveText(['14:50', '08:00']);
  await expect(page.locator('.life-timeline-day').last().locator('ol > li')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.life-interact')).toBeFocused();
});

test('illustrated journal cards fit portrait and landscape without hiding their text or actions', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await journal(page);
  await page.evaluate(() => {
    const ui = (window as unknown as { journalUI: import('../src/gameplay/ui').GameUI }).journalUI;
    ui.page('絵はがきと散歩の記録');
    ui.sectionNav([{ label: '散歩', active: false, action() {} }, { label: '物語', active: false, action() {} }, { label: '絵はがき', active: true, action() {} }, { label: '記録', active: false, action() {} }]);
    const scenes = ['park', 'sea', 'hill', 'town', 'home', 'station'] as const;
    for (const [i, scene] of scenes.entries()) ui.postcard({ id: scene, title: `${i + 1}. いつもの街で見つけた、小さな景色`, body: '歩いてきた道を振り返ると、今日だけの景色が残っていた。', day: 3, minute: i % 2 ? 1170 : 840, weather: i % 2 ? 'rain' : 'clear', scene, place: '今日、訪れた場所', favorite: i === 0 }, [{ label: 'この場所へもう一度歩いてみる', action() {}, primary: true }]);
    ui.themeCards([{ id: 'quiet', title: '静かな時間を探す', body: '予定を決めず、気になる道へ。', detail: 'いつでも別の散歩に変えられます', selected: true, scene: 'park', action() {} }]);
  });
  await expect(page.locator('.life-postcard')).toHaveCount(6);
  await expect(page.locator('.life-postcard-art svg[aria-hidden=true]')).toHaveCount(6);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const content = page.locator('.life-dialog-content');
    const close = page.getByRole('button', { name: '閉じる [Esc]', exact: true });
    await content.evaluate(node => { node.scrollTop = 0; });
    await expect(close).toBeInViewport({ ratio: 1 });
    const closeAtTop = (await close.boundingBox())!;
    expect(closeAtTop.height).toBeGreaterThanOrEqual(44);
    expect(await content.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    const cards = page.locator('.life-postcard');
    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      const action = card.getByRole('button');
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expect(close).toBeInViewport({ ratio: 1 });
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    const theme = page.locator('.life-theme-card');
    await theme.scrollIntoViewIfNeeded();
    await expect(theme).toBeInViewport();
    await expect(theme).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(close).toBeInViewport({ ratio: 1 });
    const closeAtBottom = (await close.boundingBox())!;
    expect(Math.abs(closeAtBottom.y - closeAtTop.y)).toBeLessThanOrEqual(1);
    const contentBounds = (await content.boundingBox())!;
    expect(contentBounds.y + contentBounds.height).toBeLessThanOrEqual(closeAtBottom.y);
    await content.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`journal-${width}.png`) });
  }
  await page.getByRole('button', { name: '閉じる [Esc]', exact: true }).click();
  await expect(page.locator('dialog')).toBeHidden();
  await expect(page.locator('.life-interact')).toBeFocused();
});
