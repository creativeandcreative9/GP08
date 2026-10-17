import { expect, test } from '@playwright/test';
import { cameraRelativeBearing, smoothBearing, type WayfinderState } from '../src/gameplay/wayfinder';

test('screen guidance shares movement orientation, including destinations behind the player', () => {
  const player = { x: 30, z: -20 };
  for (const forward of [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: -.7, z: .2 }, { x: -1, z: -1 }]) {
    const length = Math.hypot(forward.x, forward.z), x = forward.x / length, z = forward.z / length;
    const target = (right: number, ahead: number) => ({ x: player.x + z * right + x * ahead, z: player.z - x * right + z * ahead });
    expect(cameraRelativeBearing(player, target(0, 80), forward)).toBeCloseTo(0, 8);
    expect(cameraRelativeBearing(player, target(80, 0), forward)).toBeCloseTo(Math.PI / 2, 8);
    expect(cameraRelativeBearing(player, target(-80, 0), forward)).toBeCloseTo(-Math.PI / 2, 8);
    expect(Math.abs(cameraRelativeBearing(player, target(0, -80), forward)!)).toBeCloseTo(Math.PI, 8);
    expect(cameraRelativeBearing(player, target(80, -80), forward)).toBeCloseTo(3 * Math.PI / 4, 8);
  }
});

test('a route corner determines the arrow instead of the destination behind a wall', () => {
  const player = { x: 0, z: 0 }, forward = { x: 0, z: 1 };
  const walkingCorner = { x: 30, z: 0 }, destinationBehindBuilding = { x: 0, z: 120 };
  expect(cameraRelativeBearing(player, walkingCorner, forward)).toBe(Math.PI / 2);
  expect(cameraRelativeBearing(player, destinationBehindBuilding, forward)).toBe(0);
  expect(cameraRelativeBearing(player, walkingCorner, { x: 1, z: 0 })).toBe(0);
});

test('undefined headings and coincident waypoints cannot create a misleading direction', () => {
  const origin = { x: 0, z: 0 }, north = { x: 0, z: 1 };
  expect(cameraRelativeBearing(origin, origin, north)).toBeUndefined();
  expect(cameraRelativeBearing(origin, north, origin)).toBeUndefined();
  expect(cameraRelativeBearing(origin, { x: NaN, z: 1 }, north)).toBeUndefined();
  expect(cameraRelativeBearing(origin, north, { x: Infinity, z: 1 })).toBeUndefined();
});

test('arrow smoothing crosses the rear seam by the shortest arc and is frame-rate independent', () => {
  const before = Math.PI - .02, after = -Math.PI + .02;
  const crossed = smoothBearing(before, after, 1 / 30);
  expect(crossed).toBeGreaterThan(before);
  expect(crossed - before).toBeLessThan(.04);
  expect(smoothBearing(-before, -after, 1 / 30)).toBeLessThan(-before);
  const step = (rate: number): number => {
    let value = 0;
    for (let i = 0; i < rate; i++) value = smoothBearing(value, Math.PI / 2, 1 / rate);
    return value;
  };
  expect(step(30)).toBeCloseTo(step(120), 10);
  expect(step(30)).toBeCloseTo(Math.PI / 2, 4);
  expect(smoothBearing(undefined, after, 1 / 60)).toBe(after);
  expect(smoothBearing(before, after, -1)).toBe(before);
  expect(smoothBearing(before, NaN, 1)).toBe(before);
});

test('passive destination guidance fits small screens and respects disabled, indoor, modal and arrival states', async ({ page }) => {
  // Import only this DOM component; no 3D engine, scene, or private asset is started.
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/gameplay/wayfinder.ts', stylePath = '/src/gameplay/wayfinder.css';
    const { Wayfinder } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/gameplay/wayfinder');
    await import(/* @vite-ignore */ stylePath);
    const guide = new Wayfinder();
    const state: WayfinderState = {
      enabled: true, visible: true, target: { id: 'home', name: '桜並木の先の、わたしの小さな家' },
      player: { x: 0, z: 0 }, waypoint: { x: 0, z: -100 }, cameraForward: { x: 0, z: 1 },
      distanceMetres: 8, arrived: false,
    };
    Object.assign(window, { wayfinderTest: { guide, state, update: (patch: Partial<WayfinderState>) => guide.update({ ...state, ...patch }) } });
    guide.update(state);
  });
  const guide = page.locator('.life-wayfinder');
  await expect(guide).toContainText('あと 8 m · 後ろへ');
  expect(await guide.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
  expect(await guide.locator('button, a, [tabindex]').count()).toBe(0);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const box = (await guide.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 150);
  }
  const update = (patch: Partial<WayfinderState>) => page.evaluate(patch => {
    (window as unknown as { wayfinderTest: { update(patch: Partial<WayfinderState>): void } }).wayfinderTest.update(patch);
  }, patch);
  for (const patch of [{ enabled: false }, { indoors: true }, { visible: false }, { waypoint: undefined }]) {
    await update(patch);
    await expect(guide).toBeHidden();
    await update({});
    await expect(guide).toBeVisible();
  }
  await update({ arrived: true, waypoint: undefined, arrivalHint: '玄関で E を押す' });
  await expect(guide).toHaveAttribute('data-state', 'arrived');
  await expect(guide).toContainText('到着 · 玄関で E を押す');
  await expect(guide.locator('.life-wayfinder-needle')).toBeHidden();
  await expect(guide.locator('.life-wayfinder-check')).toBeVisible();
});
