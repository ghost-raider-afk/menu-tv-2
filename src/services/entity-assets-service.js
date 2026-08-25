import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { sceneEntityInput } from '../contracts/scene-entity.js';
import { validateImage } from './image-validation.js';

const execFileAsync = promisify(execFile);
const ENTITY_DIR = 'entities';
const SAFE_ENTITY_ASSET = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp|mp4|webm)$/i;
const MEDIA = Object.freeze({
  'image/png': { kind: 'image', extension: 'png' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/webm': { kind: 'video', extension: 'webm' }
});

function assetFileFromUrl(url) {
  if (typeof url !== 'string' || !SAFE_ENTITY_ASSET.test(url)) return '';
  return path.basename(url);
}

function normalizedContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function videoHasAlpha(stream = {}) {
  const pixelFormat = String(stream.pix_fmt || '').toLowerCase();
  if (/^(?:yuva|gbrap|rgba|bgra|argb|abgr)/.test(pixelFormat)) return true;
  const tags = stream.tags && typeof stream.tags === 'object' ? stream.tags : {};
  return Object.entries(tags).some(([key, value]) => /alpha/i.test(key) && /^(?:1|true|yes)$/i.test(String(value)));
}

async function inspectVideo(file, config) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,pix_fmt,codec_name:stream_tags',
      '-of', 'json', file
    ], { timeout: 12000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new ValidationError('Видео Entity не удалось прочитать через ffprobe. Проверьте MP4/WebM файл.');
  }
  let stream;
  try { stream = JSON.parse(stdout)?.streams?.[0]; } catch {}
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ValidationError('Видео Entity не содержит корректного видеопотока.');
  if (width > config.screenMaxWidth || height > config.screenMaxHeight || width * height > config.imageMaxPixels) {
    throw new ValidationError(`Видео Entity превышает допустимое разрешение ${config.screenMaxWidth}×${config.screenMaxHeight}.`);
  }
  return { width, height, hasAlpha: videoHasAlpha(stream), codec: String(stream.codec_name || '') };
}

export async function replaceEntityAsset({ bytes, contentType, config, store, username }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > config.screenBackgroundMaxBytes) throw new ValidationError('Размер медиафайла Entity недопустим.');
  const mime = normalizedContentType(contentType);
  const media = MEDIA[mime];
  if (!media) throw new ValidationError('Entity поддерживает PNG, WebP, MP4 и WebM.');

  const filename = `entity-${crypto.randomUUID()}.${media.extension}`;
  const directory = path.join(config.siteAssetsRoot, ENTITY_DIR);
  const target = path.join(directory, filename);
  const temporary = path.join(directory, `.${filename}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });

  let info;
  try {
    if (media.kind === 'image') {
      const image = await validateImage(bytes, {
        allowedTypes: ['png', 'webp'], maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight,
        maxPixels: config.imageMaxPixels, label: 'Entity'
      });
      if (`image/${image.type}` !== mime) throw new ValidationError('MIME-тип Entity не соответствует содержимому файла.');
      info = { width: image.width, height: image.height, hasAlpha: image.type === 'png' || image.type === 'webp' };
    } else {
      info = await inspectVideo(temporary, config);
    }
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  const current = await store.getAnimationSettings();
  const previousFile = assetFileFromUrl(current?.entity?.asset_url);
  const entity = sceneEntityInput({
    ...(current?.entity || {}),
    asset_url: `/site-assets/${ENTITY_DIR}/${filename}`,
    asset_type: media.kind,
    media_type: mime,
    width: info.width,
    height: info.height,
    has_alpha: info.hasAlpha,
    loop: current?.entity?.loop ?? true,
    muted: current?.entity?.muted ?? true,
    playsinline: current?.entity?.playsinline ?? true,
    playback_rate: current?.entity?.playback_rate ?? 1,
    poster_url: '',
    visible: true
  });

  let updated;
  try { updated = await store.updateAnimationEntity(entity, username); }
  catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
  if (previousFile && previousFile !== filename) await unlink(path.join(directory, previousFile)).catch(() => undefined);
  return updated;
}
