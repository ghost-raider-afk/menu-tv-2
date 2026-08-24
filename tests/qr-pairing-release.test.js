import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('v1.4.1 release metadata and QR security defaults are synchronized', async () => {
  const [pkg, lock, env, installer, changelog] = await Promise.all([
    read('package.json'),
    read('package-lock.json'),
    read('.env.example'),
    read('menu-tv-2.sh'),
    read('CHANGELOG.md')
  ]);
  assert.equal(JSON.parse(pkg).version, '1.4.1');
  assert.equal(JSON.parse(lock).version, '1.4.1');
  assert.equal(JSON.parse(lock).packages[''].version, '1.4.1');
  assert.equal(JSON.parse(pkg).dependencies.jsqr, '1.4.0');
  assert.match(env, /^DEVICE_ACTIVATION_TTL_MINUTES=2$/m);
  assert.match(installer, /^SCRIPT_VERSION="1\.3\.3"$/m);
  assert.match(installer, /env_value DEVICE_ACTIVATION_TTL_MINUTES "\$env_file"\)" == "10"/);
  assert.match(installer, /set_env_value "\$env_file" DEVICE_ACTIVATION_TTL_MINUTES "2"/);
  assert.match(changelog, /## \[1\.4\.1\]/);
});
