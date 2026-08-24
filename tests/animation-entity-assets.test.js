import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {
  animationEntityFilename,
  isAnimationEntityAssetUrl,
  removeAnimationEntityAsset,
  writeAnimationEntityAsset
} from '../src/services/animation-entity-assets-service.js';

function config(root) {
  return {
    siteAssetsRoot: root,
    screenBackgroundMaxBytes: 20 * 1024 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080,
    imageMaxPixels: 40_000_000
  };
}

test('transparent PNG is stored as an isolated safe animation entity asset and can be removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-entity-'));
  try {
    const bytes = await sharp({
      create: { width: 96, height: 144, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([{ input: Buffer.from('<svg width="96" height="144"><rect x="24" y="8" width="48" height="128" rx="12" fill="#f6c90e"/></svg>'), top: 0, left: 0 }]).png().toBuffer();

    const asset = await writeAnimationEntityAsset({ bytes, config: config(root) });
    assert.match(asset.url, /^\/site-assets\/animation-entity-[0-9a-f-]{36}\.png$/i);
    assert.equal(asset.width, 96);
    assert.equal(asset.height, 144);
    assert.equal(isAnimationEntityAssetUrl(asset.url), true);
    assert.equal(animationEntityFilename(asset.url), asset.filename);
    assert.deepEqual(await readFile(path.join(root, asset.filename)), bytes);

    assert.equal(await removeAnimationEntityAsset({ assetUrl: asset.url, config: config(root) }), true);
    await assert.rejects(() => access(path.join(root, asset.filename)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('opaque images and unsafe entity paths are rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-entity-'));
  try {
    const opaque = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 246, g: 201, b: 14, alpha: 1 } }
    }).png().toBuffer();
    await assert.rejects(
      () => writeAnimationEntityAsset({ bytes: opaque, config: config(root) }),
      /реальным прозрачным фоном/
    );
    assert.equal(isAnimationEntityAssetUrl('/site-assets/../../etc/passwd'), false);
    assert.equal(animationEntityFilename('https://evil.test/entity.png'), '');
    assert.equal(await removeAnimationEntityAsset({ assetUrl: '/site-assets/../../etc/passwd', config: config(root) }), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
