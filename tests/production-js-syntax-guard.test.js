import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('production image cannot be built with syntactically invalid JavaScript', async () => {
  const [dockerfile, packageJson] = await Promise.all([
    read('Dockerfile'),
    read('package.json')
  ]);
  const scripts = JSON.parse(packageJson).scripts || {};

  assert.match(String(scripts.build || ''), /node --check/);
  assert.match(dockerfile, /COPY src \.\/src[\s\S]*RUN npm run build/);
});

test('standalone Visual FX calls close addAnimation exactly once', async () => {
  const player = await read('src/web/admin-ui/public/js/motion/preview-player.js');

  for (const effect of ['spotlight', 'liquid-glass']) {
    const start = player.indexOf(`effect === '${effect}'`);
    assert.ok(start >= 0, `${effect} branch must exist`);
    const branch = player.slice(start, player.indexOf('\n  }', start) + 4);
    assert.match(branch, /addAnimation\([\s\S]*\], \{ duration: total, easing \}\);/);
    assert.doesNotMatch(branch, /\], \{ duration: total, easing \}\)\);/);
  }
});
