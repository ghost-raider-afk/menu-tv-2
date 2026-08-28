import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Player scene layer stack reserves stable coarse layers for future scenes', async () => {
  const [source, overlays, playerCss] = await Promise.all([
    read('js/player/scene-layer-composer.js'),
    read('js/player/overlay-runtime.js'),
    read('css/player.css')
  ]);
  const expected = ['environment', 'menu', 'fx', 'content', 'entity', 'brand', 'announcement'];
  let last = -1;
  for (const id of expected) {
    const index = source.indexOf(`id: '${id}'`);
    assert.ok(index > last, `scene layer ${id} is missing or out of order`);
    last = index;
  }
  assert.match(source, /layer\.dataset\.sceneLayer = id/);
  assert.match(source, /ensureCore\(\)/);
  assert.doesNotMatch(source, /id:\s*'aquarium'/);
  assert.match(overlays, /ensurePlayerSceneLayer\(stage, 'environment'/);
  assert.match(overlays, /renderAquariumLayer\(environmentLayer, context\.aquarium/);
  assert.doesNotMatch(overlays, /ensurePlayerSceneLayer\(stage, 'aquarium'/);
  assert.match(playerCss, /\.tv-player-environment-layer/);
  assert.doesNotMatch(playerCss, /\.tv-player-aquarium-layer/);
});
