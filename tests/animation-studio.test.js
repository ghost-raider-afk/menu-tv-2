import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('animation studio ships exactly twenty complete unique presets', () => {
  assert.equal(ANIMATION_PRESETS.length, 20);
  assert.equal(new Set(ANIMATION_PRESETS.map((preset) => preset.id)).size, 20);
  for (const preset of ANIMATION_PRESETS) {
    const parsed = animationSettingsInput({ enabled: true, preset_id: preset.id, profile: preset.profile });
    assert.equal(parsed.preset_id, preset.id);
    assert.equal(parsed.profile.duration_ms, preset.profile.duration_ms);
    assert.ok(parsed.profile.hold_seconds >= 3);
  }
});

test('animation settings contract rejects invalid professional controls', () => {
  const profile = ANIMATION_PRESETS[0].profile;
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'bad id', profile }), /Идентификатор пресета/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, duration_ms: 100 } }), /Длительность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, intensity: 101 } }), /Интенсивность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, easing: 'random' } }), /Easing/);
});

test('animation studio has a dedicated settings route, mini player and timeline controls', async () => {
  const [html, app, navigation, config, css, page, player] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('js/pages/animation.js'), read('js/motion/preview-player.js')
  ]);
  assert.match(html, /data-page="animation"/);
  for (const id of ['animation-stage','animation-play','animation-pause','animation-replay','animation-timeline','animation-save']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(navigation, /\/animation\.html/);
  assert.match(navigation, /\['Анимация', '\/animation\.html'\]/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);
  assert.match(page, /ANIMATION_PRESETS/);
  assert.match(page, /AnimationPreviewPlayer/);
  assert.match(player, /element\.animate/);
  assert.match(player, /currentTime/);
  assert.match(css, /\.animation-stage/);
  assert.match(css, /aspect-ratio:16\/9/);
});
