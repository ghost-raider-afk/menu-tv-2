import assert from 'node:assert/strict';
import test from 'node:test';
import { toWaapiKeyframe, toWaapiTiming } from '../src/web/admin-ui/public/js/motion/drivers/waapi-driver.js';
import {
  compileAtmosphereProgram,
  compileMenuMotionProgram,
  compileMotionPlan,
  DEFAULT_SCENE_COMPILERS
} from '../src/web/admin-ui/public/js/motion/motion-plan.js';
import { profileForPreset } from '../src/web/admin-ui/public/js/motion/presets.js';
import { composeScenePrograms, createSceneProgram } from '../src/web/admin-ui/public/js/motion/scene-composer.js';
import { createMotionScene, MOTION_LAYERS } from '../src/web/admin-ui/public/js/motion/scene-graph.js';
import { SceneRuntime } from '../src/web/admin-ui/public/js/motion/scene-runtime.js';
import { MotionTimeline } from '../src/web/admin-ui/public/js/motion/timeline.js';

function fakeScene() {
  const target = (name) => ({ name });
  return createMotionScene({
    root: { renderer: 'fake' },
    nodes: [
      { id: 'menu.item.0', kind: 'item', layer: 'menu', target: target('item'), order: 0, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'menu.promotion.0', kind: 'promotion', layer: 'menu', target: target('promotion'), order: 0, count: 2, depth: 1, transformOwner: 'self' },
      { id: 'menu.item.1', kind: 'item', layer: 'menu', target: target('item2'), order: 1, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'background.primary', kind: 'background', layer: 'background', target: target('background'), order: 0, count: 1, depth: -10, transformOwner: 'self' },
      { id: 'atmosphere.shimmer', kind: 'shimmer', layer: 'atmosphere', target: target('shimmer'), order: 0, count: 1, depth: 10, transformOwner: 'self' },
      { id: 'entity.future.0', kind: 'entity', layer: 'entity', target: target('future-entity'), order: 0, count: 1, depth: 20, transformOwner: 'entity-runtime' }
    ]
  });
}

function activeProfile() {
  return {
    ...profileForPreset('accent-pulse'),
    pattern: 'wave',
    flow_direction: 'left-to-right',
    item_effect: 'pulse',
    promotion_effect: 'pulse',
    section_effect: 'shimmer',
    price_effect: 'none',
    background_effect: 'drift',
    cycle_seconds: 8,
    wave_stagger_ms: 120
  };
}

function fakeDriver() {
  const calls = [];
  const handles = [];
  return {
    calls,
    handles,
    createTrack(track) {
      const handle = { kind: 'track', time: 0, state: 'running', track };
      handles.push(handle);
      return handle;
    },
    createClock(root, clock) {
      const handle = { kind: 'clock', time: 0, state: 'running', root, clock };
      handles.push(handle);
      return handle;
    },
    play(handle) { handle.state = 'running'; calls.push(['play', handle.kind]); },
    pause(handle) { handle.state = 'paused'; calls.push(['pause', handle.kind]); },
    cancel(handle) { handle.state = 'idle'; calls.push(['cancel', handle.kind]); },
    seek(handle, time) { handle.time = time; calls.push(['seek', handle.kind, time]); },
    currentTime(handle) { return handle?.time || 0; },
    playState(handle) { return handle?.state || 'idle'; }
  };
}

test('scene graph is renderer agnostic and already reserves the live entity layer', () => {
  const scene = fakeScene();
  assert.equal(scene.version, 3);
  assert.ok(scene.layers.includes(MOTION_LAYERS.ENTITY));
  assert.equal(scene.node('menu.promotion.0').depth, 1);
  assert.equal(scene.node('menu.promotion.0').target.name, 'promotion');
  assert.equal(scene.node('menu.promotion.0').transformOwner, 'self');
  assert.equal(scene.node('entity.future.0').transformOwner, 'entity-runtime');
  assert.equal(scene.find('item').length, 2);
  assert.equal(scene.find('entity').length, 1);
  assert.throws(() => createMotionScene({
    root: {},
    nodes: [
      { id: 'same', kind: 'item', layer: 'menu', target: {} },
      { id: 'same', kind: 'item', layer: 'menu', target: {} }
    ]
  }), /Duplicate motion scene node id/);
});

