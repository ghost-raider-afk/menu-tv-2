import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('frontend loader applies TV Menu 1 theme before modular application', async () => {
  const loader = await read('app.js');
  assert.match(loader, /\/css\/tv1\.css/);
  assert.match(loader, /data\.frontendTheme = 'tv-menu-1'/);
});

test('TV Menu 1 shell is a real modular component', async () => {
  const [application, shell] = await Promise.all([
    read('js/application.js'),
    read('js/components/shell.js')
  ]);
  assert.match(application, /initialiseShell/);
  assert.match(shell, /ui-rail/);
  assert.match(shell, /ui-context/);
  assert.match(shell, /legacy-sidebar/);
  assert.match(shell, /Торговые точки/);
  assert.match(shell, /Продукция и тара/);
});

test('TV Menu 1 visual tokens own the new frontend identity', async () => {
  const [theme, tokens] = await Promise.all([
    read('css/tv1.css'),
    read('css/tv1/tokens.css')
  ]);
  assert.match(theme, /tv1\/shell\.css/);
  assert.match(theme, /tv1\/editor\.css/);
  assert.match(tokens, /--brand-accent:#f4c915/i);
  assert.match(tokens, /--ui-rail-width:76px/);
  assert.match(tokens, /--ui-context-width:310px/);
});
