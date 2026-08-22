import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { ROUTE_DEFINITIONS } from '../src/web/admin-ui/public/js/core/navigation.js';
import { sanitizeDiagnosticDetails } from '../src/contracts/diagnostics.js';

const repo = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, repo), 'utf8');

const htmlPathForRoute = (route) => route.path === '/'
  ? 'src/web/admin-ui/public/index.html'
  : `src/web/admin-ui/public${route.path}`;

test('every registered SPA route has protected HTML and an application controller', async () => {
  const [server, application] = await Promise.all([
    read('src/server.js'),
    read('src/web/admin-ui/public/js/application.js')
  ]);

  assert.ok(ROUTE_DEFINITIONS.length >= 12, 'route audit must cover the complete admin application');
  for (const route of ROUTE_DEFINITIONS) {
    const html = await read(htmlPathForRoute(route));
    assert.match(html, new RegExp(`data-page=["']${route.page}["']`), `${route.path} must declare ${route.page}`);
    assert.match(application, new RegExp(`case ['"]${route.page}['"]`), `${route.page} controller missing from application bootstrap`);
    const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(server, new RegExp(`['"]${escapedPath}['"]`), `${route.path} must be protected by page session middleware`);
  }
  assert.match(application, /default:[\s\S]*throw new Error/);
});

test('route controllers never capture page DOM once at ES-module evaluation time', async () => {
  const pagesDir = new URL('../src/web/admin-ui/public/js/pages/', import.meta.url);
  const filenames = (await readdir(pagesDir)).filter((name) => name.endsWith('.js') && name !== 'signin.js');
  for (const filename of filenames) {
    const source = await read(`src/web/admin-ui/public/js/pages/${filename}`);
    assert.doesNotMatch(
      source,
      /^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*document\.(?:querySelector|getElementById)\(/m,
      `${filename} captures route DOM at module scope and will break after SPA remount`
    );
  }
});

test('SPA navigation is transactional, aborts old route work and rolls back failed mounts', async () => {
  const [router, runtime, api] = await Promise.all([
    read('src/web/admin-ui/public/js/core/router.js'),
    read('src/web/admin-ui/public/js/core/route-runtime.js'),
    read('src/web/admin-ui/public/js/core/api.js')
  ]);
  assert.match(router, /beginRouteRuntime/);
  assert.match(router, /endRouteRuntime/);
  assert.match(router, /restorePreviousView/);
  assert.match(router, /currentViewSnapshot/);
  assert.match(router, /PREFETCH_MAX_AGE_MS/);
  assert.match(router, /await Promise\.resolve\(\)/);
  assert.doesNotMatch(router.match(/catch \(error\) \{[\s\S]*?route\.navigation_failed[\s\S]*?return false;/)?.[0] || '', /location\.(?:assign|replace)/);
  assert.match(runtime, /AbortController/);
  assert.match(runtime, /route-replaced/);
  assert.match(api, /currentRouteSignal/);
  assert.match(api, /routeSignal/);
  assert.match(api, /cancelled: true/);
  assert.match(api, /!error\.cancelled/);
});

test('resource-heavy pages explicitly clean up camera, timers, RAF and animation players', async () => {
  const [connectTv, animation, editor, diagnostics] = await Promise.all([
    read('src/web/admin-ui/public/js/pages/connect-tv.js'),
    read('src/web/admin-ui/public/js/pages/animation.js'),
    read('src/web/admin-ui/public/js/editor/editor.js'),
    read('src/web/admin-ui/public/js/pages/diagnostics.js')
  ]);
  assert.match(connectTv, /return \{[\s\S]*dispose\(\)/);
  assert.match(connectTv, /stopCamera\(\)/);
  assert.match(connectTv, /stopActivationTimer\(\)/);
  assert.match(connectTv, /stopBindingsRefreshTimer\(\)/);
  assert.match(connectTv, /mountGeneration/);

  assert.match(animation, /return \{[\s\S]*dispose\(\)/);
  assert.match(animation, /cancelAnimationFrame\(previewFrame\)/);
  assert.match(animation, /player\?\.destroy\(\)/);
  assert.match(animation, /mountGeneration/);

  assert.match(editor, /canLeave\(\)/);
  assert.match(editor, /dispose\(\)/);
  assert.match(editor, /removeEventListener\('beforeunload'/);

  assert.match(diagnostics, /return \{[\s\S]*dispose\(\)/);
  assert.match(diagnostics, /clearInterval\(refreshTimer\)/);
});

test('diagnostics correlate client and server failures without persisting secrets', async () => {
  const [schema, middleware, client, server, application] = await Promise.all([
    read('src/db/migrations/schema.js'),
    read('src/middleware/diagnostics.js'),
    read('src/web/admin-ui/public/js/core/diagnostics.js'),
    read('src/server.js'),
    read('src/web/admin-ui/public/js/application.js')
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS diagnostic_events/);
  assert.match(schema, /request_id TEXT NOT NULL/);
  assert.match(middleware, /X-Request-Id/);
  assert.match(middleware, /status < 400/);
  assert.match(client, /unhandledrejection/);
  assert.match(client, /window\.addEventListener\('error'/);
  assert.match(application, /initialiseClientDiagnostics\(\)/);
  assert.match(server, /createRequestDiagnosticsMiddleware/);
  assert.match(server, /createDiagnosticsRouter/);

  const sanitized = sanitizeDiagnosticDetails({
    safe: 'visible',
    password: 'never-store-this',
    nested: { token: 'secret-token', request_id: 'visible-id' },
    headers: { authorization: 'Bearer secret', accept: 'application/json' }
  });
  assert.equal(sanitized.safe, 'visible');
  assert.equal(sanitized.password, '[redacted]');
  assert.equal(sanitized.nested.token, '[redacted]');
  assert.equal(sanitized.nested.request_id, 'visible-id');
  assert.equal(sanitized.headers.authorization, '[redacted]');
  assert.equal(sanitized.headers.accept, 'application/json');
});
