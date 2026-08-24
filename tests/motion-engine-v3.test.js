import assert from 'node:assert/strict';
import test from 'node:test';
import { compileMotionPlan } from '../src/web/admin-ui/public/js/motion/motion-plan.js';
import { profileForPreset } from '../src/web/admin-ui/public/js/motion/presets.js';
import { createMotionScene, MOTION_LAYERS } from '../src/web/admin-ui/public/js/motion/scene-graph.js';
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
      { id: 'atmosphere.shimmer', kind: 'shimmer', layer: 'atmosphere', target: target('shimmer'), order: 0, count: 1, depth: 10, transformOwner: 'self' }
    ]
  });
}

test('scene graph is renderer agnostic and already reserves the live entity layer', () => {
  const scene = fakeScene();
  assert.equal(scene.version, 3);
  assert.ok(scene.layers.includes(MOTION_LAYERS.ENTITY));
  assert.equal(scene.node('menu.promotion.0').depth, 1);
  assert.equal(scene.node('menu.promotion.0').target.name, 'promotion');
  assert.equal(scene.node('menu.promotion.0').transformOwner, 'self');
  assert.equal(scene.find('item').length, 2);
  assert.throws(() => createMotionScene({
    root: {},
    nodes: [
      { id: 'same', kind: 'item', layer: 'menu', target: {} },
      { id: 'same', kind: 'item', layer: 'menu', target: {} }
    ]
  }), /Duplicate motion scene node id/);
});

test('Motion Engine v3 compiles a driver-neutral plan with synchronized sibling scene nodes', () => {
  const profile = {
    ...profileForPreset('accent-pulse'),
    pattern: 'wave',
    flow_direction: 'left-to-right',
    item_effect: 'pulse',
    section_effect: 'none',
    price_effect: 'none',
    background_effect: 'drift',
    cycle_seconds: 8,
    wave_stagger_ms: 120
  };
  const plan = compileMotionPlan(fakeScene(), profile);

  assert.equal(plan.version, 3);
  assert.equal(plan.duration, 8000);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.tracks));

  const item = plan.tracks.find((track) => track.node.id === 'menu.item.0');
  const promotion = plan.tracks.find((track) => track.node.id === 'menu.promotion.0');
  const secondItem = plan.tracks.find((track) => track.node.id === 'menu.item.1');
  const background = plan.tracks.find((track) => track.node.id === 'background.primary');

  assert.ok(item);
  assert.ok(promotion);
  assert.ok(secondItem);
  assert.ok(background);
  assert.equal(item.timing.delay, promotion.timing.delay, 'promotion must share its row phase');
  assert.equal(secondItem.timing.delay, 120);
  assert.equal(item.channel, 'motion');
  assert.equal(promotion.channel, 'motion');
  assert.equal(background.channel, 'transform');
  assert.deepEqual(item.keyframes, promotion.keyframes, 'promotion and row content use the same row motion frames');
});

test('MotionTimeline owns playback independently from a concrete renderer and animation implementation', () => {
  const calls = [];
  const handles = [];
  const driver = {
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
  const plan = {
    duration: 8000,
    tracks: [{ node: { id: 'x' }, keyframes: [], timing: {} }],
    clock: { duration: 8000, iterations: Infinity, fill: 'both' }
  };
  const opaqueRoot = { renderer: 'future-gpu-driver' };
  const timeline = new MotionTimeline({ root: opaqueRoot, driver }).load(plan);

  assert.equal(timeline.duration, 8000);
  assert.equal(timeline.allHandles().length, 2);
  assert.equal(handles.find((handle) => handle.kind === 'clock').root, opaqueRoot);
  assert.equal(timeline.seek(9000), 8000, 'timeline clamps playback position only; no rendering quality policy lives here');
  assert.equal(timeline.currentTime(), 8000);
  timeline.pause();
  assert.equal(timeline.playState(), 'paused');
  timeline.replay();
  assert.equal(timeline.currentTime(), 0);
  assert.equal(timeline.playState(), 'running');
  timeline.destroy();
  assert.ok(calls.some(([action]) => action === 'cancel'));
});
