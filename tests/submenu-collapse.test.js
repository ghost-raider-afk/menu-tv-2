import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);

async function read(path) {
  return readFile(new URL(path, publicRoot), 'utf8');
}

test('catalog keeps one product submenu entry while context links auto-collapse after selection', async () => {
  const [shell, navigation] = await Promise.all([
    read('js/components/shell.js'),
    read('js/core/navigation.js')
  ]);

  assert.match(navigation, /catalog:\s*Object\.freeze\(\[\['Продукция', '\/catalog\.html'\]\]\)/);
  assert.doesNotMatch(navigation, /\['Тара',|#packaging-list|#products-list/);
  assert.match(shell, /context\.addEventListener\('click'/);
  assert.match(shell, /closest\('\.app-route-link'\)/);
  assert.match(shell, /if \(routeLink && context\.contains\(routeLink\)\) setCollapsed\(shell, context, true\)/);
});
