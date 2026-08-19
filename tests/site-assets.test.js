import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { replaceSiteImage } from '../src/services/site-assets-service.js';

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 4, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function config(root) {
  return {
    siteAssetsRoot: root,
    siteLogoMaxBytes: 1024 * 1024,
    siteFaviconMaxBytes: 512 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080
  };
}

test('failed database update removes only the new site asset and keeps the previous file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-site-assets-'));
  const oldFile = path.join(root, 'site-logo.png');
  await writeFile(oldFile, pngHeader(100, 50));
  const store = {
    async getSiteSettings() { return { logo_filename: 'site-logo.png', favicon_filename: '' }; },
    async setSiteAsset() { throw new Error('database unavailable'); }
  };
  try {
    await assert.rejects(
      replaceSiteImage({ kind: 'logo', bytes: pngHeader(640, 360), config: config(root), store, username: 'admin' }),
      /database unavailable/
    );
    await access(oldFile);
    assert.deepEqual((await readdir(root)).sort(), ['site-logo.png']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('successful site asset update switches to a unique file then removes the previous asset', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-site-assets-'));
  const oldFile = path.join(root, 'site-logo.png');
  await writeFile(oldFile, pngHeader(100, 50));
  let savedFilename = '';
  const store = {
    async getSiteSettings() { return { logo_filename: 'site-logo.png', favicon_filename: '' }; },
    async setSiteAsset(_kind, filename) {
      savedFilename = filename;
      return { id: 1, logo_filename: filename, favicon_filename: '', updated_at: new Date().toISOString() };
    }
  };
  try {
    const result = await replaceSiteImage({ kind: 'logo', bytes: pngHeader(640, 360), config: config(root), store, username: 'admin' });
    assert.equal(result.logo_filename, savedFilename);
    assert.match(savedFilename, /^site-logo-[0-9a-f-]{36}\.png$/i);
    await access(path.join(root, savedFilename));
    await assert.rejects(access(oldFile));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
