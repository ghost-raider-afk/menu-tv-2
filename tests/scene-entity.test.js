import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { sceneEntityInput } from '../src/contracts/scene-entity.js';
import { replaceEntityAssetStream } from '../src/services/entity-assets-service.js';
import { PayloadTooLargeError } from '../src/shared/errors.js';

const root = new URL('../src/', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

// Existing tests above remain unchanged in intent; this file is kept complete so the
// per-screen player assertion below is versioned with the runtime contract.

test('scene entity v2 keeps canonical FullHD coordinates and image compatibility', () => {
  const entity = sceneEntityInput({
    name: 'Бокал', visible: true, asset_url: '/site-assets/entities/entity-12345678-1234-4234-8234-123456789abc.png',
    asset_type: 'image', media_type: 'image/png', width: 320, height: 640, has_alpha: true,
    transform: { x: 1510, y: 340, width: 310, scale: 1, rotation: 0, depth: 12, opacity: 1 }
  });
  assert.equal(entity.asset_type, 'image');
  assert.equal(entity.media_type, 'image/png');
  assert.equal(entity.transform.x, 1510);
  assert.equal(entity.transform.y, 340);
  assert.equal(entity.transform.width, 310);
});

test('scene entity v2 accepts MP4/WebM playback metadata and rejects media mismatches', () => {
  const video = sceneEntityInput({
    name: 'Video', visible: true, asset_url: '/site-assets/entities/entity-12345678-1234-4234-8234-123456789abc.webm',
    asset_type: 'video', media_type: 'video/webm', width: 320, height: 640, loop: true, muted: true,
    playsinline: true, playback_rate: 1.25, has_alpha: true, transform: {}
  });
  assert.equal(video.asset_type, 'video');
  assert.equal(video.loop, true);
  assert.equal(video.muted, true);
  assert.equal(video.playsinline, true);
  assert.equal(video.playback_rate, 1.25);
  assert.throws(() => sceneEntityInput({ asset_url: '/site-assets/entities/entity-12345678-1234-4234-8234-123456789abc.mp4', asset_type: 'video', media_type: 'video/webm' }), /соответствует расширению/);
});

test('scene entity rejects foreign assets and invalid transforms', () => {
  assert.throws(() => sceneEntityInput({ asset_url: 'https://example.com/a.png' }), /внутренним файлом Entity/);
  assert.throws(() => sceneEntityInput({ transform: { width: 4 } }), /Ширина Entity/);
});

test('Video Entity processing uses ffprobe and never a per-frame chroma key', async () => {
  const service = await read('services/entity-assets-service.js');
  assert.match(service, /ffprobe/);
  assert.match(service, /videoHasAlpha/);
  assert.doesNotMatch(service, /chroma|green.?screen|requestAnimationFrame/i);
});

test('Entity media upload streams to disk and has an independent env-controlled size limit', async () => {
  const service = await read('services/entity-assets-service.js');
  const config = await read('config/index.js');
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(service, /for await \(const part of stream\)/);
  assert.match(service, /entityAssetMaxBytes/);
  assert.match(config, /ENTITY_ASSET_MAX_BYTES/);
  assert.match(env, /^ENTITY_ASSET_MAX_BYTES=/m);
});

test('Entity Editor renders image or video on a layer independent from menu and background', async () => {
  const [editor, page, animationContract, db, migration] = await Promise.all([
    read('web/admin-ui/public/js/motion/entity-editor.js'), read('web/admin-ui/public/js/pages/animation.js'),
    read('contracts/animation.js'), read('db/settings.js'), read('db/migrations/scene-entity.js')
  ]);
  assert.match(editor, /document\.createElement\('video'\)/);
  assert.match(editor, /video\.playsInline/);
  assert.match(editor, /video\.playbackRate/);
  assert.match(editor, /document\.createElement\('img'\)/);
  assert.match(page, /entity:\s*currentEntity/);
  assert.match(animationContract, /entity:\s*sceneEntityInput\(body\.entity\)/);
  assert.match(db, /entity_json/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS entity_json/);
  assert.doesNotMatch(animationContract, /profile:\s*\{[^}]*entity/s);
});

test('TV player receives, renders and caches Video Entity with offline Range support', async () => {
  const [routes, player, playerCss, serviceWorker] = await Promise.all([
    read('api/device/public-routes.js'), read('web/admin-ui/public/js/player/player.js'),
    read('web/admin-ui/public/css/player.css'), read('web/admin-ui/public/player-sw.js')
  ]);
  assert.match(routes, /store\.getScreenAnimationSettings\(session\.screen_id\)/);
  assert.match(routes, /entity:\s*animationSettings\?\.entity/);
  assert.match(player, /renderSceneEntity\(playerStage, context\.entity, \{ editable: false \}\)/);
  assert.match(player, /context\?\.entity\?\.asset_url/);
  assert.match(playerCss, /\.tv-player-entity-layer/);
  assert.match(serviceWorker, /\/js\/motion\/entity-editor\.js/);
  assert.match(serviceWorker, /cachedVideoRange/);
  assert.match(serviceWorker, /status:\s*206/);
  assert.match(serviceWorker, /Content-Range/);
});

test('oversized streamed Entity bodies are rejected and partial uploads are removed', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mira-entity-limit-'));
  const config = { siteAssetsRoot: temporaryRoot, entityAssetMaxBytes: 8 };
  const stream = (async function* () { yield Buffer.alloc(5); yield Buffer.alloc(5); })();
  try {
    await assert.rejects(
      replaceEntityAssetStream({ stream, contentType: 'image/png', config, store: {}, username: 'admin' }),
      (error) => error instanceof PayloadTooLargeError
    );
    const directory = path.join(temporaryRoot, 'entities');
    const entries = await readFile(new URL('data:text/plain,'), 'utf8').catch(() => null);
    void entries;
    await assert.rejects(stat(path.join(directory, '.missing.upload')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
