import crypto from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from './config.js';
import { MenuTvStore } from './db.js';
import { errorHandler } from './middleware/errors.js';
import { createLoginLimiter } from './middleware/login-limiter.js';
import { ConflictError, NotFoundError } from './shared/errors.js';
import { generateSftpPassword, SftpService } from './sftp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'admin-ui', 'public');
const VALID_STATUSES = new Set(['draft', 'ready', 'published']);
const VALID_THEMES = new Set(['system', 'light', 'dark']);
const VALID_DATE_FORMATS = new Set(['DD.MM.YYYY', 'YYYY-MM-DD']);
const SESSION_COOKIE = 'menu_tv_2_session';
const scrypt = promisify(crypto.scrypt);

function siteSettingsResponse(settings, config) {
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

async function replaceSiteImage({ kind, bytes, config, store, username }) {
  const maxBytes = kind === 'logo' ? config.siteLogoMaxBytes : config.siteFaviconMaxBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    const error = new Error(`Размер ${kind === 'logo' ? 'логотипа' : 'favicon'} недопустим.`);
    error.status = 400;
    throw error;
  }
  const extension = fileExtensionForSiteImage(kind, bytes);
  if (!extension) {
    const error = new Error(kind === 'logo' ? 'Логотип должен быть PNG, JPEG или WebP.' : 'Favicon должен быть PNG или ICO.');
    error.status = 400;
    throw error;
  }
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

function requireText(value, field, { max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    const error = new Error(`Поле «${field}» должно содержать от 1 до ${max} символов.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalText(value, field, { max = 300 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    const error = new Error(`Поле «${field}» должно содержать не более ${max} символов.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function passwordInput(value, field, config) {
  if (typeof value !== 'string' || value.length < config.passwordMinLength || value.length > config.passwordMaxLength) {
    const error = new Error(`Поле «${field}» должно содержать от ${config.passwordMinLength} до ${config.passwordMaxLength} символов.`);
    error.status = 400;
    throw error;
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    const error = new Error('Пароль должен содержать строчную и прописную латинскую букву, цифру и специальный символ.');
    error.status = 400;
    throw error;
  }
  return value;
}

function passwordChangeInput(body, config) {
  const currentPassword = passwordInput(body.current_password, 'Текущий пароль', config);
  const newPassword = passwordInput(body.new_password, 'Новый пароль', config);
  if (currentPassword === newPassword) {
    const error = new Error('Новый пароль должен отличаться от текущего.');
    error.status = 400;
    throw error;
  }
  return { currentPassword, newPassword };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, encodedSalt, encodedHash] = String(passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;
  try {
    const expected = Buffer.from(encodedHash, 'base64url');
    if (expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, Buffer.from(encodedSalt, 'base64url'), expected.length));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function positiveId(value, field) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error(`Поле «${field}» должно быть положительным целым числом.`);
    error.status = 400;
    throw error;
  }
  return id;
}

function recordNotFound() {
  return new NotFoundError();
}

function conflict(message) {
  return new ConflictError(message);
}

function locationInput(body) {
  return { name: requireText(body.name, 'name'), address: optionalText(body.address, 'address'), active: body.active !== false };
}

function resolutionInput(value, field, { maxWidth = 1920, maxHeight = 1080 } = {}) {
  const resolution = requireText(value, field, { max: 32 });
  const match = resolution.match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) {
    const error = new Error('Укажите разрешение в формате 1920×1080.');
    error.status = 400;
    throw error;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > maxWidth || height > maxHeight) {
    const error = new Error(`Максимальное разрешение — ${maxWidth}×${maxHeight}.`);
    error.status = 400;
    throw error;
  }
  return `${width}×${height}`;
}

function screenInput(body, { defaultScreenResolution = '1920×1080', maxWidth = 1920, maxHeight = 1080 } = {}) {
  const status = body.status ?? 'draft';
  if (!VALID_STATUSES.has(status)) {
    const error = new Error('Статус может быть только «черновик», «готово» или «опубликовано».');
    error.status = 400;
    throw error;
  }
  return {
    location_id: positiveId(body.location_id, 'location_id'),
    name: requireText(body.name, 'name'),
    resolution: resolutionInput(body.resolution ?? defaultScreenResolution, 'resolution', { maxWidth, maxHeight }),
    status,
    active: body.active !== false,
    template_id: body.template_id === undefined || body.template_id === null || body.template_id === '' ? null : positiveId(body.template_id, 'template_id')
  };
}

function templateInput(body) {
  return {
    name: requireText(body.name, 'name'),
    description: optionalText(body.description, 'description', { max: 500 }),
    active: body.active !== false,
    rows: Array.isArray(body.rows) ? body.rows : [],
    settings: body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : {}
  };
}

function normalisePrice(value, field, { required = true } = {}) {
  const text = optionalText(value, field, { max: 16 }).replace(',', '.');
  if (!text && !required) return '';
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) {
    const error = new Error(`Поле «${field}» должно содержать цену в формате 240 или 240.50.`);
    error.status = 400;
    throw error;
  }
  const [whole, decimal = ''] = text.split('.');
  return decimal ? `${Number.parseInt(whole, 10)}.${decimal.padEnd(2, '0')}` : String(Number.parseInt(whole, 10));
}

function priceForOneAndHalf(value) {
  const [whole, decimal = ''] = value.split('.');
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(decimal.padEnd(2, '0'), 10);
  const result = Math.round((cents * 3) / 2);
  const resultWhole = Math.floor(result / 100);
  const resultDecimal = String(result % 100).padStart(2, '0');
  return resultDecimal === '00' ? String(resultWhole) : `${resultWhole}.${resultDecimal}`;
}

function productInput(body) {
  const beverageColor = body.beverage_color ?? 'none';
  const filtration = body.filtration ?? 'none';
  if (!['none', 'light', 'dark'].includes(beverageColor) || !['none', 'filtered', 'unfiltered'].includes(filtration)) {
    const error = new Error('Выберите корректные параметры напитка.');
    error.status = 400;
    throw error;
  }
  const pricePrimary = normalisePrice(body.price_primary, 'Цена за 1 л');
  return {
    name: requireText(body.name, 'Название продукции'),
    producer: optionalText(body.producer, 'Производитель', { max: 120 }),
    characteristics: optionalText(body.characteristics, 'Характеристики', { max: 180 }),
    strength: optionalText(body.strength, 'Крепость', { max: 20 }),
    price_primary: pricePrimary,
    price_secondary: priceForOneAndHalf(pricePrimary),
    alcoholic: body.alcoholic === true,
    beverage_color: beverageColor,
    filtration,
    active: body.active !== false
  };
}

function packagingInput(body) {
  return { name: requireText(body.name, 'Название тары'), unit_price: normalisePrice(body.unit_price, 'Цена тары'), active: body.active !== false };
}

async function menuDraftInput(body, store, maxBytes = 49152) {
  if (!Array.isArray(body.rows)) {
    const error = new Error('Меню должно содержать список строк.');
    error.status = 400;
    throw error;
  }
  const products = new Map((await store.listProducts()).map((item) => [item.id, item]));
  const packaging = new Map((await store.listPackaging()).map((item) => [item.id, item]));
  const rows = body.rows.map((row, index) => {
    const kind = row?.kind;
    const id = typeof row?.id === 'string' && row.id.length <= 120 ? row.id : `row-${index + 1}`;
    if (kind === 'section') return { id, kind, name: requireText(row.name, 'Название раздела', { max: 100 }), enabled: row.enabled !== false };
    if (kind === 'item') {
      const product = products.get(positiveId(row.product_id ?? row.productId, 'Продукция'));
      if (!product || !product.active) {
        const error = new Error('Каждая позиция меню должна быть связана с активной продукцией общей базы.');
        error.status = 422;
        throw error;
      }
      if (!product.price_primary) {
        const error = new Error(`Для продукции «${product.name}» не указана обязательная цена.`);
        error.status = 422;
        throw error;
      }
      return {
        id, kind, product_id: product.id, name: product.name, characteristics: optionalText(row.characteristics, 'Подпись продукции', { max: 180 }),
        price_primary: product.price_primary, price_secondary: product.price_secondary, promotion: row.promotion === true,
        promotion_text: optionalText(row.promotion_text ?? row.promotionText, 'Текст акции', { max: 80 }), enabled: row.enabled !== false
      };
    }
    if (kind === 'packaging') {
      const item = packaging.get(positiveId(row.packaging_id ?? row.packagingId, 'Тара'));
      if (!item || !item.active) {
        const error = new Error('Каждая строка тары должна быть связана с активной тарой общей базы.');
        error.status = 422;
        throw error;
      }
      return { id, kind, packaging_id: item.id, name: item.name, unit_price: item.unit_price, enabled: row.enabled !== false };
    }
    const error = new Error('Тип строки меню не поддерживается.');
    error.status = 400;
    throw error;
  });
  const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : {};
  if (Buffer.byteLength(JSON.stringify({ rows, settings }), 'utf8') > maxBytes) {
    const error = new Error('Черновик меню слишком большой.');
    error.status = 400;
    throw error;
  }
  return { rows, settings };
}

function sftpDirectoryInput(body) {
  const name = requireText(body.name, 'name', { max: 64 });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name) || name === '.' || name === '..') {
    const error = new Error('Имя SFTP-каталога: латинские буквы, цифры, точка, дефис или подчёркивание');
    error.status = 400;
    throw error;
  }
  return { name };
}

