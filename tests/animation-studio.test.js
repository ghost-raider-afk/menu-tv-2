import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { completeAnimationProfile, DEFAULT_ENTITY_PROFILE } from '../src/shared/animation-profile.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const ENTITY_URL = '/site-assets/animation-entity-11111111-1111-4111-8111-111111111111.png';

test('animation studio ships exactly twenty continuous unique presets with additive entity defaults', () => {
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
    assert.deepEqual(parsed.profile.entity, DEFAULT_ENTITY_PROFILE);
  }
});

test('animation settings contract validates live entity placement and safe asset URLs', () => {
  const profile = ANIMATION_PRESETS[0].profile;
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'bad id', profile }), /Идентификатор пресета/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, event_duration_ms: 100 } }), /Длительность события/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, intensity: 101 } }), /Интенсивность/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, pattern: 'slide-show' } }), /Характер движения/);
  assert.throws(() => animationSettingsInput({ enabled: true, preset_id: 'custom', profile: { ...profile, easing: 'random' } }), /Easing/);

  const valid = animationSettingsInput({
    enabled: true,
    preset_id: 'custom',
    profile: {
      ...profile,
      entity: {
        ...DEFAULT_ENTITY_PROFILE,
        enabled: true,
        asset_url: ENTITY_URL,
        x_percent: 83.5,
        y_percent: 51.2,
        width_percent: 19.4,
        depth: 7,
        opacity: 94,
        idle_effect: 'alive',
        idle_amount: 44,
        idle_cycle_seconds: 7.2
      }
    }
  });
  assert.equal(valid.profile.entity.asset_url, ENTITY_URL);
  assert.equal(valid.profile.entity.x_percent, 83.5);
  assert.equal(valid.profile.entity.idle_effect, 'alive');

  assert.throws(() => animationSettingsInput({
    enabled: true, preset_id: 'custom', profile: { ...profile, entity: { ...DEFAULT_ENTITY_PROFILE, enabled: true, asset_url: 'https://evil.test/object.png' } }
  }), /студию анимации/);
  assert.throws(() => animationSettingsInput({
    enabled: true, preset_id: 'custom', profile: { ...profile, entity: { ...DEFAULT_ENTITY_PROFILE, width_percent: 0 } }
  }), /Размер объекта/);
  assert.throws(() => animationSettingsInput({
    enabled: true, preset_id: 'custom', profile: { ...profile, entity: { ...DEFAULT_ENTITY_PROFILE, idle_effect: 'random' } }
  }), /Idle-анимация объекта/);
});

test('legacy entrance profile is migrated into always-visible continuous motion with disabled entity by default', () => {
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
  assert.deepEqual(migrated.entity, DEFAULT_ENTITY_PROFILE);
});

