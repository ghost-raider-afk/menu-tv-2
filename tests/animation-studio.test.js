import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { announcementInput } from '../src/contracts/announcement.js';
import { completeAnimationProfile, DEFAULT_ANIMATION_PROFILE } from '../src/shared/animation-profile.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('canonical profile is cinematic, readable and keeps background structurally static', () => {
  const profile = completeAnimationProfile({});
  assert.equal(profile.motion_version, 3);
  assert.equal(profile.pattern, 'cinematic');
  assert.equal(profile.section_effect, 'cinematic');
  assert.equal(profile.item_effect, 'cinematic');
  assert.equal(profile.price_effect, 'glow');
  assert.equal('background_effect' in profile, false);
  assert.equal('background_zoom_percent' in profile, false);
  assert.equal(profile.promotion_effect, 'cinematic');
  assert.ok(profile.promotion_intensity > profile.intensity);
  const parsed = animationSettingsInput({ enabled: true, preset_id: 'cinematic-live-menu', profile: DEFAULT_ANIMATION_PROFILE, announcement: {} });
  assert.equal(parsed.preset_id, 'cinematic-live-menu');
  assert.equal(parsed.profile.promotion_easing, 'elastic');
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
});

test('legacy animation data migrates into current profile without background motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 3);
  assert.equal('background_effect' in migrated, false);
  assert.equal(migrated.promotion_effect, 'cinematic');
});

test('Motion Studio exposes one consolidated editor and independent high-attention promotion controls', async () => {
  const [html, page, profileEditor, motionPlan, domAdapter, previewPlayer, previewCss, announcement] = await Promise.all([
    read('animation.html'),
    read('js/pages/animation.js'),
    read('js/motion/profile-editor.js'),
    read('js/motion/motion-plan.js'),
    read('js/motion/dom-scene-adapter.js'),
    read('js/motion/preview-player.js'),
    read('css/pages/animation-screen-preview.css'),
    read('js/motion/announcement.js')
  ]);

  for (const id of [
    'animation-stage','animation-screen-select','animation-save','animation-intensity','animation-travel','animation-scale',
    'animation-section-effect','animation-item-effect','animation-price-effect','animation-promotion-effect',
    'animation-promotion-intensity','animation-promotion-scale','animation-promotion-glow','animation-announcement-enabled'
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.doesNotMatch(html, /20 ПРЕСЕТОВ|animation-presets/);
  assert.match(html, /Живое меню/);
  assert.match(html, /ФОН · STATIC/);
  assert.match(html, /PROMO ATTENTION/);
  assert.match(page, /PROFILE_ID = 'cinematic-live-menu'/);
  assert.match(page, /readMotionProfile/);
  assert.match(page, /writeMotionProfile/);
  assert.match(profileEditor, /promotion_intensity/);
  assert.match(profileEditor, /promotion_glow_radius/);
  assert.match(previewPlayer, /DEFAULT_SCENE_COMPILERS/);
  assert.match(motionPlan, /compilePromotionMotionProgram/);
  assert.doesNotMatch(motionPlan, /backgroundFrames|background_effect|background_zoom_percent/);
  assert.doesNotMatch(domAdapter, /kind: 'background'/);
  assert.doesNotMatch(domAdapter, /kind: 'shimmer'/);
  assert.match(previewCss, /\.animation-screen-background\{[^}]*background-size:cover/);
  assert.match(announcement, /renderAnnouncementLayer/);
});
