import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completeAnimationProfile } from '../src/shared/animation-profile.js';
import { ANIMATION_PRESETS } from '../src/web/admin-ui/public/js/motion/presets.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('all TV presets leave the canonical background static', () => {
  for (const preset of ANIMATION_PRESETS) {
    assert.equal('background_effect' in preset.profile, false, preset.id);
    assert.equal('background_zoom_percent' in preset.profile, false, preset.id);
  }
});

test('old saved background motion is normalised away', () => {
  const profile = completeAnimationProfile({
    motion_version: 2,
    pattern: 'ambient',
    flow_direction: 'none',
    easing: 'smooth',
    cycle_seconds: 12,
    event_duration_ms: 1800,
    wave_stagger_ms: 0,
    travel_px: 0,
    scale_amount: 0.02,
    brightness_amount: 0.2,
    section_effect: 'glow',
    item_effect: 'breathe',
    price_effect: 'none',
    background_effect: 'zoom',
    background_zoom_percent: 8,
    visual_effect: 'none',
    intensity: 60
  });
  assert.equal(profile.background_effect, 'none');
  assert.equal(profile.background_zoom_percent, 0);
});

test('Motion Studio exposes no background animation controls', async () => {
  const [html, page] = await Promise.all([
    read('animation.html'),
    read('js/pages/animation.js')
  ]);
  assert.doesNotMatch(html, /id="animation-background-effect"/);
  assert.doesNotMatch(html, /id="animation-background-zoom"/);
  assert.doesNotMatch(page, /'animation-background-effect'|'animation-background-zoom'/);
  assert.match(page, /background_effect:'none'/);
  assert.match(page, /background_zoom_percent:0/);
});
