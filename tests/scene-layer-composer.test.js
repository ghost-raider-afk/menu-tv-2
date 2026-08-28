import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player scene layer stack reserves stable coarse layers for future scenes', async () => {
  const source = await read('js/player/scene-layer-composer.js');
  const expected = ['aquarium', 'menu', 'fx', 'content', 'entity', 'brand', 'announcement'];
  let last = -1;
  for (const id of expected) {
    const index = source.indexOf(`id: '${id}'`);
    assert.ok(index > last, `scene layer ${id} is missing or out of order`);
    last = index;
  }
  assert.match(source, /layer\.dataset\.sceneLayer = id/);
  assert.match(source, /ensureCore\(\)/);
});