test('Motion Engine v3 composes independent menu and atmosphere programs into one driver-neutral plan', () => {
  const scene = fakeScene();
  const profile = activeProfile();
  const plan = compileMotionPlan(scene, profile);

  assert.equal(plan.version, 3);
  assert.equal(plan.duration, 8000);
  assert.equal(plan.clock.loop, true);
  assert.deepEqual(plan.programs.map((program) => program.id), ['menu-motion', 'atmosphere']);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.tracks));

  const item = plan.tracks.find((track) => track.node.id === 'menu.item.0');
  const promotion = plan.tracks.find((track) => track.node.id === 'menu.promotion.0');
  const secondItem = plan.tracks.find((track) => track.node.id === 'menu.item.1');
  const background = plan.tracks.find((track) => track.node.id === 'background.primary');
  const shimmer = plan.tracks.find((track) => track.node.id === 'atmosphere.shimmer');

  assert.ok(item);
  assert.ok(promotion);
  assert.ok(secondItem);
  assert.ok(background);
  assert.ok(shimmer);
  assert.equal(plan.tracks.some((track) => track.node.kind === 'entity'), false, 'default compilers must not own future entity behavior');
  assert.equal(item.timing.delay, promotion.timing.delay, 'promotion keeps the row phase while owning an independent effect');
  assert.equal(secondItem.timing.delay, 120);
  assert.deepEqual(item.claims, ['transform', 'opacity', 'appearance']);
  assert.deepEqual(promotion.claims, ['transform', 'opacity', 'appearance']);
  assert.deepEqual(background.claims, ['transform']);
  assert.deepEqual(shimmer.claims, ['transform', 'opacity']);
  assert.equal(plan.ownership['menu.item.0:transform'], 'menu-motion');
  assert.equal(plan.ownership['menu.promotion.0:transform'], 'menu-motion');
  assert.equal(plan.ownership['atmosphere.shimmer:opacity'], 'atmosphere');
  assert.equal(typeof item.keyframes[1].transform.scale, 'number');
  assert.equal(typeof item.keyframes[1].appearance.brightness, 'number');
  assert.notDeepEqual(item.keyframes, promotion.keyframes, 'promotion accent must not inherit the row animation frames');
  assert.equal(item.keyframes[1].appearance.glowColor, null);
  assert.equal(promotion.keyframes[1].appearance.glowColor, 'rgba(244,201,21,.58)');
  assert.ok(promotion.keyframes[1].appearance.glowRadius > 0);
  assert.equal(JSON.stringify(plan).includes('translate3d('), false);
  assert.equal(JSON.stringify(plan).includes('drop-shadow('), false);
});

test('scene composer rejects competing ownership and allows independent channels on one node', () => {
  const scene = fakeScene();
  const node = scene.node('menu.item.0');
  const timing = { duration: 8000, delay: 0, easing: 'smooth', loop: true };
  const keyframes = [{ offset: 0 }, { offset: 1 }];
  const transformProgram = createSceneProgram({
    id: 'transform-owner', duration: 8000,
    tracks: [{ node, claims: ['transform'], keyframes, timing }]
  });
  const appearanceProgram = createSceneProgram({
    id: 'appearance-owner', duration: 8000,
    tracks: [{ node, claims: ['appearance'], keyframes, timing }]
  });
  const conflictingProgram = createSceneProgram({
    id: 'conflicting-owner', duration: 8000,
    tracks: [{ node, claims: ['transform'], keyframes, timing }]
  });

  const composed = composeScenePrograms(scene, [transformProgram, appearanceProgram]);
  assert.equal(composed.tracks.length, 2);
  assert.equal(composed.ownership['menu.item.0:transform'], 'transform-owner');
  assert.equal(composed.ownership['menu.item.0:appearance'], 'appearance-owner');
  assert.throws(
    () => composeScenePrograms(scene, [transformProgram, conflictingProgram]),
    /Scene ownership conflict for menu\.item\.0:transform/
  );
});

