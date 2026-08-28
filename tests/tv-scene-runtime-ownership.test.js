import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('LiveMenuMotion does not compile Entity behavior a second time', () => {
  const source = fs.readFileSync(new URL('../src/web/admin-ui/public/js/motion/live-menu-motion.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /compileEntityBehaviorProgram/);
  assert.match(source, /compilers:\s*DEFAULT_SCENE_COMPILERS/);
});
