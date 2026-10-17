import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
});

test('frame statistics include stalls and exclude warm-up and background gaps', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/gameplay/performance.ts';
    const { FrameMeasurement } = await import(/* @vite-ignore */ path) as typeof import('../src/gameplay/performance');
    const check = new FrameMeasurement();
    check.frame(0, true); check.frame(3000, true);
    for (let i = 1; i <= 500; i++) check.frame(3000 + i * 20, true);
    check.frame(14000, false); // A menu opens; its time must never affect the statistics.
    check.frame(1000000, true);
    for (let i = 1; i <= 950; i++) check.frame(1000000 + i * 20, true);
    const beforeStall = check.result;
    check.frame(1020000, true); // A genuine one-second visible stall must count.
    const completed = check.result;
    check.frame(2000000, true); // Completion is stable and no further samples are accepted.
    return { beforeStall, completed, after: check.result };
  });
  expect(result.beforeStall).toBeUndefined();
  expect(result.completed).toMatchObject({ frames: 1451, durationMs: 30000, medianMs: 20, p95Ms: 20 });
  expect(result.completed!.meanFPS).toBeCloseTo(1451 / 30, 8);
  expect(result.after).toEqual(result.completed);
});

test('phone settings measure locally, record quality changes and offer a copy fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const path = '/src/gameplay/performance.ts';
    const { PerformanceCheck } = await import(/* @vite-ignore */ path) as typeof import('../src/gameplay/performance');
    const dialog = document.createElement('dialog'), notice = document.createElement('p');
    notice.id = 'measurement-notice'; document.body.append(dialog, notice);
    let quality: 'high' | 'low' = 'high';
    const check = new PerformanceCheck(() => ({ quality, mode: 'auto', renderSize: [260, 562], scaling: quality === 'high' ? 1 : 1.8 }), text => { notice.textContent = text; }, () => dialog.close());
    const show = (): void => { dialog.replaceChildren(); check.settings(dialog); dialog.showModal(); };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('clipboard unavailable'); } } });
    (window as any).measurement = { check, show, low: () => { quality = 'low'; } };
    show();
  });
  await page.getByRole('button', { name: '動作を30秒測る', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(() => {
    const { check, low } = (window as any).measurement;
    check.frame(0, true); check.frame(3000, true);
    for (let i = 1; i <= 1500; i++) { if (i === 750) low(); check.frame(3000 + i * 20, true); }
    (window as any).measurement.show();
  });
  await expect(page.getByRole('dialog')).toContainText('平均 50.0 FPS');
  const text = page.getByRole('textbox', { name: '動作確認の結果', exact: true });
  const report = JSON.parse(await text.inputValue());
  expect(report).toMatchObject({ version: 1, frames: 1500, durationMs: 30000, meanFPS: 50,
    start: { quality: 'high', mode: 'auto', scaling: 1 }, end: { quality: 'low', scaling: 1.8, viewport: [390, 844] } });
  expect(report).not.toHaveProperty('url'); expect(report).not.toHaveProperty('save');
  await page.getByRole('button', { name: '結果をコピー', exact: true }).click();
  await expect(page.locator('#measurement-notice')).toContainText('端末のコピー操作');
  expect(await text.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(100);
  // A cancelled run cannot replace the last completed result.
  await page.getByRole('button', { name: '動作を30秒測る', exact: true }).click();
  await page.evaluate(() => { const m = (window as any).measurement; m.check.frame(0, true); m.check.frame(3000, true); m.check.frame(3100, true); m.show(); });
  await page.getByRole('button', { name: '計測を中止する', exact: true }).click();
  await page.evaluate(() => { const m = (window as any).measurement; m.check.frame(999999, true); m.show(); });
  expect(JSON.parse(await text.inputValue())).toEqual(report);
  await page.evaluate(() => (window as any).measurement.check.dispose());
});

test('the visibility event excludes a background gap even if no hidden frames are delivered', async ({ page }) => {
  const text = await page.evaluate(async () => {
    const path = '/src/gameplay/performance.ts';
    const { PerformanceCheck } = await import(/* @vite-ignore */ path) as typeof import('../src/gameplay/performance');
    const body = document.createElement('section'); document.body.append(body);
    const check = new PerformanceCheck(() => ({ quality: 'low', mode: 'low', renderSize: [260, 562], scaling: 1.5 }), () => {}, () => {});
    check.settings(body); body.querySelector('button')!.click(); check.frame(0, true); check.frame(3000, true);
    for (let i = 1; i <= 500; i++) check.frame(3000 + i * 20, true);
    document.dispatchEvent(new Event('visibilitychange')); check.frame(1000000, true);
    for (let i = 1; i <= 1000; i++) check.frame(1000000 + i * 20, true);
    body.replaceChildren(); check.settings(body); check.dispose();
    return body.querySelector('textarea')!.value;
  });
  expect(JSON.parse(text)).toMatchObject({ meanFPS: 50, frames: 1500, durationMs: 30000 });
});
