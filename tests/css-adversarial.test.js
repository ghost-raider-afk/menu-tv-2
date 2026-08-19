import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('shell uses dynamic viewport height and explicit layer tokens', async () => {
  const [tokens, shell] = await Promise.all([
    source('src/web/admin-ui/public/css/tokens.css'),
    source('src/web/admin-ui/public/css/shell.css')
  ]);
  assert.match(tokens, /--ui-z-context:/);
  assert.match(tokens, /--ui-accent-text:/);
  assert.match(tokens, /--ui-accent-on-dark:/);
  assert.match(shell, /100dvh/);
  assert.match(shell, /var\(--ui-z-context\)/);
  assert.match(shell, /var\(--ui-accent-on-dark\)/);
});

test('hidden switches expose a keyboard focus indicator', async () => {
  const forms = await source('src/web/admin-ui/public/css/forms.css');
  assert.match(forms, /\.toggle-row input:focus-visible\+i/);
  assert.match(forms, /outline-offset/);
});

test('preview typography and aspect ratio are driven by the actual monitor resolution', async () => {
  const [preview, editorCss, settings] = await Promise.all([
    source('src/web/admin-ui/public/js/editor/preview.js'),
    source('src/web/admin-ui/public/css/editor/editor.css'),
    source('src/web/admin-ui/public/js/editor/settings.js')
  ]);
  assert.match(preview, /target\.style\.aspectRatio = `\$\{model\.viewport\.width\} \/ \$\{model\.viewport\.height\}`/);
  assert.match(preview, /\(base \* scale\) \/ width/);
  assert.match(editorCss, /container-type:inline-size/);
  assert.doesNotMatch(editorCss, /data-font-scale[^\n]*font-size/);
  assert.doesNotMatch(settings, /Math\.min\(1920/);
  assert.doesNotMatch(settings, /Math\.min\(1080/);
});

test('preview and final image share canonical fit logic instead of clipping silently', async () => {
  const [renderer, preview, finalImage, editor] = await Promise.all([
    source('src/web/admin-ui/public/js/editor/renderer.js'),
    source('src/web/admin-ui/public/js/editor/preview.js'),
    source('src/web/admin-ui/public/js/editor/final-image.js'),
    source('src/web/admin-ui/public/js/editor/editor.js')
  ]);
  assert.match(renderer, /export function buildVerticalLayout/);
  assert.match(renderer, /fits/);
  assert.match(preview, /buildRenderLayout/);
  assert.match(finalImage, /buildRenderLayout/);
  assert.match(finalImage, /if \(!renderLayout\.vertical\.fits\)/);
  assert.match(editor, /if \(!preview\?\.layout\?\.vertical\?\.fits\)/);
});

test('site accent derives contrast colors instead of reusing arbitrary accent as text', async () => {
  const presentation = await source('src/web/admin-ui/public/js/core/presentation.js');
  assert.match(presentation, /function contrast/);
  assert.match(presentation, />= 4\.5/);
  assert.match(presentation, /--ui-accent-contrast/);
  assert.match(presentation, /--ui-accent-text/);
  assert.match(presentation, /--ui-accent-on-dark/);
});
