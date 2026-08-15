import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('server is a thin application assembly layer', async () => {
  const server = await read('server.js');
  assert.ok(server.length < 12000, `server.js too large: ${server.length}`);
  for (const router of ['createAuthRouter','createSettingsRouter','createCatalogRouter','createLocationsRouter','createScreensRouter','createTemplatesRouter','createSftpRouter']) {
    assert.match(server, new RegExp(router));
  }
  assert.doesNotMatch(server, /INSERT INTO|UPDATE\s+(?:screens|locations|templates)|DELETE FROM|CREATE TABLE/i);
  assert.doesNotMatch(server, /function\s+(?:productInput|screenInput|menuDraftInput|verifyPassword|issueSession)\b/);
});

test('database facade contains no domain SQL', async () => {
  const facade = await read('db.js');
  assert.ok(facade.length < 6000, `db.js too large: ${facade.length}`);
  assert.doesNotMatch(facade, /SELECT\s|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|CREATE\s+TABLE/i);
  for (const repository of ['users.js','settings.js','notifications.js','locations.js','screens.js','catalog.js','templates.js','sftp.js']) {
    await access(new URL(`db/${repository}`, root));
  }
  await access(new URL('db/migrations/schema.js', root));
});

test('SFTP service is composed from client storage and publisher', async () => {
  const service = await read('sftp.js');
  assert.match(service, /SftpGoClient/);
  assert.match(service, /SftpStorage/);
  assert.match(service, /SftpPublisher/);
  assert.doesNotMatch(service, /from 'node:fs\/promises'/);
  await access(new URL('sftp/client.js', root));
  await access(new URL('sftp/storage.js', root));
  await access(new URL('sftp/publisher.js', root));
});

test('configuration has one modular entrypoint and no legacy config file', async () => {
  await access(new URL('config/index.js', root));
  await access(new URL('config/env.js', root));
  await assert.rejects(access(new URL('config.js', root)));
});

test('fresh PostgreSQL schema uses TV Menu 1 visual default without overwriting a changed accent', async () => {
  const schema = await read('db/migrations/schema.js');
  assert.match(schema, /DEFAULT '#F4C915'/);
  assert.match(schema, /accent_color = '#2563EB'.*updated_by/s);
});
