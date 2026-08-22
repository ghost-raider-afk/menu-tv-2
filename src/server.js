import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { MenuTvStore } from './db/index.js';
import { logger } from './logger/index.js';
import { errorHandler } from './middleware/errors.js';
import { createRequestDiagnosticsMiddleware } from './middleware/diagnostics.js';
import { createSessionMiddleware } from './middleware/session.js';
import { hashPassword } from './services/password-service.js';
import { createPublishService } from './services/publish-service.js';
import { createSessionResolver } from './services/session-service.js';
import { siteSettingsResponse } from './services/site-assets-service.js';
import { migrateLegacyBackgroundAssets } from './services/legacy-background-migration.js';
import { SftpService } from './sftp/index.js';
import { createAuthRouter } from './api/auth/routes.js';
import { createSessionRouter } from './api/session/routes.js';
import { createOverviewRouter } from './api/overview/routes.js';
import { createSettingsRouter } from './api/settings/routes.js';
import { createNotificationsRouter } from './api/notifications/routes.js';
import { createDiagnosticsRouter } from './api/diagnostics/routes.js';
import { createCatalogRouter } from './api/catalog/routes.js';
import { createLocationsRouter } from './api/locations/routes.js';
import { createScreensRouter } from './api/screens/routes.js';
import { createSftpRouter } from './api/sftp/routes.js';
import { createDevicePublicRouter } from './api/device/public-routes.js';
import { createDeviceAdminRouter } from './api/device/admin-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'web', 'admin-ui', 'public');
const protectedPages = [
  '/', '/index.html', '/locations.html', '/screens.html', '/catalog.html',
  '/screen-editor.html', '/profile.html', '/settings.html', '/sftp-settings.html',
  '/animation.html', '/connect-tv.html', '/activity.html', '/diagnostics.html'
];

async function initialiseStore(store, config) {
  await store.init();
  await migrateLegacyBackgroundAssets(config.siteAssetsRoot).catch((error) => {
    logger.warn('Legacy monitor backgrounds could not be migrated', { error });
  });
  const bootstrapAdmin = config.bootstrapAdmin
    ? { username: config.bootstrapAdmin.username, passwordHash: await hashPassword(config.bootstrapAdmin.password) }
    : null;
  await store.ensureInitialAdministrator(bootstrapAdmin || undefined);
  await store.setInitialSiteName(config.appName);
}

async function recoverRuntimeState(store, sftp, config) {
  const requiredMethods = ['publishedInfo', 'removeStaged', 'cleanupStaging'];
  if (!requiredMethods.every((method) => typeof sftp?.[method] === 'function')) return;
  const publish = createPublishService({ store, sftp, config });
  try {
    const recovery = await publish.reconcilePending();
    if (recovery.recovered || recovery.unresolved) logger.info('Publication recovery completed', recovery);
  } catch (error) {
    logger.warn('Publication recovery could not complete', { error });
  }
  try {
    const cleanup = await publish.cleanupStaging({ maxAgeMs: config.sftp.stagingMaxAgeHours * 60 * 60 * 1000 });
    if (cleanup.removed) logger.info('Unused staging JPEG files removed', cleanup);
  } catch (error) {
    logger.warn('Staging cleanup could not complete', { error });
  }
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
        imgSrc: ["'self'", 'data:', 'blob:']
      }
    }
  }));
  app.use(express.json({ limit: config.jsonBodyMaxBytes }));
}

function mountPublicRoutes(app, { store, config }) {
  let readiness = { checkedAt: 0, ok: false };
  app.get('/healthz', (_request, response) => response.json({ status: 'ok', service: 'menu-tv-2.0' }));
  app.get('/readyz', async (_request, response) => {
    const now = Date.now();
    if (now - readiness.checkedAt <= config.healthReadinessCacheMs) {
      return response.status(readiness.ok ? 200 : 503).json({ status: readiness.ok ? 'ready' : 'not_ready', service: 'menu-tv-2.0' });
    }
    try {
      await store.pool.query('SELECT 1');
      readiness = { checkedAt: now, ok: true };
      return response.json({ status: 'ready', service: 'menu-tv-2.0' });
    } catch {
      readiness = { checkedAt: now, ok: false };
      return response.status(503).json({ status: 'not_ready', service: 'menu-tv-2.0' });
    }
  });
  app.use('/site-assets', express.static(config.siteAssetsRoot, { etag: true, maxAge: '1d', immutable: true }));
  app.get('/api/public/config', async (_request, response) => {
    const site = siteSettingsResponse(await store.getSiteSettings(), config);
    response.json({
      app_name: site.app_name,
      logo_url: site.logo_url,
      favicon_url: site.favicon_url,
      accent_color: site.accent_color,
      signin_logo_size: site.signin_logo_size
    });
  });
  app.use('/api/device', createDevicePublicRouter({ store, config }));
}

function mountProtectedApi(app, dependencies, requireApiSession) {
  app.use('/api', requireApiSession);
  app.use('/api', createSessionRouter(dependencies));
  app.use('/api', createOverviewRouter(dependencies));
  app.use('/api/settings', createSettingsRouter(dependencies));
  app.use('/api/notifications', createNotificationsRouter(dependencies));
  app.use('/api/diagnostics', createDiagnosticsRouter(dependencies));
  app.use('/api/catalog', createCatalogRouter(dependencies));
  app.use('/api/locations', createLocationsRouter(dependencies));
  app.use('/api/device-admin', createDeviceAdminRouter(dependencies));
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
    setHeaders(response, filename) {
      const extension = path.extname(filename).toLowerCase();
      if (extension === '.html') {
        response.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (extension === '.js' || extension === '.css') {
        response.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return;
      }
      response.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }));
}

export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {
  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });
  const sftp = suppliedSftp ?? new SftpService(config.sftp);
  await initialiseStore(store, config);
  await recoverRuntimeState(store, sftp, config);

  const app = express();
  configureSecurity(app, config);
  app.use(createRequestDiagnosticsMiddleware({ store }));
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
    logger.info('Menu TV server started', {
      app: service.config.appName,
      host: service.config.host,
      port: service.config.port
    });
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      logger.info('Menu TV server stopping', { signal });
      server.close(() => void service.store.close());
    });
  }
}
