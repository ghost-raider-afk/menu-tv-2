import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { completeAnimationProfile } from '../src/shared/animation-profile.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('animation studio ships exactly twenty continuous unique presets', () => {
  assert.equal(ANIMATION_PRESETS.length, 20);
  assert.equal(new Set(ANIMATION_PRESETS.map((preset) => preset.id)).size, 20);
  for (const preset of ANIMATION_PRESETS) {
    const parsed = animationSettingsInput({ enabled: true, preset_id: preset.id, profile: preset.profile });
    assert.equal(parsed.preset_id, preset.id);
    assert.equal(parsed.profile.motion_version, 2);
    assert.equal(parsed.profile.cycle_seconds, preset.profile.cycle_seconds);
    assert.ok(parsed.profile.event_duration_ms >= 400);
    assert.ok(parsed.profile.cycle_seconds >= 4);
    assert.equal('entrance' in parsed.profile, false);
    assert.equal('opacity_from' in parsed.profile, false);
  }
});

test('animation settings contract rejects invalid continuous motion controls', () => {
  const profile = ANIMATION_PRESETS[0].profile;
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'bad id', profile }), /Идентификатор пресета/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, event_duration_ms: 100 } }), /Длительность события/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, intensity: 101 } }), /Интенсивность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, pattern: 'slide-show' } }), /Характер движения/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, easing: 'random' } }), /Easing/);
});

test('legacy entrance profile is migrated into always-visible continuous motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 2);
  assert.equal(migrated.pattern, 'wave');
  assert.equal(migrated.flow_direction, 'left-to-right');
  assert.equal(migrated.section_effect, 'glow');
  assert.equal(migrated.price_effect, 'pulse');
  assert.equal(migrated.background_effect, 'drift');
  assert.equal('entrance' in migrated, false);
  assert.equal('opacity_from' in migrated, false);
});

test('animation studio uses a real-screen continuous loop instead of slide entrance animation', async () => {
  const [html, app, navigation, config, css, previewCss, page, player, screenPreview] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('css/pages/animation-screen-preview.css'), read('js/pages/animation.js'),
    read('js/motion/preview-player.js'), read('js/motion/screen-preview.js')
  ]);
  assert.match(html, /data-page="animation"/);
  for (const id of ['animation-stage','animation-screen-select','animation-screen-status','animation-play','animation-pause','animation-replay','animation-timeline','animation-save','animation-pattern','animation-cycle','animation-section-effect','animation-background-effect']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /animation-entrance|Тип появления|Начальная прозрачность|Появление<\/h2>/);
  assert.doesNotMatch(html, /animation-demo-|БИР КОМ СВЕТЛОЕ|ЖИГУЛЕВСКОЕ/);
  assert.match(html, /Меню всегда остаётся открытым и читаемым/);
  assert.match(navigation, /\/animation\.html/);
  assert.match(navigation, /\['Анимация', '\/animation\.html'\]/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);
  assert.match(page, /motion_version:\s*2/);
  assert.match(page, /ANIMATION_PRESETS/);
  assert.match(page, /api\.get\(API\.screens\)/);
  assert.match(page, /renderAnimationScreenPreview/);
  assert.match(screenPreview, /buildRenderModel/);
  assert.match(screenPreview, /buildDisplayLines/);
  assert.match(screenPreview, /buildRenderLayout/);
  assert.match(screenPreview, /buildTableSvg/);
  assert.match(player, /iterations:\s*Infinity/);
  assert.match(player, /opacity:\s*1/);
  assert.doesNotMatch(player, /opacity_from|entranceTransform|clipFrames/);
  assert.match(player, /currentTime/);
  assert.match(css, /\.animation-stage/);
  assert.match(css, /aspect-ratio:16\/9/);
  assert.match(previewCss, /\.animation-screen-canvas \.menu-table-svg/);
  assert.match(previewCss, /opacity:1/);
});
