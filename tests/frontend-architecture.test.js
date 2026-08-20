import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const htmlPages = ['index.html','locations.html','screens.html','screen-editor.html','catalog.html','settings.html','profile.html','signin.html'];

test('all current pages use the single final CSS entrypoint', async () => {
  for (const page of htmlPages) {
    const html = await read(page);
    assert.match(html, /href="\/css\/index\.css"/, page);
    assert.doesNotMatch(html, /href="\/style\.css"|ui-v319/, page);
  }
});

test('templates frontend is physically absent', async () => {
  for (const path of ['templates.html','js/pages/templates.js','js/editor/templates.js','css/pages/templates.css']) {
    await assert.rejects(access(new URL(path, root)), undefined, path);
  }
  const [application, navigation, config, entry] = await Promise.all([
    read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'), read('css/index.css')
  ]);
  for (const source of [application, navigation, config, entry]) assert.doesNotMatch(source, /templates\.html|api\/templates|pages\/templates|templates\.css/);
});

test('CSS architecture is compact and has one permanent entrypoint', async () => {
  const [entry, tokens] = await Promise.all([read('css/index.css'), read('css/tokens.css')]);
  for (const required of ['./tokens.css','./base.css','./shell.css','./components.css','./forms.css','./tables.css','./editor/editor.css','./auth/signin.css']) {
    assert.ok(entry.includes(required), required);
  }
  assert.doesNotMatch(entry, /tv1|templates\.css/i);
  assert.match(tokens, /--brand-accent:#f4c915/i);
  assert.match(tokens, /--ui-rail-width:64px/);
  assert.match(tokens, /--ui-context-width:250px/);
  assert.match(tokens, /--ui-control-height:32px/);
});

test('shell remains modular after compact redesign', async () => {
  const [shell, navigation] = await Promise.all([read('js/components/shell.js'), read('js/core/navigation.js')]);
  assert.match(shell, /createSidebar/);
  assert.match(shell, /createContextPanel/);
  assert.match(shell, /createHeader/);
  assert.doesNotMatch(shell, /legacy|\.sidebar|\.topbar/i);
  assert.match(navigation, /Продукция/);
  assert.match(navigation, /Тара/);
  assert.doesNotMatch(navigation, /Шаблоны/);
});

test('monitor editor owns one sticky command bar and one canonical renderer', async () => {
  const [rows, preview, finalImage, renderer, editorCss, editorHtml, tablesCss] = await Promise.all([
    read('js/editor/rows.js'), read('js/editor/preview.js'), read('js/editor/final-image.js'), read('js/editor/renderer.js'),
    read('css/editor/editor.css'), read('screen-editor.html'), read('css/tables.css')
  ]);
  assert.match(rows, /editor-menu-editor-table/);
  assert.match(rows, /<th>Данные из базы<\/th>/);
  assert.match(rows, /<th>1 л<\/th>/);
  assert.match(rows, /<th>1,5 л<\/th>/);
  assert.match(preview, /buildTableSvg/);
  assert.match(finalImage, /buildTableSvg/);
  assert.match(renderer, /formatProductMetadata/);
  assert.match(renderer, /formatStrength\(product\?\.strength/);
  assert.match(renderer, /tableX: 56/);
  assert.match(renderer, /tableWidth: 1374/);
  assert.match(renderer, /tableHeight: 925/);
  assert.match(renderer, /tableFrame\(model\)/);
  assert.match(renderer, /table_width_px/);
  assert.match(renderer, /table_height_px/);
  assert.match(renderer, /viewBox="0 0 \$\{model\.viewport\.width\} \$\{model\.viewport\.height\}"/);
  assert.doesNotMatch(renderer, /verticalSeparatorsMarkup/);
  assert.match(editorCss, /\.editor-commandbar\{position:sticky/);
  assert.match(editorCss, /\.editor-tool-popover/);
  assert.match(editorCss, /\.editor-menu-editor-table tbody tr\{height:27px/);
  assert.match(editorCss, /height:22px/);
  assert.doesNotMatch(editorCss, /!important|\.tv-board-table/);
  assert.match(editorHtml, /class="editor-commandbar"/);
  for (const id of ['editor-table-x','editor-table-y','editor-table-width','editor-table-height','editor-background-file','editor-font-family','editor-font-scale']) {
    assert.match(editorHtml, new RegExp(`id="${id}"`));
  }
  assert.match(editorHtml, />Tahoma Bold<\/option>/);
  assert.doesNotMatch(editorHtml, /editor-template|Использовать шаблон|ШАБЛОН/);
  assert.doesNotMatch(tablesCss, /menu-preview|editor-menu-table/);
});

test('login logo has exactly seven size levels with level one as base size', async () => {
  const [signinCss, settingsHtml, presentation] = await Promise.all([
    read('css/auth/signin.css'), read('settings.html'), read('js/core/presentation.js')
  ]);
  assert.match(signinCss, /\.signin-brand \.brand-mark\{[^}]*width:44px[^}]*height:44px/);
  for (let level = 2; level <= 7; level += 1) assert.match(signinCss, new RegExp(`data-signin-logo-size="${level}"`));
  assert.match(settingsHtml, /id="site-signin-logo-size"/);
  for (let level = 1; level <= 7; level += 1) assert.match(settingsHtml, new RegExp(`value="${level}"`));
  assert.match(presentation, /dataset\.signinLogoSize/);
});

test('legacy frontend files are physically absent', async () => {
  for (const path of ['style.css','css/tv1.css','css/tv1/tokens.css','css/tv1/base.css','css/tv1/shell.css','css/tv1/pages.css','css/tv1/editor.css','css/tv1/auth.css','js/components/chrome.js']) {
    await assert.rejects(access(new URL(path, root)), undefined, path);
  }
});
