import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('page loads, scene is ready, canvas is not blank', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__gp08?.ready === true, null, { timeout: 60_000 });
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);

  const buf = await page.locator('canvas').screenshot();
  const png = PNG.sync.read(buf);
  const colors = new Set<number>();
  for (let i = 0; i < png.data.length; i += 4) {
    colors.add((png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!);
    if (colors.size > 8) break;
  }
  expect(colors.size).toBeGreaterThan(8);
});

// Needs the private asset pack (npm run assets:extract); skipped where it is not present.
const hasModels = fs.existsSync(path.resolve('private-assets/seisen'));

test('MMD model (Fubuki) loads with its materials and textures', async ({ page }) => {
  test.skip(!hasModels, 'private-assets/seisen not found');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/?model=fubuki');
  await page.waitForFunction(() => window.__gp08?.ready === true, null, { timeout: 200_000 });

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__gp08.errors)).toEqual([]);
  const textured = await page.evaluate(
    () =>
      window.__gp08.scene!.materials.filter((m) => (m as { diffuseTexture?: unknown }).diffuseTexture).length,
  );
  expect(textured).toBeGreaterThan(10);
});
