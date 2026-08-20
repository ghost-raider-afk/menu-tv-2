import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationProfileRecordInput, animationSettingsInput } from '../src/contracts/animation.js';
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

test('animation profile records validate library name and continuous motion controls', () => {
  const profile = ANIMATION_PRESETS[0].profile;
  const parsed = animationProfileRecordInput({ name: 'Золотая волна', enabled: true, preset_id: ANIMATION_PRESETS[0].id, profile });
  assert.equal(parsed.name, 'Золотая волна');
  assert.equal(parsed.profile.motion_version, 2);
  assert.throws(() => animationProfileRecordInput({ name: '', enabled: true, preset_id: 'custom', profile }), /Название профиля/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'bad id', profile }), /Идентификатор пресета/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, event_duration_ms: 100 } }), /Длительность события/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, intensity: 101 } }), /Интенсивность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, pattern: 'slide-show' } }), /Характер движения/);
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

test('motion studio uses a profile library, real screen and fullscreen TV workspace', async () => {
  const [html, app, navigation, config, css, previewCss, page, player, screenPreview, playerHtml, playerCss, playerPage] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('css/pages/animation-screen-preview.css'), read('js/pages/animation.js'),
    read('js/motion/preview-player.js'), read('js/motion/screen-preview.js'), read('player.html'), read('css/player.css'), read('js/player.js')
  ]);
  assert.match(html, /data-page="animation"/);
  for (const id of [
    'animation-profile-select','animation-profile-name','animation-new-profile','animation-delete-profile',
    'animation-stage','animation-screen-select','animation-screen-profile','animation-assign-profile','animation-screen-status',
    'animation-player-url','animation-player-enabled','animation-player-copy','animation-player-open','animation-player-rotate',
    'animation-play','animation-pause','animation-replay','animation-timeline','animation-save','animation-pattern','animation-cycle'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /animation-entrance|Тип появления|Начальная прозрачность|Появление<\/h2>/);
  assert.match(html, /Профили хранятся в библиотеке и назначаются конкретным мониторам/);
  assert.match(navigation, /\/animation\.html/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(config, /animationProfiles:\s*'\/api\/settings\/animation\/profiles'/);
  assert.match(page, /API\.animationProfiles/);
  assert.match(page, /\/animation-profile/);
  assert.match(page, /player-workspace/);
  assert.match(page, /renderAnimationScreenPreview/);
  assert.match(screenPreview, /buildRenderModel/);
  assert.match(screenPreview, /buildDisplayLines/);
  assert.match(screenPreview, /buildRenderLayout/);
  assert.match(screenPreview, /buildTableSvg/);
  assert.match(player, /iterations:\s*Infinity/);
  assert.match(player, /opacity:\s*1/);
  assert.doesNotMatch(player, /opacity_from|entranceTransform|clipFrames/);
  assert.match(css, /\.animation-player-workspace/);
  assert.match(previewCss, /\.animation-screen-canvas \.menu-table-svg/);
  assert.match(playerHtml, /id="tv-player"/);
  assert.match(playerHtml, /id="player-stage"/);
  assert.match(playerCss, /width:min\(100vw,calc\(100vh \* var\(--player-aspect\)\)\)/);
  assert.match(playerCss, /cursor:none/);
  assert.match(playerPage, /\/api\/player\//);
  assert.match(playerPage, /wakeLock/);
  assert.match(playerPage, /new AnimationPreviewPlayer\(\{ stage \}\)/);
});
