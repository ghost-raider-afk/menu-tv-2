import assert from 'node:assert/strict';
import test from 'node:test';
import { compileMotionPlan } from '../src/web/admin-ui/public/js/motion/motion-plan.js';
import { MotionTimeline } from '../src/web/admin-ui/public/js/motion/timeline.js';
import { profileForPreset } from '../src/web/admin-ui/public/js/motion/presets.js';

function fakeScene() {
  const element = (name) => ({ name });
  return {
    version: 3,
    nodes: [
      { id: 'menu.item.0', kind: 'item', layer: 'menu', element: element('item'), order: 0, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'menu.promotion.0', kind: 'promotion', layer: 'menu', element: element('promotion'), order: 0, count: 2, depth: 1, transformOwner: 'self' },
      { id: 'menu.item.1', kind: 'item', layer: 'menu', element: element('item2'), order: 1, count: 2, depth: 0, transformOwner: 'self' },
      { id: 'background.primary', kind: 'background', layer: 'background', element: element('background'), order: 0, count: 1, depth: -10, transformOwner: 'self' },
      { id: 'atmosphere.shimmer', kind: 'shimmer', layer: 'atmosphere', element: element('shimmer'), order: 0, count: 1, depth: 10, transformOwner: 'self' }
    ]
  };
}

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

test('MotionTimeline owns playback independently from a concrete animation implementation', () => {
  const OriginalElement = globalThis.Element;
  class FakeElement {}
  globalThis.Element = FakeElement;
  try {
    const calls = [];
    const handles = [];
    const driver = {
      createTrack(track) {
        const handle = { kind: 'track', time: 0, state: 'running', track };
        handles.push(handle);
        return handle;
      },
      createClock(_root, clock) {
        const handle = { kind: 'clock', time: 0, state: 'running', clock };
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
    const timeline = new MotionTimeline({ root: new FakeElement(), driver }).load(plan);

    assert.equal(timeline.duration, 8000);
    assert.equal(timeline.allHandles().length, 2);
    assert.equal(timeline.seek(9000), 8000, 'timeline clamps only its own seek boundary, not rendering quality');
    assert.equal(timeline.currentTime(), 8000);
    timeline.pause();
    assert.equal(timeline.playState(), 'paused');
    timeline.replay();
    assert.equal(timeline.currentTime(), 0);
    assert.equal(timeline.playState(), 'running');
    timeline.destroy();
    assert.ok(calls.some(([action]) => action === 'cancel'));
  } finally {
    if (OriginalElement === undefined) delete globalThis.Element;
    else globalThis.Element = OriginalElement;
  }
});
