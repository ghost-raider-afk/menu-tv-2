import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('project and installer versions are independently valid with release automation', async () => {
  const [packageText, lockText, installer, changelog, workflow] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
    readFile(new URL('../menu-tv-2.sh', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8')
  ]);
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const scriptVersion = installer.match(/^SCRIPT_VERSION="(\d+\.\d+\.\d+)"$/m)?.[1];

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.['']?.version, pkg.version);
  assert.ok(changelog.includes(`## [${pkg.version}]`));
  assert.ok(changelog.includes('node/unit, Chromium browser/visual и clean-install smoke'));
  assert.ok(scriptVersion, 'SCRIPT_VERSION must be an independent semantic version');
  assert.doesNotMatch(installer, /MENU_TV_REF|\$BRANCH|^BRANCH=/m);
  assert.match(installer, /releases\/latest/);
  assert.match(workflow, /release-and-cleanup:/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /git push origin --delete/);
});
