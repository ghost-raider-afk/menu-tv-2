import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { completeAnimationProfile, PROMOTION_EFFECTS, VISUAL_EFFECTS } from '../src/shared/animation-profile.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const VISUAL_PRESET_IDS = ['ocean-wave', 'aurora-flow', 'water-ripple', 'sun-sweep', 'spotlight-tour', 'liquid-glass'];

test('animation studio ships twenty-six continuous unique TV presets', () => {
  assert.equal(ANIMATION_PRESETS.length, 26);
  assert.equal(new Set(ANIMATION_PRESETS.map((preset) => preset.id)).size, 26);
  for (const preset of ANIMATION_PRESETS) {
    const parsed = animationSettingsInput({ enabled: true, preset_id: preset.id, profile: preset.profile });
    assert.equal(parsed.preset_id, preset.id);
    assert.equal(parsed.profile.motion_version, 4);
    assert.equal(parsed.profile.cycle_seconds, preset.profile.cycle_seconds);
    assert.ok(VISUAL_EFFECTS.includes(parsed.profile.visual_effect));
    assert.ok(PROMOTION_EFFECTS.includes(parsed.profile.promotion_effect));
    assert.notEqual(parsed.profile.promotion_effect, 'none', `${preset.id} must preserve an explicit promotion signal`);
    assert.ok(parsed.profile.event_duration_ms >= 400);
    assert.ok(parsed.profile.cycle_seconds >= 4);
    assert.equal('background_effect' in parsed.profile, false);
    assert.equal('background_zoom_percent' in parsed.profile, false);
    assert.equal('background_effect' in preset.profile, false);
    assert.equal('background_zoom_percent' in preset.profile, false);
    assert.equal('entrance' in parsed.profile, false);
    assert.equal('opacity_from' in parsed.profile, false);
  }
});

test('promo presets synchronize promotion labels with price emphasis', () => {
  const promo = ANIMATION_PRESETS.filter((preset) => preset.category === 'Promo');
  assert.ok(promo.length >= 3);
  for (const preset of promo) assert.equal(preset.profile.promotion_effect, 'pulse-price');
});

test('six Visual FX presets are distinct full-screen scenes', () => {
  const visualPresets = ANIMATION_PRESETS.filter((preset) => VISUAL_PRESET_IDS.includes(preset.id));
  assert.equal(visualPresets.length, 6);
  assert.deepEqual(
    new Set(visualPresets.map((preset) => preset.profile.visual_effect)),
    new Set(['ocean-wave', 'aurora', 'ripple', 'sun-sweep', 'spotlight', 'liquid-glass'])
  );
  for (const preset of visualPresets) {
    assert.equal(preset.category, 'Visual FX');
    assert.ok(preset.profile.intensity >= 70, `${preset.id} must read from TV distance`);
  }
});

test('TV presets keep a distance-readable visual signal', () => {
  const distanceReadable = ANIMATION_PRESETS.filter(({ profile }) => (
    profile.travel_px >= 10
    || profile.scale_amount >= 0.03
    || profile.brightness_amount >= 0.3
    || profile.visual_effect !== 'none'
  ));
  assert.ok(distanceReadable.length >= 22, `distance-readable presets: ${distanceReadable.length}/26`);

  for (const preset of ANIMATION_PRESETS.filter((item) => ['Dynamic', 'Promo'].includes(item.category))) {
    assert.ok(preset.profile.intensity >= 80, `${preset.id} is too weak for retail TV distance`);
  }
});

test('animation settings contract rejects invalid continuous motion controls', () => {
  const profile = ANIMATION_PRESETS[0].profile;
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'bad id', profile }), /Идентификатор пресета/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, event_duration_ms: 100 } }), /Длительность события/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, intensity: 101 } }), /Интенсивность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, pattern: 'slide-show' } }), /Характер движения/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, easing: 'random' } }), /Easing/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, visual_effect: 'unknown-fx' } }), /Визуальный эффект/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, promotion_effect: 'blink' } }), /Эффект акции/);
});

test('v3 profiles migrate structurally to v4 with a promotion channel', () => {
  const migrated = completeAnimationProfile({
    motion_version: 3,
    pattern: 'wave', flow_direction: 'left-to-right', easing: 'smooth', cycle_seconds: 9,
    event_duration_ms: 1600, wave_stagger_ms: 180, travel_px: 12, scale_amount: 0.03,
    brightness_amount: 0.25, section_effect: 'glow', item_effect: 'focus', price_effect: 'glow',
    visual_effect: 'aurora', intensity: 74
  });
  assert.equal(migrated.motion_version, 4);
  assert.equal(migrated.pattern, 'wave');
  assert.equal(migrated.visual_effect, 'aurora');
  assert.equal(migrated.promotion_effect, 'glow');
});

