import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const DEVICE_ENV_DEFAULTS = [
  ['DEVICE_ACTIVATION_TTL_MINUTES', '10'],
  ['DEVICE_ACTIVATION_POLL_SECONDS', '2'],
  ['DEVICE_SESSION_TTL_DAYS', '365'],
  ['DEVICE_HEARTBEAT_WRITE_SECONDS', '30'],
  ['PLAYER_REFRESH_SECONDS', '5']
];

test('installer migrates Device Player env before application update', async () => {
  const installer = await read('menu-tv-2.sh');
  assert.match(installer, /^SCRIPT_VERSION="1\.3\.2"$/m);

  for (const [key, value] of DEVICE_ENV_DEFAULTS) {
    assert.match(
      installer,
      new RegExp(`env_value ${key}[^\\n]+set_env_value[^\\n]+${key} "${value}"`),
      `${key} must be added to an existing .env when missing`
    );
  }

  const validateBlock = installer.match(/validate_env\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  for (const [key] of DEVICE_ENV_DEFAULTS) {
    assert.match(validateBlock, new RegExp(`\\b${key}\\b`), `${key} must be required after migration`);
  }

  const updateBlock = installer.match(/update_app\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const handoffIndex = updateBlock.indexOf('handoff_update_to_latest_script');
  const migrationIndex = updateBlock.indexOf('ensure_sftp_env');
  assert.ok(handoffIndex >= 0, 'update must check for a newer installer');
  assert.ok(migrationIndex >= 0, 'update must migrate the environment');
  assert.ok(handoffIndex < migrationIndex, 'newer installer must take over before env migration');
  assert.match(installer, /exec "\$LAUNCHER_PATH" update/);
});

test('installer reports the application version from package.json', async () => {
  const [installer, pkg] = await Promise.all([read('menu-tv-2.sh'), read('package.json')]);
  const packageVersion = JSON.parse(pkg).version;
  assert.equal(packageVersion, '0.2.0');
  assert.match(installer, /project_version_from_file\(\)/);
  assert.match(installer, /project_version_from_file "\$INSTALL_DIR\/package\.json"/);
  assert.match(installer, /Версия проекта: \$\(project_version\)/);
  assert.match(installer, /printf 'Версия проекта: %s\\n' "\$\(project_version\)"/);
  assert.match(installer, /printf ' Версия проекта: %s\\n' "\$\(project_version\)"/);
});

test('application update uses a compact 0 to 100 percent progress bar', async () => {
  const installer = await read('menu-tv-2.sh');
  const updateBlock = installer.match(/update_app\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(installer, /update_progress\(\)/);
  assert.match(installer, /Обновление \[\%s\] \%3d\%\%/);
  assert.match(updateBlock, /update_progress 0 "Подготовка"/);
  assert.match(updateBlock, /update_progress 100 "Готово"/);
  assert.match(updateBlock, /UPDATE_LOG_FILE=.*update-log/);
  assert.match(updateBlock, /exec >>"\$UPDATE_LOG_FILE" 2>&1/);
  assert.match(installer, /Последние сообщения журнала/);
});
