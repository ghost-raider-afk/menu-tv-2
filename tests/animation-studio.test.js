import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { announcementInput } from '../src/contracts/announcement.js';
import { completeAnimationProfile, DEFAULT_ANIMATION_PROFILE } from '../src/shared/animation-profile.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('canonical animation profile keeps the menu calm and promotion independent', () => {
  const profile = completeAnimationProfile({});
  assert.equal(profile.motion_version, 2);
  assert.equal(profile.section_effect, 'none');
  assert.equal(profile.item_effect, 'none');
  assert.equal(profile.price_effect, 'none');
  assert.equal(profile.background_effect, 'none');
  assert.equal(profile.promotion_effect, 'pulse');
  const parsed = animationSettingsInput({ enabled: true, preset_id: 'single-promo-focus', profile: DEFAULT_ANIMATION_PROFILE, announcement: {} });
  assert.equal(parsed.preset_id, 'single-promo-focus');
  assert.equal(parsed.profile.promotion_effect, 'pulse');
});

test('old profile without promotion effect preserves its previous item behavior', () => {
  const profile = completeAnimationProfile({ ...DEFAULT_ANIMATION_PROFILE, item_effect: 'focus', promotion_effect: undefined });
  assert.equal(profile.item_effect, 'focus');
  assert.equal(profile.promotion_effect, 'focus');
});

test('announcement contract validates an independent ticker', () => {
  const parsed = announcementInput({
    enabled: true,
    text: 'Сегодня скидка 10%',
    position: 'bottom',
    speed_px_per_second: 90,
    font_size: 34,
    text_color: '#FFFFFF',
    background_color: '#101317',
    background_opacity: 0.8
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.text, 'Сегодня скидка 10%');
  assert.throws(() => announcementInput({ enabled: true, text: '' }), /Введите текст объявления/);
  assert.throws(() => announcementInput({ enabled: false, text: '', speed_px_per_second: 10 }), /Скорость бегущей строки/);
});

test('legacy entrance profile is migrated into continuous motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 2);
  assert.equal(migrated.pattern, 'wave');
  assert.equal(migrated.promotion_effect, migrated.item_effect);
  assert.equal('entrance' in migrated, false);
});

test('motion studio exposes one promotion-focused profile and independent scene layers', async () => {
  const [
    html, app, navigation, config, css, previewCss, page, previewPlayer, screenPreview,
    sceneGraph, domAdapter, motionPlan, composer, runtime, timeline, waapiDriver, announcement
  ] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('css/pages/animation-screen-preview.css'), read('js/pages/animation.js'),
    read('js/motion/preview-player.js'), read('js/motion/screen-preview.js'), read('js/motion/scene-graph.js'),
    read('js/motion/dom-scene-adapter.js'), read('js/motion/motion-plan.js'), read('js/motion/scene-composer.js'),
    read('js/motion/scene-runtime.js'), read('js/motion/timeline.js'), read('js/motion/drivers/waapi-driver.js'),
    read('js/motion/announcement.js')
  ]);

  for (const id of ['animation-stage','animation-screen-select','animation-play','animation-pause','animation-replay','animation-timeline','animation-save','animation-intensity','animation-announcement-enabled','animation-announcement-text']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /20 ПРЕСЕТОВ|animation-presets|animation-pattern|animation-section-effect|animation-background-effect/);
  assert.match(html, /Плашка «Акция»/);
  assert.match(html, /Бегущая строка/);
  assert.match(page, /PROFILE_ID = 'single-promo-focus'/);
  assert.match(page, /promotion_effect:\s*'pulse'/);
  assert.doesNotMatch(page, /ANIMATION_PRESETS|PRESET_BY_ID|profileForPreset/);
  assert.match(page, /renderAnnouncementLayer/);
  assert.match(page, /api\.get\(API\.screens\)/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(navigation, /\/animation\.html/);
  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);

  assert.match(screenPreview, /data-announcement-layer/);
  assert.match(previewCss, /overflow:hidden/);
  assert.doesNotMatch(previewCss, /inset:-4%/);
  assert.match(previewCss, /scene-announcement-marquee/);
  assert.match(announcement, /normaliseAnnouncement/);
  assert.match(announcement, /renderAnnouncementLayer/);

  assert.match(sceneGraph, /MOTION_SCENE_VERSION = 3/);
  assert.match(sceneGraph, /ENTITY:\s*'entity'/);
  assert.match(domAdapter, /kind: 'promotion'/);
  assert.match(motionPlan, /profile\.promotion_effect/);
  assert.match(motionPlan, /kind === 'promotion'/);
  assert.match(composer, /composeScenePrograms/);
  assert.match(runtime, /export class SceneRuntime/);
  assert.match(timeline, /export class MotionTimeline/);
  assert.match(waapiDriver, /export class WaapiMotionDriver/);
  assert.match(previewPlayer, /new SceneRuntime/);
  assert.match(css, /\.animation-simple-grid/);
});
