import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const htmlPages = ['index.html','locations.html','screens.html','screen-editor.html','catalog.html','templates.html','settings.html','profile.html','signin.html'];

test('all pages use the single final CSS entrypoint and contain no legacy shell', async () => {
  for (const page of htmlPages) {
    const html = await read(page);
    assert.match(html, /href="\/css\/index\.css"/, page);
    assert.doesNotMatch(html, /href="\/style\.css"/, page);
    assert.doesNotMatch(html, /class="[^"]*\bsidebar\b/, page);
    assert.doesNotMatch(html, /class="[^"]*\btopbar\b/, page);
    assert.doesNotMatch(html, /ui-v319/, page);
  }
});

test('CSS architecture has one permanent entrypoint and TV Menu 1 identity tokens', async () => {
  const [entry, tokens] = await Promise.all([read('css/index.css'), read('css/tokens.css')]);
  for (const required of ['./tokens.css','./base.css','./shell.css','./components.css','./forms.css','./tables.css','./editor/editor.css','./auth/signin.css']) {
    assert.ok(entry.includes(required), required);
  }
  assert.doesNotMatch(entry, /tv1/i);
  assert.match(tokens, /--brand-accent:#f4c915/i);
  assert.match(tokens, /--ui-rail-width:76px/);
  assert.match(tokens, /--ui-context-width:310px/);
});

test('shell is composed from dedicated permanent components', async () => {
  const [shell, navigation] = await Promise.all([read('js/components/shell.js'), read('js/core/navigation.js')]);
  assert.match(shell, /createSidebar/);
  assert.match(shell, /createContextPanel/);
  assert.match(shell, /createHeader/);
  assert.doesNotMatch(shell, /legacy|\.sidebar|\.topbar/i);
  assert.match(navigation, /Продукция/);
  assert.match(navigation, /Тара/);
});

test('menu editor owns the canonical left-aligned TV board table', async () => {
  const [rows, preview, renderer, editorCss, editorHtml, tablesCss, templatesHtml] = await Promise.all([
    read('js/editor/rows.js'),
    read('js/editor/preview.js'),
    read('js/editor/renderer.js'),
    read('css/editor/editor.css'),
    read('screen-editor.html'),
    read('css/tables.css'),
    read('templates.html')
  ]);
  assert.match(rows, /editor-menu-table-head/);
  assert.match(rows, /'1 л'/);
  assert.match(rows, /'1,5 л'/);
  assert.match(preview, /tv-board-table/);
  assert.match(preview, /menu-preview-producer/);
  assert.match(renderer, /producer: product\?\.producer/);
  assert.match(renderer, /leftMarginFactor: 0\.008/);
  assert.match(renderer, /normal: 0\.78/);
  assert.match(editorCss, /\.tv-board-table/);
  assert.match(editorCss, /left:\.8%/);
  assert.match(editorCss, /grid-template-columns:minmax\(0,76fr\) minmax\(0,12fr\) minmax\(0,12fr\)/);
  assert.match(editorCss, /\.editor-main-column\{display:grid;min-width:0;gap:0/);
  assert.match(editorCss, /\.editor-preview-card\{min-width:0;padding:0;border-top:0/);
  assert.match(editorHtml, /class="editor-main-column"[\s\S]*editor-menu-card[\s\S]*editor-preview-card/);
  assert.doesNotMatch(editorCss, /\.tv1-menu-table/);
  assert.doesNotMatch(tablesCss, /menu-preview|editor-menu-table/);
  assert.match(templatesHtml, /id="template-background-file"/);
  assert.match(templatesHtml, /id="template-background-upload"/);
});

test('legacy frontend files are physically absent', async () => {
  for (const path of ['style.css','css/tv1.css','css/tv1/tokens.css','css/tv1/base.css','css/tv1/shell.css','css/tv1/pages.css','css/tv1/editor.css','css/tv1/auth.css','js/components/chrome.js']) {
    await assert.rejects(access(new URL(path, root)), undefined, path);
  }
});
