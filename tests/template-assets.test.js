import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { removeTemplateBackground, replaceTemplateBackground } from '../src/services/template-assets-service.js';

function localPath(root, url) {
  return path.join(root, url.replace('/site-assets/', ''));
}

function jpegFor(width, height) {
  const bytes = Buffer.alloc(17);
  let offset = 0;
  bytes[offset++] = 0xff; bytes[offset++] = 0xd8;
  bytes[offset++] = 0xff; bytes[offset++] = 0xc0;
  bytes.writeUInt16BE(11, offset); offset += 2;
  bytes[offset++] = 8;
  bytes.writeUInt16BE(height, offset); offset += 2;
  bytes.writeUInt16BE(width, offset); offset += 2;
  bytes[offset++] = 1; bytes[offset++] = 1; bytes[offset++] = 0x11; bytes[offset++] = 0;
  bytes[offset++] = 0xff; bytes[offset++] = 0xd9;
  return bytes;
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 4, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('template background replacement preserves assets referenced by saved screen drafts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'menu-tv-template-assets-'));
  let template = { id: 7, name: 'Основной', settings: {} };
  let draftBackgroundUrl = '';
  const store = {
    async updateTemplateSettings(id, settings) {
      assert.equal(id, template.id);
      template = { ...template, settings: { ...settings } };
      return structuredClone(template);
    },
    async isTemplateBackgroundReferenced(url) {
      return template.settings?.background_image_url === url || draftBackgroundUrl === url;
    }
  };
  const config = {
    siteAssetsRoot: root,
    templateBackgroundMaxBytes: 1024 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080
  };
  const jpeg = jpegFor(1920, 1080);
  const png = pngHeader(1280, 720);

  try {
    template = await replaceTemplateBackground(template, jpeg, { store, config });
    const firstUrl = template.settings.background_image_url;
    assert.match(firstUrl, /^\/site-assets\/templates\/background-[0-9a-f-]{36}\.jpg$/i);
    await access(localPath(root, firstUrl));

    draftBackgroundUrl = firstUrl;
    template = await replaceTemplateBackground(template, png, { store, config });
    const secondUrl = template.settings.background_image_url;
    assert.notEqual(secondUrl, firstUrl);
    await access(localPath(root, firstUrl));
    await access(localPath(root, secondUrl));

    template = await removeTemplateBackground(template, { store, config });
    assert.equal(template.settings.background_image_url, undefined);
    await assert.rejects(access(localPath(root, secondUrl)));
    await access(localPath(root, firstUrl));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
