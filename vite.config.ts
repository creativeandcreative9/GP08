import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.tga': 'image/x-tga',
  '.pmx': 'application/octet-stream',
  '.pmd': 'application/octet-stream',
  '.vmd': 'application/octet-stream',
};

const PREFIX = '/private/';

/** Dev/preview port. GP08_PORT lets several checkouts run their servers side by side. */
const PORT = Number(process.env.GP08_PORT ?? 5178);

/** Serves licensed assets from a private directory (never part of the build output). */
function privateAssets(): Plugin {
  const dir = path.resolve(process.env.GP08_PRIVATE_DIR ?? path.resolve(here, 'private-assets'));

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith(PREFIX)) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    let rel: string;
    try {
      rel = decodeURIComponent(rawUrl.slice(PREFIX.length).split('?')[0]!.split('#')[0]!);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }
    if (rel.includes('\0')) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const file = path.resolve(dir, rel);
    if (file !== dir && !file.startsWith(dir + path.sep)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(st.size));
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    });
  };

  return {
    name: 'gp08-private-assets',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [privateAssets()],
  server: { port: PORT, host: '127.0.0.1', strictPort: true },
  preview: { port: PORT, host: '127.0.0.1', strictPort: true },
  // babylon-mmd loads its wasm via new URL(..., import.meta.url), so it must not be pre-bundled.
  // @babylonjs/core is excluded too: otherwise the app and babylon-mmd would get two copies of it
  // (separate loader-plugin registries, so the .pmx loader would not be found).
  optimizeDeps: { exclude: ['babylon-mmd', '@babylonjs/core'] },
  build: { chunkSizeWarningLimit: 6000 },
});
