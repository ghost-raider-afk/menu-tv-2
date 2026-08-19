import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { createPublishService } from '../src/services/publish-service.js';

const config = Object.freeze({ imageMaxPixels: 40000000 });

async function jpegFor(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } }
  }).jpeg({ quality: 85 }).toBuffer();
}

test('staged JPEG is bound to the exact current draft revision', async () => {
  const bytes = await jpegFor(320, 180);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  let savedRevision = null;
  const removed = [];
  const store = {
    async getScreen() { return { id: 7, resolution: '320×180', publication_pending_sha256: null, prepared_asset_key: '7-old.jpg' }; },
    async getScreenDraft() { return { revision: 12 }; },
    async savePreparedAsset(_id, asset, revision) {
      savedRevision = revision;
      return { id: 7, status: 'ready', prepared_asset_key: asset.key, prepared_asset_sha256: asset.sha256, prepared_draft_revision: revision };
    }
  };
  const sftp = {
    async stageJpeg() { return { key: '7-new.jpg', sha256, size: bytes.length }; },
    async removeStaged(key) { removed.push(key); return true; }
  };
  const service = createPublishService({ store, sftp, config });
  const screen = await service.stageJpeg(7, bytes);
  assert.equal(savedRevision, 12);
  assert.equal(screen.prepared_draft_revision, 12);
  assert.deepEqual(removed, ['7-old.jpg']);
});

test('staging race removes the new orphan when draft changed before DB commit', async () => {
  const bytes = await jpegFor(320, 180);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const removed = [];
  const store = {
    async getScreen() { return { id: 8, resolution: '320×180', publication_pending_sha256: null, prepared_asset_key: null }; },
    async getScreenDraft() { return { revision: 3 }; },
    async savePreparedAsset() { return null; }
  };
  const sftp = {
    async stageJpeg() { return { key: '8-race.jpg', sha256, size: bytes.length }; },
    async removeStaged(key) { removed.push(key); return true; }
  };
  const service = createPublishService({ store, sftp, config });
  await assert.rejects(() => service.stageJpeg(8, bytes), /Меню изменилось/);
  assert.deepEqual(removed, ['8-race.jpg']);
});

test('pending publication is recovered by target SHA without rewriting the file', async () => {
  const pending = {
    id: 9,
    sftp_directory_name: 'point-9',
    delivery_filename: 'monitor-9.jpg',
    prepared_asset_key: '9-stage.jpg',
    publication_pending_sha256: 'abc123'
  };
  let publishCalls = 0;
  let marked = 0;
  const removed = [];
  const store = {
    async getScreen() { return pending; },
    async markScreenPublished(id, sha) {
      assert.equal(id, 9);
      assert.equal(sha, 'abc123');
      marked += 1;
      return { ...pending, status: 'published', prepared_asset_key: null, publication_pending_sha256: null };
    }
  };
  const sftp = {
    async publishedInfo() { return { sha256: 'abc123', size: 100 }; },
    async publish() { publishCalls += 1; },
    async removeStaged(key) { removed.push(key); }
  };
  const service = createPublishService({ store, sftp, config });
  const result = await service.publish(9);
  assert.equal(result.status, 'published');
  assert.equal(marked, 1);
  assert.equal(publishCalls, 0);
  assert.deepEqual(removed, ['9-stage.jpg']);
});
