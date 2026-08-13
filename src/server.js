import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.js';
import { MenuTvStore } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'public');
const VALID_STATUSES = new Set(['draft', 'ready', 'published']);
const SESSION_COOKIE = 'menu_tv_2_session';

function requireText(value, field, { max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    const error = new Error(`${field} must contain 1–${max} characters`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalText(value, field, { max = 300 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    const error = new Error(`${field} must contain at most ${max} characters`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function positiveId(value, field) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error(`${field} must be a positive integer`);
    error.status = 400;
    throw error;
  }
  return id;
}

function recordNotFound() {
  const error = new Error('Record not found');
  error.status = 404;
  return error;
}

function locationInput(body) {
  return { name: requireText(body.name, 'name'), address: optionalText(body.address, 'address'), active: body.active !== false };
}

function screenInput(body) {
  const status = body.status ?? 'draft';
  if (!VALID_STATUSES.has(status)) {
    const error = new Error('status must be draft, ready or published');
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

export async function createApp(config = loadConfig(), { store: suppliedStore } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  await store.init();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', async (_request, response) => {
    await store.pool.query('SELECT 1');
    response.json({ status: 'ok', service: 'menu-tv-2.0' });
  });

  app.post('/api/auth/login', (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!constantTimeEqual(username, config.adminUsername) || !constantTimeEqual(password, config.adminPassword)) {
      return response.status(401).json({ error: 'Incorrect username or password' });
    }
    response.setHeader('Set-Cookie', sessionCookie(issueSession(config.adminUsername, config), config));
    return response.status(204).end();
  });
  app.post('/api/auth/logout', (_request, response) => {
    response.setHeader('Set-Cookie', sessionCookie('', config, 0));
    response.status(204).end();
  });

  app.use('/api', (request, response, next) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (!session) return response.status(401).json({ error: 'Unauthorised' });
    request.session = session;
    return next();
  });

  app.get('/api/session', (request, response) => response.json({ status: 'ok', app_name: config.appName, username: request.session.sub }));
  app.get('/api/overview', async (_request, response) => response.json(await store.overview()));

  app.get('/api/locations', async (_request, response) => response.json(await store.listLocations()));
  app.post('/api/locations', async (request, response) => response.status(201).json(await store.createLocation(locationInput(request.body))));
  app.put('/api/locations/:id', async (request, response) => {
    const record = await store.updateLocation(positiveId(request.params.id, 'id'), locationInput(request.body));
    if (!record) throw recordNotFound();
    response.json(record);
  });
  app.delete('/api/locations/:id', async (request, response) => {
    if (!await store.deleteLocation(positiveId(request.params.id, 'id'))) throw recordNotFound();
    response.status(204).end();
  });

  app.get('/api/screens', async (_request, response) => response.json(await store.listScreens()));
  app.post('/api/screens', async (request, response) => {
    const input = screenInput(request.body);
    if (!await store.getLocation(input.location_id)) throw recordNotFound();
    response.status(201).json(await store.createScreen(input));
  });
  app.put('/api/screens/:id', async (request, response) => {
    const input = screenInput(request.body);
    if (!await store.getLocation(input.location_id)) throw recordNotFound();
    const record = await store.updateScreen(positiveId(request.params.id, 'id'), input);
    if (!record) throw recordNotFound();
    response.json(record);
  });
  app.delete('/api/screens/:id', async (request, response) => {
    if (!await store.deleteScreen(positiveId(request.params.id, 'id'))) throw recordNotFound();
    response.status(204).end();
  });

  app.get('/api/templates', async (_request, response) => response.json(await store.listTemplates()));
  app.post('/api/templates', async (request, response) => response.status(201).json(await store.createTemplate(templateInput(request.body))));
  app.put('/api/templates/:id', async (request, response) => {
    const record = await store.updateTemplate(positiveId(request.params.id, 'id'), templateInput(request.body));
    if (!record) throw recordNotFound();
    response.json(record);
  });
  app.delete('/api/templates/:id', async (request, response) => {
    if (!await store.deleteTemplate(positiveId(request.params.id, 'id'))) throw recordNotFound();
    response.status(204).end();
  });

  app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html', maxAge: '1h' }));
  app.use((error, _request, response, _next) => {
    if (error.code === '23505') return response.status(409).json({ error: 'A record with this name already exists' });
    if (error.code === '23503') return response.status(409).json({ error: 'Referenced record does not exist' });
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    return response.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
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
