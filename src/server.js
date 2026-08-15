import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.js';
import { MenuTvStore } from './db.js';
import { generateSftpPassword, SftpService } from './sftp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'public');
const VALID_STATUSES = new Set(['draft', 'ready']);
const SESSION_COOKIE = 'menu_tv_2_session';

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
  const error = new Error('Запись не найдена.');
  error.status = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function locationInput(body) {
  return { name: requireText(body.name, 'name'), address: optionalText(body.address, 'address'), active: body.active !== false };
}

function screenInput(body) {
  const status = body.status ?? 'draft';
  if (!VALID_STATUSES.has(status)) {
    const error = new Error('Статус может быть только «черновик», «готово» или «опубликовано».');
    error.status = 400;
    throw error;
  }
  return {
    location_id: positiveId(body.location_id, 'location_id'),
    name: requireText(body.name, 'name'),
    resolution: requireText(body.resolution ?? '1920×1080', 'resolution', { max: 32 }),
    status,
    active: body.active !== false
  };
}

function templateInput(body) {
  return { name: requireText(body.name, 'name'), description: optionalText(body.description, 'description', { max: 500 }), active: body.active !== false };
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
  return {
    display_name: requireText(body.display_name, 'display_name', { max: 80 }),
    notifications_enabled: body.notifications_enabled
  };
}

function siteSettingsInput(body) {
  const timezone = requireText(body.timezone, 'timezone', { max: 80 });
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone: timezone });
  } catch {
    const error = new Error('Укажите существующий часовой пояс в формате Europe/Moscow.');
    error.status = 400;
    throw error;
  }
  return { timezone };
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').flatMap((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [] : [[entry.slice(0, separator).trim(), decodeURIComponent(entry.slice(separator + 1).trim())]];
  }));
}

function issueSession(username, config) {
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: Math.floor(Date.now() / 1000) + config.sessionTtlHours * 3600 })).toString('base64url');
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
    return session.sub === config.adminUsername && Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}

function sessionCookie(token, config, maxAge = config.sessionTtlHours * 3600) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;
}

