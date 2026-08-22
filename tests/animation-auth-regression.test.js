import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('application errors cannot masquerade as authentication loss', async () => {
  const [application, api, authority] = await Promise.all([
    read('js/application.js'),
    read('js/core/api.js'),
    read('js/core/session-authority.js')
  ]);

  const applicationCatch = application.match(/catch \(error\) \{[\s\S]*?showApplicationFailure\(error\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(applicationCatch, /showApplicationFailure\(error\)/);
  assert.doesNotMatch(applicationCatch, /signin\.html/);

  assert.doesNotMatch(api, /response\.status === 401[\s\S]{0,200}window\.location\.replace\('\/signin\.html'\)/);
  assert.match(api, /verifySessionAuthority\(\)/);
  assert.match(api, /SESSION_AUTHORITY_STATES\.UNAUTHENTICATED/);
  assert.match(authority, /SESSION_AUTHORITY_URL = '\/api\/session\/context'/);
  assert.match(authority, /x-session-state/);
});

test('animation initial API endpoints stay under the protected settings and screens routers', async () => {
  const [page, config] = await Promise.all([
    read('js/pages/animation.js'),
    read('js/core/config.js')
  ]);

  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);
  assert.match(config, /animationPresets:\s*'\/api\/settings\/animation\/presets'/);
  assert.match(config, /screens:\s*'\/api\/screens'/);
  assert.match(page, /api\.get\(API\.animationPresets\)/);
  assert.match(page, /api\.get\(API\.animationSettings\)/);
  assert.match(page, /api\.get\(API\.screens\)/);
  assert.match(page, /disposeAnimationStudio/);
  assert.match(page, /mountGeneration/);
});
