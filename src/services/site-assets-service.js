import crypto from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';

export function siteSettingsResponse(settings, config) {
  const version = encodeURIComponent(settings.updated_at || '0');
  return {
    ...settings,
    app_name: settings.application_name || config.appName,
    domain: config.sftp.publicHost,
    session_ttl_hours: config.sessionTtlHours,
    sftp_port: config.sftp.port,
    logo_url: settings.logo_filename ? `/site-assets/${settings.logo_filename}?v=${version}` : '',
    favicon_url: settings.favicon_filename ? `/site-assets/${settings.favicon_filename}?v=${version}` : ''
  };
}

function fileExtensionForSiteImage(kind, bytes) {
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const isIco = bytes.length > 4 && bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]));
  if (kind === 'logo') return isPng ? 'png' : isJpeg ? 'jpg' : isWebp ? 'webp' : null;
  return isPng ? 'png' : isIco ? 'ico' : null;
}

export async function replaceSiteImage({ kind, bytes, config, store, username }) {
  const maxBytes = kind === 'logo' ? config.siteLogoMaxBytes : config.siteFaviconMaxBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new ValidationError(`Размер ${kind === 'logo' ? 'логотипа' : 'favicon'} недопустим.`);
  }
  const extension = fileExtensionForSiteImage(kind, bytes);
  if (!extension) throw new ValidationError(kind === 'logo' ? 'Логотип должен быть PNG, JPEG или WebP.' : 'Favicon должен быть PNG или ICO.');
  const filename = `site-${kind}.${extension}`;
  const temporary = `${config.siteAssetsRoot}/.${filename}.${crypto.randomUUID()}.tmp`;
  await mkdir(config.siteAssetsRoot, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, `${config.siteAssetsRoot}/${filename}`);
  const previous = await store.getSiteSettings();
  const updated = await store.setSiteAsset(kind, filename, username);
  const previousFilename = kind === 'logo' ? previous.logo_filename : previous.favicon_filename;
  if (previousFilename && previousFilename !== filename) await unlink(`${config.siteAssetsRoot}/${previousFilename}`).catch(() => undefined);
  return updated;
}