export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  const sftp = suppliedSftp ?? new SftpService(config.sftp);
  await store.init();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    // Alpine changes element visibility while the interface starts.
    // Its transient inline styles are required for the preloader and theme switch.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    scriptSrc: ["'self'", "'unsafe-eval'"],
    imgSrc: ["'self'", 'data:']
  } } }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', async (_request, response) => {
    await store.pool.query('SELECT 1');
    response.json({ status: 'ok', service: 'menu-tv-2.0' });
  });
  app.get('/api/public/config', (_request, response) => response.json({ app_name: config.appName }));

  app.post('/api/auth/login', async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!constantTimeEqual(username, config.adminUsername) || !constantTimeEqual(password, config.adminPassword)) {
      return response.status(401).json({ error: 'Неверный логин или пароль.' });
    }
    await store.recordActivity({
      actor_username: config.adminUsername,
      action: 'auth.login',
      entity_type: 'session',
      message: 'Выполнен вход в панель управления.'
    });
    response.setHeader('Set-Cookie', sessionCookie(issueSession(config.adminUsername, config), config));
    return response.status(204).end();
  });
  app.post('/api/auth/logout', async (request, response) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (session) {
      await store.recordActivity({
        actor_username: session.sub,
        action: 'auth.logout',
        entity_type: 'session',
        message: 'Выполнен выход из панели управления.'
      });
    }
    response.setHeader('Set-Cookie', sessionCookie('', config, 0));
    response.status(204).end();
  });

  const requirePageSession = (request, response, next) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (!session) return response.redirect(302, '/signin.html');
    request.session = session;
    return next();
  };

  app.use('/api', (request, response, next) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (!session) return response.status(401).json({ error: 'Требуется вход в систему.' });
    request.session = session;
    return next();
  });

  const activity = (request, entry) => store.recordActivity({ actor_username: request.session.sub, ...entry });

  app.get('/api/session', async (request, response) => {
    const preferences = await store.getUserPreferences(request.session.sub);
    response.json({
      status: 'ok',
      app_name: config.appName,
      username: request.session.sub,
      display_name: preferences.display_name,
      notifications_enabled: preferences.notifications_enabled
    });
  });
  app.get('/api/overview', async (_request, response) => response.json(await store.overview()));

  app.get('/api/settings/user', async (request, response) => response.json(await store.getUserPreferences(request.session.sub)));
  app.put('/api/settings/user', async (request, response) => {
    const preferences = await store.updateUserPreferences(request.session.sub, userPreferencesInput(request.body));
    await activity(request, {
      action: 'settings.user.updated',
      entity_type: 'user_preferences',
      entity_id: request.session.sub,
      message: 'Обновлены личные настройки пользователя.'
    });
    response.json(preferences);
  });
  app.get('/api/settings/site', async (_request, response) => {
    const settings = await store.getSiteSettings();
    response.json({ ...settings, app_name: config.appName, domain: config.sftp.publicHost });
  });
  app.put('/api/settings/site', async (request, response) => {
    const settings = await store.updateSiteSettings({ ...siteSettingsInput(request.body), updated_by: request.session.sub });
    await activity(request, {
      action: 'settings.site.updated',
      entity_type: 'site_settings',
      entity_id: settings.id,
      message: 'Обновлены настройки сайта.'
    });
    response.json({ ...settings, app_name: config.appName, domain: config.sftp.publicHost });
  });

  app.get('/api/notifications', async (request, response) => response.json(await store.listNotifications(request.query.limit)));
  app.post('/api/notifications/read', async (_request, response) => response.json({ marked_read: await store.markNotificationsRead() }));

  app.get('/api/locations', async (_request, response) => response.json(await store.listLocations()));
  app.post('/api/locations', async (request, response) => {
    const location = await store.createLocation(locationInput(request.body));
    await activity(request, {
      action: 'location.created',
      entity_type: 'location',
      entity_id: location.id,
      message: `Создана торговая точка «${location.name}».`
    });
    response.status(201).json(location);
  });
  app.put('/api/locations/:id', async (request, response) => {
    const record = await store.updateLocation(positiveId(request.params.id, 'id'), locationInput(request.body));
    if (!record) throw recordNotFound();
    await activity(request, {
      action: 'location.updated',
      entity_type: 'location',
      entity_id: record.id,
      message: `Обновлена торговая точка «${record.name}».`
    });
    response.json(record);
  });
  app.delete('/api/locations/:id', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id'));
    if (!location) throw recordNotFound();
    if (location.sftp_directory_id) throw conflict('Сначала явно отключите SFTP-доступ точки. Каталог и файлы останутся без изменений.');
    if (!await store.deleteLocation(location.id)) throw recordNotFound();
    await activity(request, {
      action: 'location.deleted',
      entity_type: 'location',
      entity_id: location.id,
      message: `Удалена торговая точка «${location.name}».`
    });
    response.status(204).end();
  });

  app.get('/api/screens', async (_request, response) => response.json(await store.listScreens()));
  app.post('/api/screens', async (request, response) => {
    const input = screenInput(request.body);
    if (!await store.getLocation(input.location_id)) throw recordNotFound();
    const screen = await store.createScreen(input);
    await activity(request, {
      action: 'screen.created',
      entity_type: 'screen',
      entity_id: screen.id,
      message: `Добавлен монитор «${screen.name}».`
    });
    response.status(201).json(screen);
  });
  app.put('/api/screens/:id', async (request, response) => {
    const input = screenInput(request.body);
    if (!await store.getLocation(input.location_id)) throw recordNotFound();
    const id = positiveId(request.params.id, 'id');
    const current = await store.getScreen(id);
    if (!current) throw recordNotFound();
    if (current.published_at && current.location_id !== input.location_id) {
      throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
    }
    const record = await store.updateScreen(id, input);
    if (!record) throw recordNotFound();
    await activity(request, {
      action: 'screen.updated',
      entity_type: 'screen',
      entity_id: record.id,
      message: `Обновлён монитор «${record.name}».`
    });
    response.json(record);
  });
  app.delete('/api/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen || !await store.deleteScreen(id)) throw recordNotFound();
    await activity(request, {
      action: 'screen.deleted',
      entity_type: 'screen',
      entity_id: screen.id,
      message: `Удалён монитор «${screen.name}».`
    });
    response.status(204).end();
  });

  app.get('/api/templates', async (_request, response) => response.json(await store.listTemplates()));
  app.post('/api/templates', async (request, response) => {
    const template = await store.createTemplate(templateInput(request.body));
    await activity(request, {
      action: 'template.created',
      entity_type: 'template',
      entity_id: template.id,
      message: `Создан шаблон «${template.name}».`
    });
    response.status(201).json(template);
  });
  app.put('/api/templates/:id', async (request, response) => {
    const record = await store.updateTemplate(positiveId(request.params.id, 'id'), templateInput(request.body));
    if (!record) throw recordNotFound();
    await activity(request, {
      action: 'template.updated',
      entity_type: 'template',
      entity_id: record.id,
      message: `Обновлён шаблон «${record.name}».`
    });
    response.json(record);
  });
  app.delete('/api/templates/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const template = await store.getTemplate(id);
    if (!template || !await store.deleteTemplate(id)) throw recordNotFound();
    await activity(request, {
      action: 'template.deleted',
      entity_type: 'template',
      entity_id: template.id,
      message: `Удалён шаблон «${template.name}».`
    });
    response.status(204).end();
  });

  async function sftpDirectoriesWithStatus() {
    const directories = await store.listSftpDirectories();
    return Promise.all(directories.map(async (directory) => ({
      ...directory,
      storage_status: await sftp.directoryStatus(directory.name)
    })));
  }

  app.get('/api/sftp/connection', (_request, response) => response.json({ host: config.sftp.publicHost, port: config.sftp.port }));
  app.get('/api/sftp/directories', async (_request, response) => response.json(await sftpDirectoriesWithStatus()));
  app.post('/api/sftp/directories', async (request, response) => {
    const directory = await store.createSftpDirectory(sftpDirectoryInput(request.body));
    await activity(request, {
      action: 'sftp_directory.created',
      entity_type: 'sftp_directory',
      entity_id: directory.id,
      message: `Добавлен SFTP-каталог «${directory.name}».`
    });
    response.status(201).json(directory);
  });
  app.post('/api/sftp/directories/:id/provision', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const directory = await store.getSftpDirectory(id);
    if (!directory) throw recordNotFound();
    await sftp.provisionDirectory(directory.name);
    const updated = await store.markSftpDirectoryProvisioned(id);
    await activity(request, {
      action: 'sftp_directory.provisioned',
      entity_type: 'sftp_directory',
      entity_id: updated.id,
      message: `Создан физический SFTP-каталог «${updated.name}».`
    });
    response.json({ ...updated, storage_status: await sftp.directoryStatus(updated.name) });
  });
  app.delete('/api/sftp/directories/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const directory = await store.getSftpDirectory(id);
    if (!directory || !await store.deleteSftpDirectory(id)) throw recordNotFound();
    await activity(request, {
      action: 'sftp_directory.deleted',
      entity_type: 'sftp_directory',
      entity_id: directory.id,
      message: `Удалён SFTP-каталог «${directory.name}».`
    });
    response.status(204).end();
  });

  app.post('/api/locations/:id/sftp-binding', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const input = sftpBindingInput(request.body);
    const location = await store.getLocation(locationId);
    if (!location) throw recordNotFound();
    if (location.sftp_directory_id) throw conflict('Для изменения SFTP-каталога сначала явно отключите текущую привязку.');
    const directory = await store.getSftpDirectory(input.directoryId);
    if (!directory) throw recordNotFound();
    if (directory.bound_location_id) throw conflict('Этот SFTP-каталог уже привязан к другой точке.');
    const password = generateSftpPassword();
    await sftp.createReadOnlyUser({ username: input.username, password, directoryName: directory.name });
    let bound;
    try {
      bound = await store.bindLocationSftp(locationId, input);
    } catch (error) {
      await sftp.removeUser(input.username).catch(() => undefined);
      throw error;
    }
    if (!bound) {
      await sftp.removeUser(input.username).catch(() => undefined);
      throw conflict('Точка уже получила SFTP-привязку. Обновите страницу.');
    }
    await activity(request, {
      action: 'sftp_binding.created',
      entity_type: 'location',
      entity_id: bound.id,
      message: `Для точки «${bound.name}» настроен SFTP-доступ.`
    });
    response.status(201).json({
      location: bound,
      credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: input.username, password }
    });
  });
  app.post('/api/locations/:id/sftp-password', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id'));
    if (!location) throw recordNotFound();
    if (!location.sftp_username) throw conflict('У точки нет SFTP-доступа.');
    const password = generateSftpPassword();
    await sftp.resetPassword({ username: location.sftp_username, password });
    await store.touchLocationSftpPassword(location.id);
    await activity(request, {
      action: 'sftp_password.reset',
      entity_type: 'location',
      entity_id: location.id,
      message: `Обновлён пароль SFTP для точки «${location.name}».`
    });
    response.json({ credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: location.sftp_username, password } });
  });
  app.delete('/api/locations/:id/sftp-binding', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id'));
    if (!location) throw recordNotFound();
    if (!location.sftp_username) throw conflict('У точки нет SFTP-доступа.');
    await sftp.removeUser(location.sftp_username);
    await store.unbindLocationSftp(location.id);
    await activity(request, {
      action: 'sftp_binding.deleted',
      entity_type: 'location',
      entity_id: location.id,
      message: `Отключён SFTP-доступ для точки «${location.name}».`
    });
    response.status(204).end();
  });

  app.put('/api/screens/:id/source', express.raw({ type: 'image/jpeg', limit: '12mb' }), async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id'));
    if (!screen) throw recordNotFound();
    const asset = await sftp.stageJpeg(screen.id, request.body);
    const updated = await store.savePreparedAsset(screen.id, asset);
    await activity(request, {
      action: 'screen.source_uploaded',
      entity_type: 'screen',
      entity_id: updated.id,
      message: `Загружено изображение для монитора «${updated.name}».`
    });
    response.json(updated);
  });
  app.post('/api/screens/:id/publish', async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id'));
    if (!screen) throw recordNotFound();
    if (!screen.sftp_directory_name) throw conflict('Сначала вручную привяжите SFTP-каталог к точке.');
    if (!screen.prepared_asset_key) throw conflict('Сначала загрузите подготовленный JPEG.');
    await sftp.publish({
      directoryName: screen.sftp_directory_name,
      deliveryFilename: screen.delivery_filename,
      stagedKey: screen.prepared_asset_key
    });
    const updated = await store.markScreenPublished(screen.id);
    await activity(request, {
      action: 'screen.published',
      entity_type: 'screen',
      entity_id: updated.id,
      message: `Опубликовано меню для монитора «${updated.name}».`
    });
    response.json(updated);
  });

  app.get('/', requirePageSession, (_request, _response, next) => next());
  app.get('/index.html', requirePageSession, (_request, _response, next) => next());
  app.get('/settings.html', requirePageSession, (_request, _response, next) => next());
  app.use(express.static(publicDir, {
    extensions: ['html'],
    index: 'index.html',
    etag: true,
    maxAge: 0,
    setHeaders(response) {
      response.setHeader('Cache-Control', 'no-store');
    }
  }));
  app.use((error, _request, response, _next) => {
    if (error.code === '23505') return response.status(409).json({ error: 'Запись с таким названием уже существует.' });
    if (error.code === '23503') return response.status(409).json({ error: 'Связанная запись не найдена.' });
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    return response.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера.' : error.message });
  });

  return { app, store, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createApp();
  const server = service.app.listen(service.config.port, service.config.host, () => {
    console.log(`${service.config.appName} listening on ${service.config.host}:${service.config.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => void service.store.close()));
  }
}
