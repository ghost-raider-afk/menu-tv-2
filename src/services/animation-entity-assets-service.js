import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

const ENTITY_FILENAME = /^animation-entity-[0-9a-f-]{36}\.(?:png|webp)$/i;
const ENTITY_URL = /^\/site-assets\/(animation-entity-[0-9a-f-]{36}\.(?:png|webp))$/i;

export function animationEntityFilename(assetUrl) {
  const match = String(assetUrl || '').trim().match(ENTITY_URL);
  return match ? match[1] : '';
}

export function isAnimationEntityAssetUrl(assetUrl) {
  return Boolean(animationEntityFilename(assetUrl));
}

async function hasVisibleTransparency(bytes, maxPixels) {
  const alpha = await sharp(bytes, { failOn: 'error', limitInputPixels: maxPixels, sequentialRead: true })
    .ensureAlpha()
    .extractChannel(3)
    .stats();
  return Number(alpha?.channels?.[0]?.min) < 255;
}

export async function writeAnimationEntityAsset({ bytes, config }) {
  const maxBytes = config.screenBackgroundMaxBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new ValidationError('Размер изображения живого объекта недопустим.');
  }

  const info = await validateImage(bytes, {
    allowedTypes: ['png', 'webp'],
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels,
    label: 'Живой объект'
  });
  if (!info.hasAlpha || !await hasVisibleTransparency(bytes, config.imageMaxPixels)) {
    throw new ValidationError('Живой объект должен быть PNG/WebP с реальным прозрачным фоном.');
  }

  const filename = `animation-entity-${crypto.randomUUID()}.${info.type}`;
  if (!ENTITY_FILENAME.test(filename)) throw new Error('Не удалось сформировать безопасное имя Entity asset.');
  const target = path.join(config.siteAssetsRoot, filename);
  const temporary = path.join(config.siteAssetsRoot, `.${filename}.tmp`);
  await mkdir(config.siteAssetsRoot, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, target);

  return Object.freeze({
    filename,
    url: `/site-assets/${filename}`,
    type: info.type,
    width: info.width,
    height: info.height
  });
}

export async function removeAnimationEntityAsset({ assetUrl, config }) {
  const filename = animationEntityFilename(assetUrl);
  if (!filename || !ENTITY_FILENAME.test(filename)) return false;
  await unlink(path.join(config.siteAssetsRoot, filename)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  return true;
}
