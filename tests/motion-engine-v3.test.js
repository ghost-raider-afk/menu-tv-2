import assert from 'node:assert/strict';
import test from 'node:test';
import { toWaapiKeyframe, toWaapiTiming } from '../src/web/admin-ui/public/js/motion/drivers/waapi-driver.js';
import {
  compileMenuMotionProgram,
  compilePromotionMotionProgram,
  compileMotionPlan,
  DEFAULT_SCENE_COMPILERS
} from '../src/web/admin-ui/public/js/motion/motion-plan.js';
import { composeScenePrograms, createSceneProgram } from '../src/web/admin-ui/public/js/motion/scene-composer.js';
import { createMotionScene, MOTION_LAYERS } from '../src/web/admin-ui/public/js/motion/scene-graph.js';
import { SceneRuntime } from '../src/web/admin-ui/public/js/motion/scene-runtime.js';
import { MotionTimeline } from '../src/web/admin-ui/public/js/motion/timeline.js';
import { DEFAULT_ANIMATION_PROFILE } from '../src/shared/animation-profile.js';

function fakeScene() {
  const target = (name) => ({ name });
  return createMotionScene({
    root: { renderer: 'fake' },
    nodes: [
      { id: 'menu.section.0', kind: 'section', layer: 'menu', target: target('section'), order: 0, count: 1, depth: 0, transformOwner: 'self' },
      { id: 'menu.item.0', kind: 'item', layer: 'menu', target: target('item'), order: 0, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'menu.promotion.0', kind: 'promotion', layer: 'menu', target: target('promotion'), order: 0, count: 2, depth: 1, transformOwner: 'self' },
      { id: 'menu.item.1', kind: 'item', layer: 'menu', target: target('item2'), order: 1, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'menu.price.0', kind: 'price', layer: 'menu', target: target('price'), order: 0, count: 1, depth: 1, transformOwner: 'self' },
      { id: 'entity.future.0', kind: 'entity', layer: 'entity', target: target('future-entity'), order: 0, count: 1, depth: 20, transformOwner: 'entity-runtime' }
    ]
  });
}

