import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { MenuTvStore } from './db.js';
import { errorHandler } from './middleware/errors.js';
import { createSessionMiddleware } from './middleware/session.js';
import { hashPassword } from './services/password-service.js';
import { createSessionResolver } from './services/session-service.js';
import { siteSettingsResponse } from './services/site-assets-service.js';
import { SftpService } from './sftp.js';
import { createAuthRouter } from './api/auth/routes.js';
import { createSessionRouter } from './api/session/routes.js';
import { createSettingsRouter } from './api/settings/routes.js';
import { createNotificationsRouter } from './api/notifications/routes.js';
import { createCatalogRouter } from './api/catalog/routes.js';
import { createLocationsRouter } from './api/locations/routes.js';
import { createScreensRouter } from './api/screens/routes.js';
import { createTemplatesRouter } from './api/templates/routes.js';
import { createSftpRouter } from './api/sftp/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'admin-ui', 'public');
const protectedPages = [
  '/', '/index.html', '/locations.html', '/screens.html', '/catalog.html',
  '/screen-editor.html', '/templates.html', '/profile.html', '/settings.html'
];

async function initialiseStore(store, config) {
  await store.init();
  const bootstrapAdmin = config.bootstrapAdmin
    ? { username: config.bootstrapAdmin.username, passwordHash: await hashPassword(config.bootstrapAdmin.password) }
    : null;
  await store.ensureInitialAdministrator(bootstrapAdmin || undefined);
  await store.setInitialSiteName(config.appName);
}

function configureSecurity(app, config) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:']
      }
    }
  }));
  app.use(express.json({ limit: config.jsonBodyMaxBytes }));
}

function mountPublicRoutes(app, { store, config }) {
  app.get('/healthz', async (_request, response) => {
    await store.pool.query('SELECT 1');
    response.json({ status: 'ok', service: 'menu-tv-2.0' });
  });
  app.use('/site-assets', express.static(config.siteAssetsRoot, { etag: true, maxAge: '1d', immutable: true }));
  app.get('/api/public/config', async (_request, response) => {
    const site = siteSettingsResponse(await store.getSiteSettings(), config);
    response.json({ app_name: site.app_name, logo_url: site.logo_url, favicon_url: site.favicon_url, accent_color: site.accent_color });
  });
}

function mountProtectedApi(app, dependencies, requireApiSession) {
  app.use('/api', requireApiSession);
  app.use('/api', createSessionRouter(dependencies));
  app.use('/api/settings', createSettingsRouter(dependencies));
  app.use('/api/notifications', createNotificationsRouter(dependencies));
  app.use('/api/catalog', createCatalogRouter(dependencies));
  app.use('/api/locations', createLocationsRouter(dependencies));
  app.use('/api/templates', createTemplatesRouter(dependencies));
  app.use('/api', createScreensRouter(dependencies));
  app.use('/api', createSftpRouter(dependencies));
}

function mountFrontend(app, requirePageSession) {
  for (const page of protectedPages) app.get(page, requirePageSession, (_request, _response, next) => next());
  app.use(express.static(publicDir, {
    extensions: ['html'],
    index: 'index.html',
    etag: true,
    maxAge: 0,
    setHeaders(response) { response.setHeader('Cache-Control', 'no-store'); }
  }));
}

export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  const sftp = suppliedSftp ?? new SftpService(config.sftp);
  await initialiseStore(store, config);

  const app = express();
  configureSecurity(app, config);
  mountPublicRoutes(app, { store, config });
  app.use('/api/auth', createAuthRouter({ store, config }));

  const resolveSession = createSessionResolver(store, config);
  const { requireApiSession, requirePageSession } = createSessionMiddleware(resolveSession);
  const dependencies = { store, sftp, config };
  mountProtectedApi(app, dependencies, requireApiSession);
  mountFrontend(app, requirePageSession);
  app.use(errorHandler);

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