test('v2 profiles migrate structurally to v4 and discard removed background fields', () => {
  const migrated = completeAnimationProfile({
    motion_version: 2,
    pattern: 'wave', flow_direction: 'left-to-right', easing: 'smooth', cycle_seconds: 9,
    event_duration_ms: 1600, wave_stagger_ms: 180, travel_px: 12, scale_amount: 0.03,
    brightness_amount: 0.25, section_effect: 'glow', item_effect: 'focus', price_effect: 'glow',
    background_effect: 'zoom', background_zoom_percent: 7, visual_effect: 'aurora', intensity: 74
  });
  assert.equal(migrated.motion_version, 4);
  assert.equal(migrated.pattern, 'wave');
  assert.equal(migrated.visual_effect, 'aurora');
  assert.equal(migrated.promotion_effect, 'glow');
  assert.equal('background_effect' in migrated, false);
  assert.equal('background_zoom_percent' in migrated, false);
});

test('legacy entrance profile is migrated into always-visible continuous motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 4);
  assert.equal(migrated.pattern, 'wave');
  assert.equal(migrated.flow_direction, 'left-to-right');
  assert.equal(migrated.section_effect, 'glow');
  assert.equal(migrated.price_effect, 'pulse');
  assert.equal(migrated.promotion_effect, 'pulse-price');
  assert.equal(migrated.visual_effect, 'none');
  assert.equal('background_effect' in migrated, false);
  assert.equal('background_zoom_percent' in migrated, false);
  assert.equal('entrance' in migrated, false);
  assert.equal('opacity_from' in migrated, false);
});

test('animation studio uses real screen, promotion targets, Visual FX and continuous loop', async () => {
  const [html, app, navigation, config, css, previewCss, fxCss, page, player, screenPreview] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('css/pages/animation-screen-preview.css'), read('css/motion-effects.css'),
    read('js/pages/animation.js'), read('js/motion/preview-player.js'), read('js/motion/screen-preview.js')
  ]);
  assert.match(html, /data-page="animation"/);
  for (const id of ['animation-stage','animation-screen-select','animation-screen-status','animation-play','animation-pause','animation-replay','animation-timeline','animation-save','animation-pattern','animation-cycle','animation-section-effect','animation-visual-effect','animation-promotion-effect']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="animation-background-effect"|id="animation-background-zoom"/);
  assert.match(html, /26 ТВ-ПРЕСЕТОВ/);
  assert.match(html, /Морской прибой/);
  assert.match(html, /Liquid Glass/);
  assert.match(html, /Промо-канал/);
  assert.doesNotMatch(html, /animation-entrance|Тип появления|Начальная прозрачность|Появление<\/h2>/);
  assert.doesNotMatch(html, /animation-demo-|БИР КОМ СВЕТЛОЕ|ЖИГУЛЕВСКОЕ/);
  assert.match(html, /3–6 метров/);
  assert.match(navigation, /\/animation\.html/);
  assert.match(navigation, /\['Анимация', '\/animation\.html'\]/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);
  assert.match(page, /motion_version:4/);
  assert.match(page, /promotion_effect/);
  assert.match(page, /visual_effect/);
  assert.doesNotMatch(page, /background_effect|background_zoom_percent/);
  assert.match(page, /ANIMATION_PRESETS/);
  assert.match(page, /api\.get\(API\.screens\)/);
  assert.match(page, /renderAnimationScreenPreview/);
  assert.match(screenPreview, /data-motion-fx/);
  assert.match(screenPreview, /data\.motion = 'promotion'/);
  assert.match(screenPreview, /promotionPrice/);
  assert.doesNotMatch(screenPreview, /data-motion-background/);
  assert.match(screenPreview, /motion-fx-ocean/);
  assert.match(screenPreview, /buildRenderModel/);
  assert.match(screenPreview, /buildDisplayLines/);
  assert.match(screenPreview, /buildRenderLayout/);
  assert.match(screenPreview, /buildTableSvg/);
  assert.match(player, /function motionGain/);
  assert.match(player, /promotionEffect/);
  assert.match(player, /pulse-price/);
  assert.match(player, /PROMO_SHADOW/);
  assert.match(player, /Math\.sqrt\(/);
  assert.match(player, /animateVisualFx/);
  assert.match(player, /visual_effect/);
  assert.doesNotMatch(player, /backgroundFrames|background_effect|background_zoom_percent|data-motion-background/);
  assert.match(player, /iterations:\s*Infinity/);
  assert.match(player, /opacity:\s*1/);
  assert.doesNotMatch(player, /opacity_from|entranceTransform|clipFrames/);
  assert.match(player, /currentTime/);
  assert.match(css, /\.animation-stage/);
  assert.match(css, /aspect-ratio:16\/9/);
  assert.match(previewCss, /\.animation-screen-canvas\{z-index:2/);
  assert.match(fxCss, /\.animation-screen-fx\{[^}]*z-index:1/);
  assert.match(fxCss, /motion-fx-aurora/);
  assert.match(fxCss, /motion-fx-glass/);
});
