import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { removeTemplateBackground, replaceTemplateBackground } from '../src/services/template-assets-service.js';

function localPath(root, url) {
  return path.join(root, url.replace('/site-assets/', ''));
}

async function jpegFor(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } } }).jpeg({ quality: 85 }).toBuffer();
}

async function pngFor(width, height) {
  return sharp({ create: { width, height, channels: 4, background: { r: 45, g: 55, b: 65, alpha: 1 } } }).png().toBuffer();
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
    templateBackgroundMaxBytes: 2 * 1024 * 1024,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080,
    imageMaxPixels: 40_000_000
  };
  const jpeg = await jpegFor(1920, 1080);
  const png = await pngFor(1280, 720);

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
