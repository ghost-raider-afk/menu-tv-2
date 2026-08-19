import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

const TEMPLATE_BACKGROUND_PREFIX = '/site-assets/templates/';
const SAFE_BACKGROUND = /^background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

function localPathForUrl(url, config) {
  if (typeof url !== 'string' || !url.startsWith(TEMPLATE_BACKGROUND_PREFIX)) return null;
  const filename = url.slice(TEMPLATE_BACKGROUND_PREFIX.length);
  if (!SAFE_BACKGROUND.test(filename)) return null;
  return path.join(config.siteAssetsRoot, 'templates', filename);
}

async function removeUnusedBackground(url, { store, config }) {
  const localPath = localPathForUrl(url, config);
  if (!localPath || await store.isTemplateBackgroundReferenced(url)) return;
  await unlink(localPath).catch(() => undefined);
}

export async function replaceTemplateBackground(template, bytes, { store, config }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > config.templateBackgroundMaxBytes) {
    throw new ValidationError('Размер фонового изображения шаблона недопустим.');
  }
  const info = await validateImage(bytes, {
    allowedTypes: ['png', 'jpeg', 'webp'],
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels,
    label: 'Фон шаблона'
  });
  const extension = info.type === 'jpeg' ? 'jpg' : info.type;

  const filename = `background-${crypto.randomUUID()}.${extension}`;
  const relativePath = `templates/${filename}`;
  const publicUrl = `/site-assets/${relativePath}`;
  const directory = path.join(config.siteAssetsRoot, 'templates');
  const target = path.join(directory, filename);
  const temporary = path.join(directory, `.${filename}.tmp`);
  const previousUrl = template.settings?.background_image_url || '';

  await mkdir(directory, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, target);

  let updated;
  try {
    updated = await store.updateTemplateSettings(template.id, {
      ...(template.settings || {}),
      background_image_url: publicUrl
    });
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }

  if (previousUrl && previousUrl !== publicUrl) await removeUnusedBackground(previousUrl, { store, config });
  return updated;
}

export async function removeTemplateBackground(template, { store, config }) {
  const previousUrl = template.settings?.background_image_url || '';
  const settings = { ...(template.settings || {}) };
  delete settings.background_image_url;
  const updated = await store.updateTemplateSettings(template.id, settings);
  if (previousUrl) await removeUnusedBackground(previousUrl, { store, config });
  return updated;
}

export async function cleanupTemplateBackground(template, { store, config }) {
  const url = template?.settings?.background_image_url || '';
  if (url) await removeUnusedBackground(url, { store, config });
}
