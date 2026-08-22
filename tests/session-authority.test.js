import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('business API 401 cannot log out a user while Session Authority is authenticated', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const redirects = [];
  const calls = [];
  let businessCalls = 0;

  globalThis.window = {
    location: {
      origin: 'https://tv.example.test',
      pathname: '/animation.html',
      search: '',
      hash: '',
      replace(value) { redirects.push(value); }
    }
  };
  globalThis.document = { body: { dataset: { page: 'animation' } } };
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target === '/api/diagnostics/client-events') return response({ id: 1 }, { status: 201 });
    if (target === '/api/session/context') return response({ session: { status: 'ok' } }, { headers: { 'x-session-state': 'authenticated' } });
    if (target === '/api/settings/animation/presets') {
      businessCalls += 1;
      return businessCalls === 1
        ? response({ error: 'Требуется вход в систему.' }, { status: 401 })
        : response({ ok: true });
    }
    return response({ ok: true });
  };

  try {
    const { request } = await import(`../src/web/admin-ui/public/js/core/api.js?session-authority=${Date.now()}`);
    const result = await request('/api/settings/animation/presets', { method: 'GET' });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls.filter((url) => url !== '/api/diagnostics/client-events'), [
      '/api/settings/animation/presets',
      '/api/session/context',
      '/api/settings/animation/presets'
    ]);
    assert.deepEqual(redirects, []);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('only authoritative unauthenticated session state may transition to sign in', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const redirects = [];
  let businessCalls = 0;

  globalThis.window = {
    location: {
      origin: 'https://tv.example.test',
      pathname: '/animation.html',
      search: '',
      hash: '',
      replace(value) { redirects.push(value); }
    }
  };
  globalThis.document = { body: { dataset: { page: 'animation' } } };
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target === '/api/diagnostics/client-events') return response({ id: 1 }, { status: 201 });
    if (target === '/api/session/context') {
      return response({ error: 'Требуется вход в систему.' }, {
        status: 401,
        headers: { 'x-session-state': 'unauthenticated' }
      });
    }
    if (target === '/api/screens') {
      businessCalls += 1;
      return response({ error: 'Требуется вход в систему.' }, { status: 401 });
    }
    return response({ ok: true });
  };

  try {
    const { request } = await import(`../src/web/admin-ui/public/js/core/api.js?session-expired=${Date.now()}`);
    await assert.rejects(() => request('/api/screens', { method: 'GET' }));
    assert.equal(businessCalls, 1);
    assert.deepEqual(redirects, ['/signin.html']);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('SPA router and API client delegate authentication decisions to Session Authority', async () => {
  const [api, router, authority, middleware, sessionRoutes, server, animation] = await Promise.all([
    read('src/web/admin-ui/public/js/core/api.js'),
    read('src/web/admin-ui/public/js/core/router.js'),
    read('src/web/admin-ui/public/js/core/session-authority.js'),
    read('src/middleware/session.js'),
    read('src/api/session/routes.js'),
    read('src/server.js'),
    read('src/web/admin-ui/public/js/pages/animation.js')
  ]);

  assert.match(authority, /SESSION_AUTHORITY_URL = '\/api\/session\/context'/);
  assert.match(authority, /x-session-state/);
  assert.match(authority, /verificationPromise/);
  assert.match(authority, /transitionToSignIn/);

  assert.doesNotMatch(api, /window\.location\.replace\('\/signin\.html'\)/);
  assert.match(api, /verifySessionAuthority\(\)/);
  assert.match(api, /fetchResponse\(url, init, requestId, routeSignal\)[\s\S]*fetchResponse\(url, init, requestId, routeSignal\)/);

  assert.doesNotMatch(router, /window\.location\.replace\('\/signin\.html'\)/);
  assert.match(router, /verifySessionAuthority\(\)/);
  const navigationCatch = router.match(/catch \(error\) \{[\s\S]*?route\.navigation_failed[\s\S]*?return false;/)?.[0] || '';
  assert.doesNotMatch(navigationCatch, /location\.assign|location\.replace/);

  assert.match(middleware, /X-Session-State', 'unauthenticated'/);
  assert.match(sessionRoutes, /X-Session-State', 'authenticated'/);
  assert.match(sessionRoutes, /router\.get\('\/session\/context'/);
  assert.match(server, /'\/animation\.html'/);
  assert.match(server, /app\.use\('\/api', requireApiSession\)/);

  assert.match(animation, /api\.get\(API\.animationSettings\)/);
  assert.match(animation, /api\.get\(API\.animationPresets\)/);
  assert.match(animation, /api\.get\(API\.screens\)/);
  assert.doesNotMatch(animation, /window\.location\.(?:assign|replace).*signin/);
});
