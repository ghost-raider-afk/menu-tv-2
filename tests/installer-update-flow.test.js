import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const installerPath = fileURLToPath(new URL('../menu-tv-2.sh', import.meta.url));

test('update exits immediately when installed release is already current', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mira-installer-current-'));
  try {
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.env'), 'TEST=1\n');
    const harness = String.raw`
      source "$1"
      INSTALL_DIR="$2"
      require_root() { :; }
      installed_project_version() { printf '1.9.0\n'; }
      latest_release_tag() { printf 'v1.9.0\n'; }
      prepare_host() { printf 'UNEXPECTED:prepare_host\n'; return 91; }
      check_dependencies() { printf 'UNEXPECTED:check_dependencies\n'; return 92; }
      fetch_release_revision() { printf 'UNEXPECTED:fetch_release_revision\n'; return 93; }
      create_temporary_backup() { printf 'UNEXPECTED:create_temporary_backup\n'; return 94; }
      update_app
    `;
    const result = spawnSync('bash', ['-c', harness, 'bash', installerPath, root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'MIRA-TV v1.9.0 уже актуален.');
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
