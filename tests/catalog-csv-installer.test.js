import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('updater migrates catalog CSV limit before application config is validated', async () => {
  const [installer, env] = await Promise.all([read('menu-tv-2.sh'), read('.env.example')]);
  assert.match(installer, /SCRIPT_VERSION="1\.3\.4"/);
  assert.match(installer, /env_value CATALOG_CSV_MAX_BYTES[\s\S]*set_env_value "\$env_file" CATALOG_CSV_MAX_BYTES "5242880"/);
  assert.match(installer, /update_progress 25 "Проверка конфигурации"[\s\S]*ensure_sftp_env[\s\S]*validate_env/);
  assert.match(env, /^CATALOG_CSV_MAX_BYTES=5242880$/m);
});