test('animation studio exposes a draggable Live Entity editor on top of Motion Engine v3', async () => {
  const [
    html, app, navigation, config, css, previewCss, page, player, screenPreview,
    sceneGraph, domAdapter, entityDom, motionPlan, composer, runtime, timeline, waapiDriver
  ] = await Promise.all([
    read('animation.html'), read('js/application.js'), read('js/core/navigation.js'), read('js/core/config.js'),
    read('css/pages/animation.css'), read('css/pages/animation-screen-preview.css'), read('js/pages/animation.js'),
    read('js/motion/preview-player.js'), read('js/motion/screen-preview.js'), read('js/motion/scene-graph.js'),
    read('js/motion/dom-scene-adapter.js'), read('js/motion/entity-dom.js'), read('js/motion/motion-plan.js'), read('js/motion/scene-composer.js'),
    read('js/motion/scene-runtime.js'), read('js/motion/timeline.js'), read('js/motion/drivers/waapi-driver.js')
  ]);
  assert.match(html, /data-page="animation"/);
  for (const id of ['animation-stage','animation-screen-select','animation-screen-status','animation-play','animation-pause','animation-replay','animation-timeline','animation-save','animation-pattern','animation-cycle','animation-section-effect','animation-background-effect']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of ['animation-entity-enabled','animation-entity-file','animation-entity-choose','animation-entity-remove','animation-entity-x','animation-entity-y','animation-entity-width','animation-entity-depth','animation-entity-opacity','animation-entity-idle-effect','animation-entity-idle-amount','animation-entity-idle-cycle']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /animation-entrance|Тип появления|Начальная прозрачность|Появление<\/h2>/);
  assert.doesNotMatch(html, /animation-demo-|БИР КОМ СВЕТЛОЕ|ЖИГУЛЕВСКОЕ/);
  assert.match(html, /Живой объект/);
  assert.match(html, /перетащите его мышью или пальцем/);
  assert.match(navigation, /\/animation\.html/);
  assert.match(navigation, /\['Анимация', '\/animation\.html'\]/);
  assert.match(app, /initialiseAnimationStudio/);
  assert.match(config, /animationSettings:\s*'\/api\/settings\/animation'/);
  assert.match(config, /animationEntityAsset:\s*'\/api\/settings\/animation\/entity-asset'/);
  assert.match(page, /motion_version:\s*2/);
  assert.match(page, /ANIMATION_PRESETS/);
  assert.match(page, /renderDomEntity/);
  assert.match(page, /updateDomEntityPlacement/);
  assert.match(page, /setPointerCapture/);
  assert.match(page, /API\.animationEntityAsset/);
  assert.match(page, /api\.get\(API\.screens\)/);
  assert.match(page, /renderAnimationScreenPreview/);

  assert.match(screenPreview, /buildRenderModel/);
  assert.match(screenPreview, /buildDisplayLines/);
  assert.match(screenPreview, /buildRenderLayout/);
  assert.match(screenPreview, /buildTableSvg/);
  assert.match(screenPreview, /data-entity-layer/);
  assert.doesNotMatch(screenPreview, /buildDomMotionScene|compileMotionPlan|SceneRuntime/);

  assert.match(sceneGraph, /MOTION_SCENE_VERSION = 3/);
  assert.match(sceneGraph, /ENTITY:\s*'entity'/);
  assert.match(sceneGraph, /createMotionScene/);
  assert.match(sceneGraph, /transformOwner/);
  assert.doesNotMatch(sceneGraph, /querySelector|instanceof Element|\.animate\(/);

  assert.match(domAdapter, /buildDomMotionScene/);
  assert.match(domAdapter, /querySelector/);
  assert.match(domAdapter, /entity\.primary/);
  assert.match(domAdapter, /kind:\s*'entity'/);

  assert.match(entityDom, /motion-entity-placement/);
  assert.match(entityDom, /motion-entity-target/);
  assert.match(entityDom, /data-entity-placement/);
  assert.match(entityDom, /updateDomEntityPlacement/);
  assert.doesNotMatch(entityDom, /\.animate\(/);

  assert.match(motionPlan, /compileMenuMotionProgram/);
  assert.match(motionPlan, /compileAtmosphereProgram/);
  assert.match(motionPlan, /compileEntityProgram/);
  assert.match(motionPlan, /entity-idle/);
  assert.match(motionPlan, /DEFAULT_SCENE_COMPILERS/);
  assert.match(motionPlan, /claims:/);
  assert.doesNotMatch(motionPlan, /translate3d\(|drop-shadow\(|cubic-bezier\(/);

  assert.match(composer, /composeScenePrograms/);
  assert.match(composer, /Scene ownership conflict/);
  assert.match(composer, /KNOWN_CLAIMS|ownership/);

  assert.match(runtime, /export class SceneRuntime/);
  assert.match(runtime, /composeScenePrograms/);
  assert.match(runtime, /new MotionTimeline/);
  assert.doesNotMatch(runtime, /instanceof Element|querySelector|\.animate\(/);

  assert.match(timeline, /export class MotionTimeline/);
  assert.doesNotMatch(timeline, /instanceof Element|\.animate\(/);

  assert.match(waapiDriver, /export class WaapiMotionDriver/);
  assert.match(waapiDriver, /instanceof Element/);
  assert.match(waapiDriver, /translate3d\(/);
  assert.match(waapiDriver, /drop-shadow\(/);
  assert.match(waapiDriver, /cubic-bezier\(/);
  assert.match(waapiDriver, /track\.claims/);
  assert.match(waapiDriver, /\.animate\(/);

  assert.match(player, /new WaapiMotionDriver\(\)/);
  assert.match(player, /new SceneRuntime/);
  assert.match(player, /DEFAULT_SCENE_COMPILERS/);
  assert.match(player, /buildDomMotionScene\(this\.stage\)/);
  assert.match(player, /this\.runtime\.load/);
  assert.doesNotMatch(player, /new MotionTimeline|compileMotionPlan|\.animate\(/);
  assert.doesNotMatch(player, /opacity_from|entranceTransform|clipFrames/);
  assert.match(player, /currentTime/);

  assert.match(css, /\.animation-entity-card/);
  assert.match(css, /\.animation-entity-thumb/);
  assert.match(previewCss, /\.motion-entity-placement/);
  assert.match(previewCss, /\.motion-entity-target/);
  assert.match(previewCss, /touch-action:none/);
});