function sftpBindingInput(body) {
  const username = requireText(body.username, 'username', { max: 32 });
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/.test(username)) {
    const error = new Error('Логин SFTP: 3–32 латинских символа, цифры, дефис или подчёркивание');
    error.status = 400;
    throw error;
  }
  return { directoryId: positiveId(body.directory_id, 'directory_id'), username };
}

function userPreferencesInput(body) {
  if (typeof body.notifications_enabled !== 'boolean') {
    const error = new Error('Поле «notifications_enabled» должно быть логическим значением.');
    error.status = 400;
    throw error;
  }
  const email = optionalText(body.email, 'email', { max: 160 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Укажите корректный e-mail.');
    error.status = 400;
    throw error;
  }
  const theme = requireText(body.theme, 'theme', { max: 16 });
  if (!VALID_THEMES.has(theme)) {
    const error = new Error('Тема интерфейса выбрана неверно.');
    error.status = 400;
    throw error;
  }
  return {
    display_name: requireText(body.display_name, 'display_name', { max: 80 }), email,
    phone: optionalText(body.phone, 'phone', { max: 40 }), job_title: optionalText(body.job_title, 'job_title', { max: 80 }),
    theme, notifications_enabled: body.notifications_enabled
  };
}

function siteSettingsInput(body, config) {
  const application_name = requireText(body.application_name, 'application_name', { max: 80 });
  const accent_color = requireText(body.accent_color, 'accent_color', { max: 7 });
  if (!/^#[0-9a-fA-F]{6}$/.test(accent_color)) {
    const error = new Error('Основной цвет должен быть в формате #2563EB.'); error.status = 400; throw error;
  }
  const timezone = requireText(body.timezone, 'timezone', { max: 80 });
  try { Intl.DateTimeFormat('ru-RU', { timeZone: timezone }); }
  catch { const error = new Error('Укажите существующий часовой пояс в формате Europe/Moscow.'); error.status = 400; throw error; }
  const date_format = requireText(body.date_format, 'date_format', { max: 16 });
  if (!VALID_DATE_FORMATS.has(date_format)) { const error = new Error('Формат даты выбран неверно.'); error.status = 400; throw error; }
  const minRefresh = config.dashboardRefreshMinSeconds ?? 15;
  const maxRefresh = config.dashboardRefreshMaxSeconds ?? 300;
  const dashboard_refresh_seconds = Number.parseInt(body.dashboard_refresh_seconds, 10);
  if (!Number.isInteger(dashboard_refresh_seconds) || dashboard_refresh_seconds < minRefresh || dashboard_refresh_seconds > maxRefresh) {
    const error = new Error(`Интервал обновления должен быть от ${minRefresh} до ${maxRefresh} секунд.`); error.status = 400; throw error;
  }
  const default_screen_resolution = resolutionInput(body.default_screen_resolution, 'default_screen_resolution', {
    maxWidth: config.screenMaxWidth ?? 1920,
    maxHeight: config.screenMaxHeight ?? 1080
  });
  return { application_name, accent_color: accent_color.toUpperCase(), timezone, date_format, dashboard_refresh_seconds, default_screen_resolution };
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left)); const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').flatMap((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [] : [[entry.slice(0, separator).trim(), decodeURIComponent(entry.slice(separator + 1).trim())]];
  }));
}

