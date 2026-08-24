import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_SCENE_ENTITY,
  ENTITY_SCENE_HEIGHT,
  ENTITY_SCENE_WIDTH,
  sceneEntityInput
} from '../src/contracts/scene-entity.js';

const root = new URL('../src/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('scene entity uses canonical FullHD coordinates independently from motion profile', () => {
  assert.equal(ENTITY_SCENE_WIDTH, 1920);
  assert.equal(ENTITY_SCENE_HEIGHT, 1080);
  const entity = sceneEntityInput({
    ...DEFAULT_SCENE_ENTITY,
    asset_url: '/site-assets/entities/entity-123e4567-e89b-42d3-a456-426614174000.webp',
    asset_width: 560,
    asset_height: 980,
    visible: true,
    transform: { x: 1500, y: 330, width: 320, scale: 1.1, rotation: -3, depth: 12, opacity: 0.92 }
  });
  assert.equal(entity.id, 'beer-glass');
  assert.equal(entity.visible, true);
  assert.deepEqual(entity.transform, { x: 1500, y: 330, width: 320, scale: 1.1, rotation: -3, depth: 12, opacity: 0.92 });
});

test('scene entity rejects foreign assets and invalid transforms', () => {
  assert.throws(() => sceneEntityInput({ asset_url: 'https://example.com/beer.png' }), /недопустимый адрес/);
  assert.throws(() => sceneEntityInput({ transform: { width: 0 } }), /Ширина/);
  assert.throws(() => sceneEntityInput({ transform: { opacity: 2 } }), /Opacity/);
});

test('Entity Editor is a separate layer from background, menu and Motion profile', async () => {
  const [html, page, preview, editor, animationContract, db, migration] = await Promise.all([
    read('web/admin-ui/public/animation.html'),
    read('web/admin-ui/public/js/pages/animation.js'),
    read('web/admin-ui/public/js/motion/screen-preview.js'),
    read('web/admin-ui/public/js/motion/entity-editor.js'),
    read('contracts/animation.js'),
    read('db/settings.js'),
    read('db/migrations/scene-entity.js')
  ]);

  for (const id of ['animation-entity-file','animation-entity-upload','animation-entity-name','animation-entity-visible','animation-entity-x','animation-entity-y','animation-entity-width']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(preview, /data-motion-entity-layer/);
  assert.match(editor, /ENTITY_SCENE.*width:\s*1920.*height:\s*1080/s);
  assert.match(editor, /ENTITY_SCENE\.width\s*\/\s*rect\.width/);
  assert.match(editor, /ENTITY_SCENE\.height\s*\/\s*rect\.height/);
  assert.match(editor, /pointerdown/);
  assert.match(editor, /data-entity-resize/);
  assert.match(page, /entity:\s*currentEntity/);
  assert.match(animationContract, /entity:\s*sceneEntityInput\(body\.entity\)/);
  assert.match(db, /entity_json/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS entity_json/);
  assert.doesNotMatch(animationContract, /profile:\s*\{[^}]*entity/s);
});

test('TV player receives, renders and caches Entity independently for offline playback', async () => {
  const [routes, player, playerCss, serviceWorker] = await Promise.all([
    read('api/device/public-routes.js'),
    read('web/admin-ui/public/js/player/player.js'),
    read('web/admin-ui/public/css/player.css'),
    read('web/admin-ui/public/player-sw.js')
  ]);
  assert.match(routes, /store\.getAnimationSettings\(\)/);
  assert.match(routes, /entity:\s*animationSettings\?\.entity/);
  assert.match(player, /renderSceneEntity\(playerStage, context\.entity, \{ editable: false \}\)/);
  assert.match(player, /context\?\.entity\?\.asset_url/);
  assert.match(playerCss, /\.tv-player-entity-layer/);
  assert.match(serviceWorker, /\/js\/motion\/entity-editor\.js/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/site-assets\/'\)/);
});
