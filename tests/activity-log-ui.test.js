import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const sourceRoot = new URL('../src/', import.meta.url);
const readWeb = (path) => readFile(new URL(path, webRoot), 'utf8');
const readSource = (path) => readFile(new URL(path, sourceRoot), 'utf8');

test('activity log is a dedicated settings route with save and clear actions', async () => {
  const [navigation, page, application] = await Promise.all([
    readWeb('js/core/navigation.js'),
    readWeb('activity.html'),
    readWeb('js/application.js')
  ]);
  assert.match(navigation, /path: '\/activity\.html', page: 'activity', section: 'settings'/);
  assert.match(navigation, /\['Журнал действий', '\/activity\.html'\]/);
  assert.match(page, /id="save-activity"/);
  assert.match(page, /id="clear-activity"/);
  assert.match(application, /case 'activity'/);
});

test('notification footer closes overlay and opens dedicated activity route', async () => {
  const [component, notifications] = await Promise.all([
    readWeb('js/components/notifications.js'),
    readWeb('js/core/notifications.js')
  ]);
  assert.match(component, /data-open-activity-log href="\/activity\.html"/);
  assert.match(notifications, /panel\.querySelector\('\[data-open-activity-log\]'\)/);
  assert.match(notifications, /closeNotifications\(panel, button\)/);
});

test('activity API supports listing and database-backed clearing', async () => {
  const [routes, repository, server] = await Promise.all([
    readSource('api/notifications/routes.js'),
    readSource('db/notifications.js'),
    readSource('server.js')
  ]);
  assert.match(routes, /router\.get\('\/activity'/);
  assert.match(routes, /router\.delete\('\/activity'/);
  assert.match(repository, /async clearActivity\(\)/);
  assert.match(repository, /DELETE FROM activity_events/);
  assert.match(server, /'\/activity\.html'/);
});

test('activity export is a real CSV download', async () => {
  const page = await readWeb('js/pages/activity.js');
  assert.match(page, /new Blob\(/);
  assert.match(page, /text\/csv;charset=utf-8/);
  assert.match(page, /tv-menu-activity-/);
  assert.match(page, /confirmAction\(/);
  assert.match(page, /api\.delete\(`\$\{API\.notifications\}\/activity`\)/);
});
