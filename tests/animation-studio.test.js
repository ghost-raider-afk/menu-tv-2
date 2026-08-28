import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { announcementInput } from '../src/contracts/announcement.js';
import { brandTitleInput } from '../src/contracts/brand-title.js';
import { environmentInput, environmentFromLegacyAquarium } from '../src/contracts/environment.js';
import { completeAnimationProfile, DEFAULT_ANIMATION_PROFILE } from '../src/shared/animation-profile.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('canonical profile keeps static menu text, static background and smooth promotion glow', () => {
  const profile = completeAnimationProfile({});
  assert.equal(profile.motion_version, 3);
  assert.equal(profile.pattern, 'cinematic');
  assert.equal(profile.section_effect, 'cinematic');
  assert.equal(profile.item_effect, 'cinematic');
  assert.equal(profile.price_effect, 'none');
  assert.equal('background_effect' in profile, false);
  assert.equal('background_zoom_percent' in profile, false);
  assert.equal(profile.promotion_effect, 'cinematic');
  assert.equal(profile.promotion_easing, 'smooth');
  assert.equal(profile.promotion_travel_px, 0);
  assert.ok(profile.promotion_scale_amount >= 0.03 && profile.promotion_scale_amount <= 0.08);
  const parsed = animationSettingsInput({
    enabled: true,
    preset_id: 'cinematic-live-menu',
    profile: DEFAULT_ANIMATION_PROFILE,
    announcement: {},
    brand: {},
    environment: {}
  });
  assert.equal(parsed.preset_id, 'cinematic-live-menu');
  assert.equal(parsed.profile.price_effect, 'none');
  assert.equal(parsed.profile.promotion_easing, 'smooth');
  assert.equal(parsed.brand.text, '');
  assert.equal(parsed.environment.enabled, false);
  assert.equal(parsed.environment.effect, 'none');
});

test('announcement contract validates font, vertical stretch and independent row glow', () => {
  const parsed = announcementInput({
    enabled: true, text: 'Сегодня скидка 10%', position: 'bottom', speed_px_per_second: 90, font_size: 34,
    font_family: 'oswald', vertical_scale: 1.35, text_color: '#FFFFFF', background_color: '#101317',
    background_opacity: 0.8, glow_enabled: true, glow_color: '#35D9FF', glow_strength: 16
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.text, 'Сегодня скидка 10%');
  assert.equal(parsed.font_family, 'oswald');
  assert.equal(parsed.vertical_scale, 1.35);
  assert.equal(parsed.glow_enabled, true);
  assert.throws(() => announcementInput({ enabled: true, text: '' }), /Введите текст объявления/);
  assert.throws(() => announcementInput({ enabled: true, text: 'x', font_family: 'remote-font' }), /Шрифт бегущей строки/);
});

test('brand title and environment effect are independent validated scene layers', () => {
  const brand = brandTitleInput({
    enabled: true,
    text: 'БАР\nМАЯК',
    x: 240,
    y: 110,
    font_family: 'montserrat',
    vertical_scale: 1.2,
    line_spacing: -18,
    effect: 'neon-pulse'
  });
  assert.equal(brand.text, 'БАР\nМАЯК');
  assert.equal(brand.x, 240);
  assert.equal(brand.vertical_scale, 1.2);
  assert.equal(brand.line_spacing, -18);
  assert.equal(brand.effect, 'neon-pulse');
  assert.equal(brandTitleInput({}).text, '');
  assert.throws(() => brandTitleInput({ enabled: true, text: '' }), /Введите название бренда/);

  const environment = environmentInput({
    enabled: true,
    effect: 'aquarium',
    parameters: { style: 'neon', intro_fill: true, fish_count: 4, bubble_density: 50, plant_density: 30, caustics: 60, speed: 40 }
  });
  assert.equal(environment.enabled, true);
  assert.equal(environment.effect, 'aquarium');
  assert.equal(environment.parameters.style, 'neon');
  assert.equal(environment.parameters.fish_count, 4);
});

test('legacy aquarium settings are converted to an environment effect without becoming a layer', () => {
  const environment = environmentFromLegacyAquarium({
    enabled: true,
    style: 'reef',
    intro_fill: false,
    fish_count: 5,
    bubble_density: 44,
    plant_density: 22,
    caustics: 61,
    speed: 37
  });
  assert.deepEqual(environment, {
    enabled: true,
    effect: 'aquarium',
    parameters: {
      style: 'reef', intro_fill: false, intensity: 45, fish_count: 5,
      bubble_density: 44, plant_density: 22, caustics: 61, speed: 37
    }
  });
});

test('legacy animation data migrates without background or independent price motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 3);
  assert.equal('background_effect' in migrated, false);
  assert.equal(migrated.price_effect, 'none');
  assert.equal(migrated.promotion_effect, 'cinematic');
  assert.equal(migrated.promotion_easing, 'smooth');
  assert.equal(migrated.promotion_scale_amount, 0.06);
});

