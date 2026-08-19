import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../menu-tv-2.sh', import.meta.url), 'utf8');

test('installer exposes administrator data through menu and command', () => {
  assert.match(script, /SCRIPT_VERSION="1\.1\.14"/);
  assert.match(script, /sudo \$PROGRAM_NAME admin-info/);
  assert.match(script, /7\. Вывести данные администратора/);
  assert.match(script, /admin-info\) show_administrator_data/);
  assert.match(script, /SELECT username FROM web_users WHERE role = 'administrator' AND active = TRUE ORDER BY username/);
});

test('administrator data command never reads password hashes', () => {
  const functionBody = script.match(/show_administrator_data\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(functionBody);
  assert.doesNotMatch(functionBody, /password_hash/i);
  assert.match(functionBody, /не хранится в открытом виде/);
});