function activeProfile() {
  return { ...DEFAULT_ANIMATION_PROFILE };
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

test('scene graph reserves entity layer while background is outside Motion Engine', () => {
  const scene = fakeScene();
  assert.equal(scene.version, 3);
  assert.ok(scene.layers.includes(MOTION_LAYERS.ENTITY));
  assert.equal(scene.nodes.some((node) => node.kind === 'background'), false);
  assert.equal(scene.node('menu.promotion.0').transformOwner, 'self');
  assert.equal(scene.node('entity.future.0').transformOwner, 'entity-runtime');
});

test('Motion Engine composes cinematic menu and independent promotion channels', () => {
  const scene = fakeScene();
  const profile = activeProfile();
  const plan = compileMotionPlan(scene, profile);

  assert.equal(plan.version, 3);
  assert.equal(plan.duration, 9000);
  assert.deepEqual(plan.programs.map((program) => program.id), ['menu-motion', 'promotion-motion']);
  assert.equal(plan.tracks.some((track) => track.node.kind === 'background'), false);
  assert.equal(plan.tracks.some((track) => track.node.kind === 'entity'), false);

  const item = plan.tracks.find((track) => track.node.id === 'menu.item.0');
  const promotion = plan.tracks.find((track) => track.node.id === 'menu.promotion.0');
  const price = plan.tracks.find((track) => track.node.id === 'menu.price.0');
  assert.ok(item);
  assert.ok(promotion);
  assert.ok(price);
  assert.equal(item.programId, 'menu-motion');
  assert.equal(promotion.programId, 'promotion-motion');
  assert.deepEqual(item.claims, ['transform', 'appearance']);
  assert.deepEqual(promotion.claims, ['transform', 'appearance']);
  assert.equal(item.timing.duration, 9000);
  assert.equal(promotion.timing.duration, 5500);
  assert.equal(promotion.timing.easing, 'elastic');
  assert.ok(promotion.keyframes.some((frame) => frame.transform.scale > 1.1));
  assert.ok(promotion.keyframes.some((frame) => frame.appearance.glowRadius >= 20));
  assert.notDeepEqual(item.keyframes, promotion.keyframes);
});

test('menu and promotion compilers remain independently callable', () => {
  const scene = fakeScene();
  const context = { profile: activeProfile() };
  const menu = compileMenuMotionProgram(scene, context);
  const promotion = compilePromotionMotionProgram(scene, context);
  assert.equal(menu.id, 'menu-motion');
  assert.equal(promotion.id, 'promotion-motion');
  assert.equal(menu.tracks.some((track) => track.node.kind === 'promotion'), false);
  assert.equal(promotion.tracks.every((track) => track.node.kind === 'promotion'), true);
  assert.equal(DEFAULT_SCENE_COMPILERS.length, 2);
});

test('scene composer rejects competing ownership and allows independent channels on one node', () => {
  const scene = fakeScene();
  const node = scene.node('menu.item.0');
  const timing = { duration: 9000, delay: 0, easing: 'cinematic', loop: true };
  const keyframes = [{ offset: 0 }, { offset: 1 }];
  const transformProgram = createSceneProgram({ id: 'transform-owner', duration: 9000, tracks: [{ node, claims: ['transform'], keyframes, timing }] });
  const appearanceProgram = createSceneProgram({ id: 'appearance-owner', duration: 9000, tracks: [{ node, claims: ['appearance'], keyframes, timing }] });
  const conflictingProgram = createSceneProgram({ id: 'conflicting-owner', duration: 9000, tracks: [{ node, claims: ['transform'], keyframes, timing }] });
  const composed = composeScenePrograms(scene, [transformProgram, appearanceProgram]);
  assert.equal(composed.tracks.length, 2);
  assert.throws(() => composeScenePrograms(scene, [transformProgram, conflictingProgram]), /Scene ownership conflict/);
});

test('WAAPI driver converts canonical channels into browser CSS', () => {
  const state = {
    offset: 0.5,
    opacity: 1,
    transform: { x: 12.5, y: -4, z: 0, xPercent: null, scale: 1.04, skewXDeg: 0, order: 'translate-scale' },
    appearance: { brightness: 1.12, glowRadius: 8.5, glowColor: 'rgba(1,2,3,.5)' }
  };
  const keyframe = toWaapiKeyframe(state, ['transform', 'appearance']);
  assert.equal(keyframe.transform, 'translate3d(12.50px, -4.00px, 0.00px) scale(1.0400)');
  assert.equal(keyframe.filter, 'brightness(1.120) drop-shadow(0 0 8.5px rgba(1,2,3,.5))');
  const timing = toWaapiTiming({ duration: 5500, delay: 120, easing: 'elastic', loop: true });
  assert.equal(timing.duration, 5500);
  assert.equal(timing.iterations, Infinity);
});

test('SceneRuntime owns one master timeline independently from renderer', () => {
  const scene = fakeScene();
  const driver = fakeDriver();
  const runtime = new SceneRuntime({ root: scene.root, driver, compilers: DEFAULT_SCENE_COMPILERS });
  const plan = runtime.load({ scene, context: { profile: activeProfile() } });
  assert.equal(plan.programs.length, 2);
  assert.equal(runtime.timeline.allHandles().length, plan.tracks.length + 1);
  runtime.pause();
  assert.equal(runtime.playState(), 'paused');
  runtime.replay();
  assert.equal(runtime.currentTime(), 0);
  runtime.destroy();
  assert.ok(driver.calls.some(([action]) => action === 'cancel'));
});

test('MotionTimeline remains renderer-neutral', () => {
  const driver = fakeDriver();
  const plan = { duration: 9000, tracks: [{ node: { id: 'x' }, claims: ['transform'], keyframes: [], timing: {} }], clock: { duration: 9000, loop: true } };
  const root = { renderer: 'future-gpu-driver' };
  const timeline = new MotionTimeline({ root, driver }).load(plan);
  assert.equal(timeline.duration, 9000);
  assert.equal(driver.handles.find((handle) => handle.kind === 'clock').root, root);
  timeline.destroy();
});
