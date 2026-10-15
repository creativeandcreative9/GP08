// Usage: node tools/screenshot.mjs [--query "?a=b"] [--out screenshots/shot.png] [--wait 1000] [--timeout 60000]
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const query = arg('query', '');
const out = arg('out', 'screenshots/shot.png');
const wait = Number(arg('wait', '1000'));
const timeout = Number(arg('timeout', '60000'));

let server;
let browser;
let failed = false;

try {
  server = await createServer({ server: { port: 5178, host: '127.0.0.1', strictPort: true } });
  await server.listen();

  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`[console.error] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    failed = true;
    console.error(`[pageerror] ${e.message}`);
  });

  await page.goto(`http://127.0.0.1:5178/${query}`);
  try {
    await page.waitForFunction(() => window.__gp08 && window.__gp08.ready === true, null, { timeout });
  } catch {
    failed = true;
    console.error(`__gp08.ready did not become true within ${timeout}ms`);
  }
  await page.waitForTimeout(wait);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`Saved ${out}`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