test('stored v3 bounce/pop settings are canonicalized instead of reintroducing jerking', () => {
  const migrated = completeAnimationProfile({
    ...DEFAULT_ANIMATION_PROFILE,
    motion_version: 3,
    price_effect: 'pop',
    promotion_effect: 'bounce',
    promotion_easing: 'elastic',
    promotion_scale_amount: 0.2,
    promotion_travel_px: 24
  });
  assert.equal(migrated.price_effect, 'none');
  assert.equal(migrated.promotion_effect, 'cinematic');
  assert.equal(migrated.promotion_easing, 'smooth');
  assert.equal(migrated.promotion_scale_amount, 0.08);
  assert.equal(migrated.promotion_travel_px, 0);
});

test('Motion Studio exposes generic scene layers, Aquarium environment effect and Video Entity v2', async () => {
  const [html, page, profileEditor, motionPlan, domAdapter, liveMotion, previewCss, announcement, overlays, brandCss, environment] = await Promise.all([
    read('animation.html'), read('js/pages/animation.js'), read('js/motion/profile-editor.js'),
    read('js/motion/motion-plan.js'), read('js/motion/dom-scene-adapter.js'), read('js/motion/live-menu-motion.js'),
    read('css/pages/animation-screen-preview.css'), read('js/motion/announcement.js'), read('css/motion-overlays.css'),
    read('css/brand-motion-v2.css'), read('js/motion/environment.js')
  ]);

  for (const id of [
    'animation-stage','animation-screen-select','animation-save','animation-intensity','animation-travel','animation-scale',
    'animation-section-effect','animation-item-effect','animation-promotion-effect','animation-promotion-intensity',
    'animation-promotion-scale','animation-promotion-glow','animation-announcement-enabled','animation-announcement-font-family',
    'animation-announcement-vertical-scale','animation-announcement-glow-enabled','animation-brand-enabled','animation-brand-x',
    'animation-brand-y','animation-brand-effect','animation-brand-line-spacing','animation-aquarium-enabled','animation-aquarium-style',
    'animation-aquarium-replay','animation-entity-file','animation-entity-loop','animation-entity-muted','animation-entity-playback-rate'
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.doesNotMatch(html, /id="animation-price-effect"/);
  assert.match(html, /MIRA WASM MOTION/);
  assert.match(html, /ФОН · БЕЗ ИЗМЕНЕНИЙ/);
  assert.match(html, /PROMO GLOW PULSE/);
  assert.match(html, /ENVIRONMENT · AQUARIUM/);
  assert.match(html, /Отдельного архитектурного слоя Aquarium нет/);
  assert.match(html, /BRAND ENTITY/);
  assert.match(html, /video\/mp4,video\/webm/);
  assert.match(page, /renderEnvironmentLayer/);
  assert.match(page, /environment:\s*aquariumEnvironment/);
  assert.match(page, /resetEnvironmentIntro/);
  assert.doesNotMatch(page, /normaliseAquarium|renderAquariumLayer|resetAquariumIntro/);
  assert.match(page, /ENTITY_MEDIA_TYPES/);
  assert.match(page, /createEntityMedia/);
  assert.match(profileEditor, /profile\.price_effect = 'none'/);
  assert.match(profileEditor, /promotion_scale_amount = clamp/);
  assert.match(liveMotion, /WasmMotionDriver/);
  assert.match(motionPlan, /menuTextStatic: true/);
  assert.match(motionPlan, /procedural:/);
  assert.doesNotMatch(motionPlan, /keyframes:/);
  assert.doesNotMatch(domAdapter, /kind: 'background'/);
  assert.doesNotMatch(domAdapter, /kind: 'price'/);
  assert.match(domAdapter, /row-motion-surface-item/);
  assert.match(previewCss, /\.animation-screen-background\{[^}]*background-size:cover/);
  assert.match(announcement, /scene-announcement-glyphs/);
  assert.match(overlays, /scene-environment-layer/);
  assert.doesNotMatch(overlays, /scene-aquarium-layer|tv-player-aquarium-layer|animation-screen-aquarium-layer/);
  assert.doesNotMatch(overlays, /scene-brand-title/);
  assert.match(brandCss, /scene-brand-title/);
  assert.match(brandCss, /--brand-line-spacing/);
  assert.match(environment, /function renderAquariumEffect/);
  assert.match(environment, /classList\.add\('environment-effect-aquarium',/);
  assert.match(environment, /environment\.effect === 'aquarium'/);
});