test('menu and atmosphere compilers remain independently callable for future runtime composition', () => {
  const scene = fakeScene();
  const context = { profile: activeProfile() };
  const menu = compileMenuMotionProgram(scene, context);
  const atmosphere = compileAtmosphereProgram(scene, context);
  assert.equal(menu.id, 'menu-motion');
  assert.equal(atmosphere.id, 'atmosphere');
  assert.equal(menu.tracks.some((track) => track.node.layer === 'atmosphere'), false);
  assert.equal(atmosphere.tracks.every((track) => track.node.layer === 'atmosphere'), true);
  assert.equal(DEFAULT_SCENE_COMPILERS.length, 2);
});

test('WAAPI driver alone converts only claimed canonical channels into browser CSS', () => {
  const state = {
    offset: 0.5,
    opacity: 0.8,
    transform: { x: 12.5, y: -4, z: 0, xPercent: null, scale: 1.04, skewXDeg: 0, order: 'translate-scale' },
    appearance: { brightness: 1.12, glowRadius: 8.5, glowColor: 'rgba(1,2,3,.5)' }
  };
  const keyframe = toWaapiKeyframe(state);
  assert.equal(keyframe.offset, 0.5);
  assert.equal(keyframe.opacity, 0.8);
  assert.equal(keyframe.transform, 'translate3d(12.50px, -4.00px, 0.00px) scale(1.0400)');
  assert.equal(keyframe.filter, 'brightness(1.120) drop-shadow(0 0 8.5px rgba(1,2,3,.5))');

  const transformOnly = toWaapiKeyframe(state, ['transform']);
  assert.deepEqual(Object.keys(transformOnly).sort(), ['offset', 'transform']);

  const timing = toWaapiTiming({ duration: 8000, delay: 120, easing: 'smooth', loop: true });
  assert.equal(timing.duration, 8000);
  assert.equal(timing.delay, 120);
  assert.equal(timing.easing, 'cubic-bezier(.16,1,.3,1)');
  assert.equal(timing.iterations, Infinity);
  assert.equal(timing.fill, 'both');
});

test('SceneRuntime compiles multiple programs and owns one master timeline independently from renderer', () => {
  const scene = fakeScene();
  const driver = fakeDriver();
  const runtime = new SceneRuntime({
    root: scene.root,
    driver,
    compilers: DEFAULT_SCENE_COMPILERS
  });
  const plan = runtime.load({ scene, context: { profile: activeProfile() } });

  assert.equal(plan.programs.length, 2);
  assert.equal(runtime.timeline.allHandles().length, plan.tracks.length + 1);
  assert.equal(runtime.seek(9000), 8000);
  assert.equal(runtime.currentTime(), 8000);
  runtime.pause();
  assert.equal(runtime.playState(), 'paused');
  runtime.replay();
  assert.equal(runtime.currentTime(), 0);
  assert.equal(runtime.playState(), 'running');
  runtime.destroy();
  assert.ok(driver.calls.some(([action]) => action === 'cancel'));
});

test('MotionTimeline remains usable below SceneRuntime as a renderer-neutral playback primitive', () => {
  const driver = fakeDriver();
  const plan = {
    duration: 8000,
    tracks: [{ node: { id: 'x' }, claims: ['transform'], keyframes: [], timing: {} }],
    clock: { duration: 8000, loop: true }
  };
  const opaqueRoot = { renderer: 'future-gpu-driver' };
  const timeline = new MotionTimeline({ root: opaqueRoot, driver }).load(plan);
  assert.equal(timeline.duration, 8000);
  assert.equal(timeline.allHandles().length, 2);
  assert.equal(driver.handles.find((handle) => handle.kind === 'clock').root, opaqueRoot);
  timeline.destroy();
});
