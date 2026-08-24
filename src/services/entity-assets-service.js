import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { sceneEntityInput } from '../contracts/scene-entity.js';
import { validateImage } from './image-validation.js';

const ENTITY_DIR = 'entities';
const SAFE_ENTITY_ASSET = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp)$/i;

function assetFileFromUrl(url) {
  if (typeof url !== 'string' || !SAFE_ENTITY_ASSET.test(url)) return '';
  return path.basename(url);
}

export async function replaceEntityAsset({ bytes, config, store, username }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > config.screenBackgroundMaxBytes) {
    throw new ValidationError('Размер изображения объекта недопустим.');
  }

  const info = await validateImage(bytes, {
    allowedTypes: ['png', 'webp'],
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels,
    label: 'Объект сцены'
  });

  const filename = `entity-${crypto.randomUUID()}.${info.type}`;
  const directory = path.join(config.siteAssetsRoot, ENTITY_DIR);
  const target = path.join(directory, filename);
  const temporary = path.join(directory, `.${filename}.tmp`);

  await mkdir(directory, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, target);

  const current = await store.getAnimationSettings();
  const previousFile = assetFileFromUrl(current?.entity?.asset_url);
  const entity = sceneEntityInput({
    ...(current?.entity || {}),
    asset_url: `/site-assets/${ENTITY_DIR}/${filename}`,
    asset_width: info.width,
    asset_height: info.height,
    visible: true
  });

  let updated;
  try {
    updated = await store.updateAnimationEntity(entity, username);
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }

  if (previousFile && previousFile !== filename) {
    await unlink(path.join(directory, previousFile)).catch(() => undefined);
  }

  return updated;
}
