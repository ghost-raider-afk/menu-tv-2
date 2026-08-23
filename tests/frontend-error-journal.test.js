import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('settings navigation permanently exposes the frontend error journal', async () => {
  const [navigation, application, page] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/error-log.html')
  ]);
  assert.match(navigation, /\['Журнал ошибок', '\/error-log\.html'\]/);
  assert.match(navigation, /page: 'error-log'/);
  assert.match(application, /case 'error-log'/);
  assert.match(application, /pages\/error-log\.js/);
  assert.match(page, /data-page="error-log"/);
  assert.match(page, />Журнал ошибок<\/h1>/);
});

test('frontend diagnostics capture JS, promise, network and 5xx failures without request bodies', async () => {
  const [collector, api, routes] = await Promise.all([
    read('src/web/admin-ui/public/js/core/diagnostics.js'),
    read('src/web/admin-ui/public/js/core/api.js'),
    read('src/api/diagnostics/routes.js')
  ]);
  assert.match(collector, /addEventListener\('error'/);
  assert.match(collector, /addEventListener\('unhandledrejection'/);
  assert.match(api, /type: 'api-network'/);
  assert.match(api, /response\.status >= 500/);
  assert.match(routes, /frontend-errors/);
  assert.doesNotMatch(routes, /cookie|request\.body\.(?:body|payload|password)/i);
});

test('frontend error journal has its own migration and env-driven retention', async () => {
  const [db, migration, config, env] = await Promise.all([
    read('src/db/index.js'),
    read('src/db/migrations/frontend-error-journal.js'),
    read('src/config/index.js'),
    read('.env.example')
  ]);
  assert.match(db, /007-frontend-error-journal/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS frontend_error_events/);
  assert.match(config, /FRONTEND_ERROR_RETENTION_DAYS/);
  assert.match(config, /FRONTEND_ERROR_MAX_ENTRIES/);
  assert.match(env, /^FRONTEND_ERROR_RETENTION_DAYS=14$/m);
  assert.match(env, /^FRONTEND_ERROR_MAX_ENTRIES=2000$/m);
});
