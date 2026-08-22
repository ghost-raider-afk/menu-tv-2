import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput, customAnimationPresetInput } from '../src/contracts/animation.js';
import { completeAnimationProfile, PROMO_ROW_TINT_MAX } from '../src/shared/animation-profile.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const projectRoot = new URL('../', import.meta.url);
const readPublic = (path) => readFile(new URL(path, publicRoot), 'utf8');
const readProject = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('Motion Studio exposes one canonical editable base style', () => {
  assert.equal(ANIMATION_PRESETS.length, 1);
  assert.equal(ANIMATION_PRESETS[0].id, 'custom-base');
  const parsed = animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: ANIMATION_PRESETS[0].profile });
  assert.equal(parsed.profile.motion_version, 5);
  assert.equal(parsed.profile.promo_style.enabled, true);
  assert.equal(parsed.profile.promo_style.row_effect, 'sweep');
  assert.equal(parsed.profile.brand_reveal.enabled, false);
  assert.equal('background_effect' in parsed.profile, false);
  assert.equal('background_zoom_percent' in parsed.profile, false);
});

test('v4 promotion channel migrates into the v5 promo style', () => {
  const migrated = completeAnimationProfile({
    motion_version: 4,
    pattern: 'wave', flow_direction: 'left-to-right', easing: 'smooth', cycle_seconds: 9,
    event_duration_ms: 1600, wave_stagger_ms: 180, travel_px: 12, scale_amount: 0.03,
    brightness_amount: 0.25, section_effect: 'glow', item_effect: 'focus', price_effect: 'pulse',
    promotion_effect: 'pulse-price', visual_effect: 'none', intensity: 80
  });
  assert.equal(migrated.motion_version, 5);
  assert.equal(migrated.promo_style.badge_effect, 'pulse');
  assert.equal(migrated.promo_style.price_effect, 'pulse');
  assert.equal(migrated.brand_reveal.enabled, false);
  assert.equal('promotion_effect' in migrated, false);
});

test('Brand Reveal and promo style contracts validate editable bounds', () => {
  const profile = structuredClone(ANIMATION_PRESETS[0].profile);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: { ...profile, promo_style: { ...profile.promo_style, badge_scale: 2 } } }), /Масштаб плашки/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: { ...profile, promo_style: { ...profile.promo_style, row_tint: PROMO_ROW_TINT_MAX + 0.01 } } }), /Подложка строки акции/);
  const zeroTint = animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: { ...profile, promo_style: { ...profile.promo_style, row_tint: 0 } } });
  assert.equal(zeroTint.profile.promo_style.row_tint, 0);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: { ...profile, brand_reveal: { ...profile.brand_reveal, flight_ms: 100 } } }), /Полёт Brand Reveal/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom-base', profile: { ...profile, brand_reveal: { ...profile.brand_reveal, order: 'explode' } } }), /Порядок букв/);
  assert.throws(() => customAnimationPresetInput({ name: '', profile }), /Название пресета/);
  const custom = customAnimationPresetInput({ name: 'Вечерняя акция', profile });
  assert.equal(custom.name, 'Вечерняя акция');
  assert.equal(custom.profile.motion_version, 5);
});

test('custom animation presets are first-class database and API resources', async () => {
  const [schema, migration, repository, routes, config] = await Promise.all([
    readProject('src/db/migrations/schema.js'),
    readProject('src/db/migrations/animation-settings.js'),
    readProject('src/db/settings.js'),
    readProject('src/api/settings/routes.js'),
    readPublic('js/core/config.js')
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS animation_presets/);
  assert.match(schema, /animation_presets_name_lower_unique/);
  assert.match(migration, /completeAnimationProfile/);
  assert.match(repository, /listAnimationPresets/);
  assert.match(repository, /createAnimationPreset/);
  assert.match(repository, /updateAnimationPreset/);
  assert.match(repository, /deleteAnimationPreset/);
  assert.match(routes, /\/animation\/presets/);
  assert.match(routes, /customAnimationPresetInput/);
  assert.match(config, /animationPresets:\s*'\/api\/settings\/animation\/presets'/);
});

test('Motion Studio edits promo, Brand Reveal and named user presets', async () => {
  const [html, page, player, screenPreview, renderer] = await Promise.all([
    readPublic('animation.html'),
    readPublic('js/pages/animation.js'),
    readPublic('js/motion/preview-player.js'),
    readPublic('js/motion/screen-preview.js'),
    readPublic('js/editor/renderer.js')
  ]);
  for (const id of [
    'animation-preset-select','animation-preset-name','animation-preset-save-as','animation-preset-update','animation-preset-delete',
    'promo-badge-effect','promo-row-effect','promo-price-effect','promo-row-tint','brand-enabled','brand-text','brand-start-scale',
    'brand-hold-ms','brand-flight-ms','brand-stagger-ms','brand-order','brand-trigger','brand-interval-seconds'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /26 ТВ-ПРЕСЕТОВ/);
  assert.match(html, /Один канонический стиль/);
  assert.match(html, /каждая буква улетает точно в своё место/);
  assert.match(html, /id="promo-row-tint" type="range" min="0" max="0\.18"/);
  assert.match(html, /0 — фон полностью скрыт/);
  assert.match(page, /motion_version:\s*5/);
  assert.match(page, /promo_style/);
  assert.match(page, /brand_reveal/);
  assert.match(page, /api\.post\(API\.animationPresets/);
  assert.match(page, /api\.put\(`\$\{API\.animationPresets\}/);
  assert.match(page, /api\.delete\(`\$\{API\.animationPresets\}/);
  assert.match(renderer, /<g class="promotion-badge-group">[\s\S]*class="promotion-badge"[\s\S]*class="promotion"/);
  assert.match(screenPreview, /composePromoBadge/);
  assert.match(screenPreview, /badge\.dataset\.motionPromoBadge = 'true'/);
  assert.doesNotMatch(screenPreview, /label\.dataset\.motionPromoBadge|shape\.dataset\.motionPromoBadge/);
  assert.match(screenPreview, /promotion-row-highlight/);
  assert.match(screenPreview, /promotion-row-sweep/);
  assert.match(screenPreview, /data\.brandTarget/);
  assert.match(player, /g\.promotion-badge-group\[data-motion-promo-badge="true"\]/);
  assert.match(player, /style\.enabled === false\s*\? 0/);
  assert.doesNotMatch(player, /Number\(style\.row_tint\) \|\| 0\.18/);
  assert.match(player, /animatePromoStyle/);
  assert.match(player, /brandDestinations/);
  assert.match(player, /getStartPositionOfChar/);
  assert.match(player, /getExtentOfChar/);
  assert.match(player, /brandOrderRanks/);
  assert.match(player, /prefers-reduced-motion/);
  assert.doesNotMatch(player, /background_effect|background_zoom_percent|data-motion-background/);
});
