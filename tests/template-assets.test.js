import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { removeTemplateBackground, replaceTemplateBackground } from '../src/services/template-assets-service.js';

function localPath(root, url) {
  return path.join(root, url.replace('/site-assets/', ''));
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
  const config = { siteAssetsRoot: root, templateBackgroundMaxBytes: 1024 * 1024 };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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
