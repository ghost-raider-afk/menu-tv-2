import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('mobile shell uses bottom navigation with an explicit Overview destination', async () => {
  const [indexCss, responsive, sidebar, shell] = await Promise.all([
    read('src/web/admin-ui/public/css/index.css'),
    read('src/web/admin-ui/public/css/responsive.css'),
    read('src/web/admin-ui/public/js/components/sidebar.js'),
    read('src/web/admin-ui/public/js/components/shell.js')
  ]);
  assert.match(indexCss, /@import url\('\.\/responsive\.css'\)/);
  assert.match(responsive, /@media\(max-width:720px\)/);
  assert.match(responsive, /\.ui-rail\{position:fixed[\s\S]*bottom:0/);
  assert.match(responsive, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(sidebar, /ui-rail-mobile-home/);
  assert.match(sidebar, /label: 'Обзор'/);
  assert.match(shell, /max-width: 720px/);
  assert.match(shell, /isMobileShell/);
  assert.match(shell, /usesContextMenu/);
  assert.match(shell, /section === 'monitors' \|\| section === 'settings'/);
});

test('mobile editor converts the desktop table into touch-friendly cards', async () => {
  const [editorCss, responsive, rows] = await Promise.all([
    read('src/web/admin-ui/public/css/editor/editor.css'),
    read('src/web/admin-ui/public/css/responsive.css'),
    read('src/web/admin-ui/public/js/editor/rows.js')
  ]);
  assert.match(editorCss, /min-width:900px/);
  assert.match(responsive, /\.editor-menu-editor-table\{display:block;width:100%;min-width:0/);
  assert.match(responsive, /\.editor-menu-editor-table tr\{display:grid/);
  assert.match(responsive, /\.editor-row-action\{width:40px;height:40px/);
  assert.match(rows, /editor-menu-price-primary/);
  assert.match(rows, /editor-menu-price-secondary/);
});

test('mobile controls avoid iOS zoom and keep practical touch targets', async () => {
  const responsive = await read('src/web/admin-ui/public/css/responsive.css');
  assert.match(responsive, /font-size:16px/);
  assert.match(responsive, /\.button\{min-height:44px/);
  assert.match(responsive, /\.icon-button\{width:40px;height:40px/);
  assert.match(responsive, /safe-area-inset-bottom/);
});

test('TV connection uses the common design system and a dedicated device workflow', async () => {
  const [page, css, navigation] = await Promise.all([
    read('src/web/admin-ui/public/connect-tv.html'),
    read('src/web/admin-ui/public/css/connect-tv.css'),
    read('src/web/admin-ui/public/js/core/navigation.js')
  ]);
  assert.match(page, /ТЕЛЕВИЗОРЫ/);
  assert.match(page, /Подключение ТВ/);
  assert.match(css, /var\(--ui-panel\)/);
  assert.match(css, /var\(--ui-border\)/);
  assert.doesNotMatch(css, /var\(--surface|var\(--border-color|var\(--muted-text/);
  assert.match(navigation, /label: 'ТЕЛЕВИЗОРЫ'/);
});
