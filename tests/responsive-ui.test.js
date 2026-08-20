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
  assert.match(shell, /section === 'monitors' \|\| section === 'settings' \|\| section === 'catalog'/);
});

test('context submenu collapses immediately when a destination is selected', async () => {
  const shell = await read('src/web/admin-ui/public/js/components/shell.js');
  assert.match(shell, /context\.addEventListener\('click'/);
  assert.match(shell, /closest\('\.app-route-link'\)/);
  assert.match(shell, /setCollapsed\(shell, context, true\)/);
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

test('mobile catalog shows existing databases before create forms', async () => {
  const [page, css, navigation, router] = await Promise.all([
    read('src/web/admin-ui/public/catalog.html'),
    read('src/web/admin-ui/public/css/pages/catalog.css'),
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/core/router.js')
  ]);
  assert.match(page, /catalog-product-list[^>]*id="products"/);
  assert.match(page, /catalog-packaging-list[^>]*id="packaging"/);
  assert.match(page, /<h2>База продукции<\/h2>/);
  assert.match(page, /<h2>База тары<\/h2>/);
  assert.match(css, /grid-template-areas:"product-list" "product-form" "packaging-list" "packaging-form"/);
  assert.match(navigation, /\['Продукция', '\/catalog\.html#products'\]/);
  assert.match(navigation, /\['Тара', '\/catalog\.html#packaging'\]/);
  assert.match(router, /scrollToRouteTarget/);
  assert.match(router, /targetNode\.scrollIntoView/);
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