function issueSession(user, config) {
  const payload = Buffer.from(JSON.stringify({ sub: user.username, version: user.session_version, exp: Math.floor(Date.now() / 1000) + config.sessionTtlHours * 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token, config) {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof session.sub === 'string' && Number.isInteger(session.version) && session.version > 0 && Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch { return null; }
}

function sessionCookie(token, config, maxAge = config.sessionTtlHours * 3600) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

function themeCookie(theme, config, maxAge = config.sessionTtlHours * 3600) {
  const value = VALID_THEMES.has(theme) ? theme : 'system';
  return `menu_tv_theme=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  const sftp = suppliedSftp ?? new SftpService(config.sftp);
  const loginLimiter = createLoginLimiter({
    maxAttempts: config.loginMaxAttempts ?? 8,
    windowMinutes: config.loginWindowMinutes ?? 15,
    maxEntries: config.loginLimiterMaxEntries ?? 500
  });
  await store.init();
  const bootstrapAdmin = config.bootstrapAdmin ? { username: config.bootstrapAdmin.username, passwordHash: await hashPassword(config.bootstrapAdmin.password) } : null;
  await store.ensureInitialAdministrator(bootstrapAdmin || undefined);
  await store.setInitialSiteName(config.appName);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], styleSrc: ["'self'"], fontSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:']
  } } }));
  app.use(express.json({ limit: config.jsonBodyMaxBytes ?? 65536 }));

  app.get('/healthz', async (_request, response) => { await store.pool.query('SELECT 1'); response.json({ status: 'ok', service: 'menu-tv-2.0' }); });
  app.use('/site-assets', express.static(config.siteAssetsRoot, { etag: true, maxAge: '1d', immutable: true }));
  app.get('/api/public/config', async (_request, response) => {
    const settings = await store.getSiteSettings(); const site = siteSettingsResponse(settings, config);
    response.json({ app_name: site.app_name, logo_url: site.logo_url, favicon_url: site.favicon_url, accent_color: site.accent_color });
  });

  app.post('/api/auth/login', loginLimiter.middleware, async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const user = await store.getActiveUser(username);
    if (!user || !await verifyPassword(password, user.password_hash)) {
      loginLimiter.recordFailure(request);
      return response.status(401).json({ error: 'Неверный логин или пароль.' });
    }
    loginLimiter.recordSuccess(request);
    await store.recordActivity({ actor_username: user.username, action: 'auth.login', entity_type: 'session', message: 'Выполнен вход в панель управления.' });
    const preferences = await store.getUserPreferences(user.username);
    response.setHeader('Set-Cookie', [sessionCookie(issueSession(user, config), config), themeCookie(preferences.theme, config)]);
    return response.status(204).end();
  });
  app.post('/api/auth/logout', async (request, response) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (session) await store.recordActivity({ actor_username: session.sub, action: 'auth.logout', entity_type: 'session', message: 'Выполнен выход из панели управления.' });
    response.setHeader('Set-Cookie', [sessionCookie('', config, 0), themeCookie('system', config, 0)]);
    response.status(204).end();
  });

  const resolveSession = async (request) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (!session) return null;
    const user = await store.getActiveUser(session.sub);
    if (!user || user.session_version !== session.version) return null;
    return { ...session, user };
  };
  const requirePageSession = async (request, response, next) => {
    try { const session = await resolveSession(request); if (!session) return response.redirect(302, '/signin.html'); request.session = session; return next(); }
    catch (error) { return next(error); }
  };
  app.use('/api', async (request, response, next) => {
    try { const session = await resolveSession(request); if (!session) return response.status(401).json({ error: 'Требуется вход в систему.' }); request.session = session; return next(); }
    catch (error) { return next(error); }
  });
  const activity = (request, entry) => store.recordActivity({ actor_username: request.session.sub, ...entry });

  app.get('/api/session', async (request, response) => {
    const [preferences, settings] = await Promise.all([store.getUserPreferences(request.session.sub), store.getSiteSettings()]);
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config));
    response.json({ status: 'ok', app_name: settings.application_name || config.appName, username: request.session.sub, display_name: preferences.display_name, theme: preferences.theme, notifications_enabled: preferences.notifications_enabled });
  });
  app.get('/api/overview', async (_request, response) => response.json(await store.overview()));
  app.get('/api/settings/user', async (request, response) => response.json(await store.getUserPreferences(request.session.sub)));
  app.put('/api/settings/user', async (request, response) => {
    const preferences = await store.updateUserPreferences(request.session.sub, userPreferencesInput(request.body));
    await activity(request, { action: 'settings.user.updated', entity_type: 'user_preferences', entity_id: request.session.sub, message: 'Обновлены личные настройки пользователя.' });
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config)); response.json(preferences);
  });
  app.put('/api/settings/user/password', async (request, response) => {
    const { currentPassword, newPassword } = passwordChangeInput(request.body, config);
    if (!await verifyPassword(currentPassword, request.session.user.password_hash)) return response.status(400).json({ error: 'Текущий пароль введён неверно.' });
    const user = await store.updateUserPassword(request.session.sub, await hashPassword(newPassword)); if (!user) throw recordNotFound();
    const preferences = await store.getUserPreferences(user.username);
    await activity(request, { action: 'settings.user.password_updated', entity_type: 'user', entity_id: user.username, message: 'Изменён пароль пользователя.' });
    response.setHeader('Set-Cookie', [sessionCookie(issueSession(user, config), config), themeCookie(preferences.theme, config)]); response.status(204).end();
  });
  app.get('/api/settings/site', async (_request, response) => { const settings = await store.getSiteSettings(); response.json(siteSettingsResponse(settings, config)); });
  app.put('/api/settings/site', async (request, response) => {
    const settings = await store.updateSiteSettings({ ...siteSettingsInput(request.body, config), updated_by: request.session.sub });
    await activity(request, { action: 'settings.site.updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлены настройки сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });
  app.put('/api/settings/site/logo', express.raw({ type: '*/*', limit: config.siteLogoMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'logo', bytes: request.body, config, store, username: request.session.sub });
    await activity(request, { action: 'settings.site.logo_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён логотип сайта.' }); response.json(siteSettingsResponse(settings, config));
  });
  app.put('/api/settings/site/favicon', express.raw({ type: '*/*', limit: config.siteFaviconMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'favicon', bytes: request.body, config, store, username: request.session.sub });
    await activity(request, { action: 'settings.site.favicon_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён favicon сайта.' }); response.json(siteSettingsResponse(settings, config));
  });

  app.get('/api/notifications', async (request, response) => response.json(await store.listNotifications(request.query.limit)));
  app.post('/api/notifications/read', async (_request, response) => response.json({ marked_read: await store.markNotificationsRead() }));

  app.get('/api/catalog/products', async (_request, response) => response.json(await store.listProducts()));
  app.post('/api/catalog/products', async (request, response) => { const product = await store.createProduct(productInput(request.body)); await activity(request, { action: 'catalog.product.created', entity_type: 'catalog_product', entity_id: product.id, message: `Добавлена продукция «${product.name}».` }); response.status(201).json(product); });
  app.put('/api/catalog/products/:id', async (request, response) => { const product = await store.updateProduct(positiveId(request.params.id, 'id'), productInput(request.body)); if (!product) throw recordNotFound(); await activity(request, { action: 'catalog.product.updated', entity_type: 'catalog_product', entity_id: product.id, message: `Обновлена продукция «${product.name}».` }); response.json(product); });
  app.delete('/api/catalog/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id'); const product = await store.getProduct(id); if (!product) throw recordNotFound(); const affected = await store.screensUsingCatalog('product', id);
    if (affected.length) { const error = conflict('Продукция используется в меню мониторов и не может быть удалена.'); error.details = affected; throw error; }
    await store.deleteProduct(id); await activity(request, { action: 'catalog.product.deleted', entity_type: 'catalog_product', entity_id: id, message: `Удалена продукция «${product.name}».` }); response.status(204).end();
  });
  app.get('/api/catalog/packaging', async (_request, response) => response.json(await store.listPackaging()));
  app.post('/api/catalog/packaging', async (request, response) => { const packaging = await store.createPackaging(packagingInput(request.body)); await activity(request, { action: 'catalog.packaging.created', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Добавлена тара «${packaging.name}».` }); response.status(201).json(packaging); });
  app.put('/api/catalog/packaging/:id', async (request, response) => { const packaging = await store.updatePackaging(positiveId(request.params.id, 'id'), packagingInput(request.body)); if (!packaging) throw recordNotFound(); await activity(request, { action: 'catalog.packaging.updated', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Обновлена тара «${packaging.name}».` }); response.json(packaging); });
  app.delete('/api/catalog/packaging/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id'); const packaging = await store.getPackaging(id); if (!packaging) throw recordNotFound(); const affected = await store.screensUsingCatalog('packaging', id);
    if (affected.length) { const error = conflict('Тара используется в меню мониторов и не может быть удалена.'); error.details = affected; throw error; }
    await store.deletePackaging(id); await activity(request, { action: 'catalog.packaging.deleted', entity_type: 'catalog_packaging', entity_id: id, message: `Удалена тара «${packaging.name}».` }); response.status(204).end();
  });

  app.get('/api/locations', async (_request, response) => response.json(await store.listLocations()));
  app.post('/api/locations', async (request, response) => { const location = await store.createLocation(locationInput(request.body)); await activity(request, { action: 'location.created', entity_type: 'location', entity_id: location.id, message: `Создана торговая точка «${location.name}».` }); response.status(201).json(location); });
  app.put('/api/locations/:id', async (request, response) => { const record = await store.updateLocation(positiveId(request.params.id, 'id'), locationInput(request.body)); if (!record) throw recordNotFound(); await activity(request, { action: 'location.updated', entity_type: 'location', entity_id: record.id, message: `Обновлена торговая точка «${record.name}».` }); response.json(record); });
  app.delete('/api/locations/:id', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id')); if (!location) throw recordNotFound(); if (location.sftp_directory_id) throw conflict('Сначала явно отключите SFTP-доступ точки. Каталог и файлы останутся без изменений.'); if (!await store.deleteLocation(location.id)) throw recordNotFound();
    await activity(request, { action: 'location.deleted', entity_type: 'location', entity_id: location.id, message: `Удалена торговая точка «${location.name}».` }); response.status(204).end();
  });

  app.get('/api/screens', async (_request, response) => response.json(await store.listScreens()));
  app.get('/api/screens/:id', async (request, response) => { const screen = await store.getScreen(positiveId(request.params.id, 'id')); if (!screen) throw recordNotFound(); response.json(screen); });
  app.get('/api/screens/:id/editor', async (request, response) => {
    const id = positiveId(request.params.id, 'id'); const screen = await store.getScreen(id); if (!screen) throw recordNotFound();
    const [draft, products, packaging, templates] = await Promise.all([store.getScreenDraft(id), store.listProducts(), store.listPackaging(), store.listTemplates()]); response.json({ screen, draft, products, packaging, templates });
  });
  app.put('/api/screens/:id/draft', async (request, response) => {
    const id = positiveId(request.params.id, 'id'); const screen = await store.getScreen(id); if (!screen) throw recordNotFound(); const draft = await menuDraftInput(request.body, store, config.menuDraftMaxBytes ?? 49152);
    const templateId = request.body.template_id === undefined ? screen.template_id : request.body.template_id === null || request.body.template_id === '' ? null : positiveId(request.body.template_id, 'template_id');
    if (templateId && !await store.getTemplate(templateId)) throw recordNotFound();
    const updatedScreen = await store.updateScreen(id, { location_id: screen.location_id, name: screen.name, resolution: screen.resolution, status: screen.status, active: screen.active, template_id: templateId });
    const saved = await store.saveScreenDraft(id, draft); await activity(request, { action: 'screen.draft.saved', entity_type: 'screen', entity_id: id, message: `Сохранён черновик меню монитора «${screen.name}».` }); response.json({ screen: updatedScreen, draft: saved });
  });
  app.post('/api/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id'); const location = await store.getLocation(locationId); if (!location) throw recordNotFound(); const siteSettings = await store.getSiteSettings();
    const screen = await store.createScreen({ location_id: locationId, name: await store.nextScreenName(locationId), resolution: siteSettings.default_screen_resolution, status: 'draft', active: true, template_id: null });
    await activity(request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}» в точке «${location.name}».` }); response.status(201).json(screen);
  });
  app.post('/api/screens', async (request, response) => {
    const siteSettings = await store.getSiteSettings(); const input = screenInput(request.body, { defaultScreenResolution: siteSettings.default_screen_resolution, maxWidth: config.screenMaxWidth ?? 1920, maxHeight: config.screenMaxHeight ?? 1080 });
    if (!await store.getLocation(input.location_id)) throw recordNotFound(); if (input.template_id && !await store.getTemplate(input.template_id)) throw recordNotFound(); const screen = await store.createScreen(input);
    await activity(request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}».` }); response.status(201).json(screen);
  });
  app.put('/api/screens/:id', async (request, response) => {
    const siteSettings = await store.getSiteSettings(); const input = screenInput(request.body, { defaultScreenResolution: siteSettings.default_screen_resolution, maxWidth: config.screenMaxWidth ?? 1920, maxHeight: config.screenMaxHeight ?? 1080 });
    if (!await store.getLocation(input.location_id)) throw recordNotFound(); if (input.template_id && !await store.getTemplate(input.template_id)) throw recordNotFound(); const id = positiveId(request.params.id, 'id'); const current = await store.getScreen(id); if (!current) throw recordNotFound();
    if (current.published_at && current.location_id !== input.location_id) throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
    const record = await store.updateScreen(id, input); if (!record) throw recordNotFound(); await activity(request, { action: 'screen.updated', entity_type: 'screen', entity_id: record.id, message: `Обновлён монитор «${record.name}».` }); response.json(record);
  });
  app.delete('/api/screens/:id', async (request, response) => { const id = positiveId(request.params.id, 'id'); const screen = await store.getScreen(id); if (!screen || !await store.deleteScreen(id)) throw recordNotFound(); await activity(request, { action: 'screen.deleted', entity_type: 'screen', entity_id: screen.id, message: `Удалён монитор «${screen.name}».` }); response.status(204).end(); });

  app.get('/api/templates', async (_request, response) => response.json(await store.listTemplates()));
  app.post('/api/templates', async (request, response) => { const template = await store.createTemplate(templateInput(request.body)); await activity(request, { action: 'template.created', entity_type: 'template', entity_id: template.id, message: `Создан шаблон «${template.name}».` }); response.status(201).json(template); });
  app.put('/api/templates/:id', async (request, response) => { const record = await store.updateTemplate(positiveId(request.params.id, 'id'), templateInput(request.body)); if (!record) throw recordNotFound(); await activity(request, { action: 'template.updated', entity_type: 'template', entity_id: record.id, message: `Обновлён шаблон «${record.name}».` }); response.json(record); });
  app.delete('/api/templates/:id', async (request, response) => { const id = positiveId(request.params.id, 'id'); const template = await store.getTemplate(id); if (!template || !await store.deleteTemplate(id)) throw recordNotFound(); await activity(request, { action: 'template.deleted', entity_type: 'template', entity_id: template.id, message: `Удалён шаблон «${template.name}».` }); response.status(204).end(); });

  async function sftpDirectoriesWithStatus() { const directories = await store.listSftpDirectories(); return Promise.all(directories.map(async (directory) => ({ ...directory, storage_status: await sftp.directoryStatus(directory.name) }))); }
  app.get('/api/sftp/connection', (_request, response) => response.json({ host: config.sftp.publicHost, port: config.sftp.port }));
  app.get('/api/sftp/directories', async (_request, response) => response.json(await sftpDirectoriesWithStatus()));
  app.post('/api/sftp/directories', async (request, response) => { const directory = await store.createSftpDirectory(sftpDirectoryInput(request.body)); await activity(request, { action: 'sftp_directory.created', entity_type: 'sftp_directory', entity_id: directory.id, message: `Добавлен SFTP-каталог «${directory.name}».` }); response.status(201).json(directory); });
  app.post('/api/sftp/directories/:id/provision', async (request, response) => { const id = positiveId(request.params.id, 'id'); const directory = await store.getSftpDirectory(id); if (!directory) throw recordNotFound(); await sftp.provisionDirectory(directory.name); const updated = await store.markSftpDirectoryProvisioned(id); await activity(request, { action: 'sftp_directory.provisioned', entity_type: 'sftp_directory', entity_id: updated.id, message: `Создан физический SFTP-каталог «${updated.name}».` }); response.json({ ...updated, storage_status: await sftp.directoryStatus(updated.name) }); });
  app.delete('/api/sftp/directories/:id', async (request, response) => { const id = positiveId(request.params.id, 'id'); const directory = await store.getSftpDirectory(id); if (!directory || !await store.deleteSftpDirectory(id)) throw recordNotFound(); await activity(request, { action: 'sftp_directory.deleted', entity_type: 'sftp_directory', entity_id: directory.id, message: `Удалён SFTP-каталог «${directory.name}».` }); response.status(204).end(); });

  app.post('/api/locations/:id/sftp-binding', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id'); const input = sftpBindingInput(request.body); const location = await store.getLocation(locationId); if (!location) throw recordNotFound(); if (location.sftp_directory_id) throw conflict('Для изменения SFTP-каталога сначала явно отключите текущую привязку.');
    const directory = await store.getSftpDirectory(input.directoryId); if (!directory) throw recordNotFound(); if (directory.bound_location_id) throw conflict('Этот SFTP-каталог уже привязан к другой точке.');
    const password = generateSftpPassword(config.generatedPasswordLength ?? 10); await sftp.createReadOnlyUser({ username: input.username, password, directoryName: directory.name }); let bound;
    try { bound = await store.bindLocationSftp(locationId, input); } catch (error) { await sftp.removeUser(input.username).catch(() => undefined); throw error; }
    if (!bound) { await sftp.removeUser(input.username).catch(() => undefined); throw conflict('Точка уже получила SFTP-привязку. Обновите страницу.'); }
    await activity(request, { action: 'sftp_binding.created', entity_type: 'location', entity_id: bound.id, message: `Для точки «${bound.name}» настроен SFTP-доступ.` });
    response.status(201).json({ location: bound, credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: input.username, password } });
  });
  app.post('/api/locations/:id/sftp-password', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id')); if (!location) throw recordNotFound(); if (!location.sftp_username) throw conflict('У точки нет SFTP-доступа.');
    const password = generateSftpPassword(config.generatedPasswordLength ?? 10); await sftp.resetPassword({ username: location.sftp_username, password }); await store.touchLocationSftpPassword(location.id);
    await activity(request, { action: 'sftp_password.reset', entity_type: 'location', entity_id: location.id, message: `Обновлён пароль SFTP для точки «${location.name}».` }); response.json({ credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: location.sftp_username, password } });
  });
  app.delete('/api/locations/:id/sftp-binding', async (request, response) => { const location = await store.getLocation(positiveId(request.params.id, 'id')); if (!location) throw recordNotFound(); if (!location.sftp_username) throw conflict('У точки нет SFTP-доступа.'); await sftp.removeUser(location.sftp_username); await store.unbindLocationSftp(location.id); await activity(request, { action: 'sftp_binding.deleted', entity_type: 'location', entity_id: location.id, message: `Отключён SFTP-доступ для точки «${location.name}».` }); response.status(204).end(); });

  app.put('/api/screens/:id/source', express.raw({ type: 'image/jpeg', limit: config.screenSourceMaxBytes ?? 12582912 }), async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id')); if (!screen) throw recordNotFound(); const asset = await sftp.stageJpeg(screen.id, request.body); const updated = await store.savePreparedAsset(screen.id, asset);
    await activity(request, { action: 'screen.source_uploaded', entity_type: 'screen', entity_id: updated.id, message: `Загружено изображение для монитора «${updated.name}».` }); response.json(updated);
  });
  app.post('/api/screens/:id/publish', async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id')); if (!screen) throw recordNotFound(); if (!screen.sftp_directory_name) throw conflict('Сначала вручную привяжите SFTP-каталог к точке.'); if (!screen.prepared_asset_key) throw conflict('Сначала загрузите подготовленный JPEG.');
    await sftp.publish({ directoryName: screen.sftp_directory_name, deliveryFilename: screen.delivery_filename, stagedKey: screen.prepared_asset_key }); const updated = await store.markScreenPublished(screen.id);
    await activity(request, { action: 'screen.published', entity_type: 'screen', entity_id: updated.id, message: `Опубликовано меню для монитора «${updated.name}».` }); response.json(updated);
  });

  app.get('/', requirePageSession, (_request, _response, next) => next());
  app.get('/index.html', requirePageSession, (_request, _response, next) => next());
  app.get('/locations.html', requirePageSession, (_request, _response, next) => next());
  app.get('/screens.html', requirePageSession, (_request, _response, next) => next());
  app.get('/catalog.html', requirePageSession, (_request, _response, next) => next());
  app.get('/screen-editor.html', requirePageSession, (_request, _response, next) => next());
  app.get('/templates.html', requirePageSession, (_request, _response, next) => next());
  app.get('/profile.html', requirePageSession, (_request, _response, next) => next());
  app.get('/settings.html', requirePageSession, (_request, _response, next) => next());
  app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html', etag: true, maxAge: 0, setHeaders(response) { response.setHeader('Cache-Control', 'no-store'); } }));
  app.use(errorHandler);
  return { app, store, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createApp();
  const server = service.app.listen(service.config.port, service.config.host, () => { console.log(`${service.config.appName} listening on ${service.config.host}:${service.config.port}`); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => void service.store.close()));
}
