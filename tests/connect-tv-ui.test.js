import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('TV connection styles are part of the SPA CSS bundle', async () => {
  const [indexCss, connectCss] = await Promise.all([
    read('css/index.css'),
    read('css/connect-tv.css')
  ]);
  assert.match(indexCss, /@import url\('\.\/connect-tv\.css'\)/);
  assert.match(connectCss, /\.connect-tv-grid/);
  assert.match(connectCss, /@media\(max-width:720px\)/);
  assert.match(connectCss, /\.connect-tv-card\.is-disabled\{display:none\}/);
});

test('mobile QR scanner decodes the same square guide visible to the user', async () => {
  const page = await read('js/pages/connect-tv.js');
  assert.match(page, /visibleSquare = Math\.min\(sourceWidth, sourceHeight\)/);
  assert.match(page, /guideCrop = Math\.max\(1, Math\.round\(visibleSquare \* 0\.78\)\)/);
  assert.match(page, /drawImage\(video, sourceX, sourceY, guideCrop, guideCrop, 0, 0, target, target\)/);
  assert.match(page, /width: \{ ideal: 1920 \}/);
  assert.match(page, /focusMode: 'continuous'/);
  assert.match(page, /QR-код распознан/);
});
