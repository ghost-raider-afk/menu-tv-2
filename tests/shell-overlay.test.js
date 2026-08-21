import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('notifications live in the body-level overlay root, not inside header stacking context', async () => {
  const [shell, header, notifications, overlay, index] = await Promise.all([
    read('js/components/shell.js'),
    read('js/components/header.js'),
    read('js/components/notifications.js'),
    read('css/overlay.css'),
    read('css/index.css')
  ]);

  assert.match(shell, /dataOverlayRoot|dataset\.overlayRoot/);
  assert.match(shell, /document\.body\.append\(root\)/);
  assert.match(shell, /root\.append\(createNotificationsPanel\(\)\)/);
  assert.doesNotMatch(header, /createNotificationsPanel/);
  assert.doesNotMatch(notifications.match(/createNotificationsControl[\s\S]*?return wrap;/)?.[0] || '', /notifications-panel/);
  assert.match(notifications, /export function createNotificationsPanel/);
  assert.match(overlay, /\.ui-overlay-root\{position:fixed;z-index:var\(--ui-z-popover\);inset:0/);
  assert.match(overlay, /\.ui-overlay-root>\*\{pointer-events:auto\}/);
  assert.match(index, /@import url\('\.\/overlay\.css'\);\s*$/);
});
