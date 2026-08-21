const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)', smooth: 'cubic-bezier(.16,1,.3,1)', snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)', elastic: 'cubic-bezier(.34,1.56,.64,1)'
});
const GOLD_SHADOW = 'rgba(244,201,21,.72)';
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function motionGain(profile) { return Math.sqrt(clamp(Number(profile.intensity) || 0, 0, 100) / 100); }
function formatTime(milliseconds) { return `${(milliseconds / 1000).toFixed(1)} с`; }
function effectFor(profile, kind) { if (kind === 'section') return profile.section_effect; if (kind === 'price') return profile.price_effect; return profile.item_effect; }
function vectorFor(profile, travel, index) {
  switch (profile.flow_direction) {
    case 'right-to-left': return { x: -travel, y: 0 };
    case 'top-to-bottom': return { x: 0, y: travel };
    case 'bottom-to-top': return { x: 0, y: -travel };
    case 'alternate': return index % 2 === 0 ? { x: travel, y: -travel * 0.35 } : { x: -travel, y: travel * 0.35 };
    case 'none': return { x: 0, y: 0 };
    default: return { x: travel, y: 0 };
  }
}
function transform({ x = 0, y = 0, scale = 1 } = {}) { return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`; }
function baseFrame(offset) { return { offset, opacity: 1, transform: transform(), filter: 'brightness(1)' }; }
function peakFrame(profile, kind, effect, index, offset) {
  const gain = motionGain(profile);
  const travel = (Number(profile.travel_px) || 0) * gain;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain;
  const brightness = 1 + (Number(profile.brightness_amount) || 0) * gain;
  const vector = vectorFor(profile, travel, index);
  const frame = { offset, opacity: 1, transform: transform(), filter: `brightness(${brightness.toFixed(3)})` };
  if (effect === 'wave') frame.transform = transform({ ...vector, scale: 1 + scaleAmount * 0.45 });
  if (effect === 'lift') frame.transform = transform({ x: vector.x * 0.5, y: vector.y || -travel, scale: 1 + scaleAmount * 0.55 });
  if (effect === 'breathe') frame.transform = transform({ scale: 1 + scaleAmount * 0.72 });
  if (effect === 'focus') frame.transform = transform({ scale: 1 + scaleAmount });
  if (effect === 'pulse') frame.transform = transform({ scale: 1 + scaleAmount * (kind === 'price' ? 1.55 : 1.08) });
  if (effect === 'pop') frame.transform = transform({ scale: 1 + scaleAmount * 1.9 });
  if (effect === 'shimmer') frame.transform = transform({ x: vector.x * 0.3, y: vector.y * 0.3, scale: 1 + scaleAmount * 0.35 });
  if (effect === 'glow' || effect === 'shimmer') {
    const radius = 8 + 28 * gain;
    frame.filter = `brightness(${brightness.toFixed(3)}) drop-shadow(0 0 ${radius.toFixed(1)}px ${GOLD_SHADOW})`;
  }
  return frame;
}
function elementFrames(profile, kind, effect, index) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.05, 0.82);
  const peakOffset = eventFraction * 0.5;
  return [baseFrame(0), peakFrame(profile, kind, effect, index, peakOffset), baseFrame(eventFraction), baseFrame(1)];
}
function orderedIndex(profile, index, count) {
  if (profile.flow_direction === 'right-to-left' || profile.flow_direction === 'bottom-to-top') return Math.max(0, count - index - 1);
  if (profile.flow_direction === 'alternate') return index % 2 === 0 ? Math.floor(index / 2) : Math.ceil(count / 2) + Math.floor(index / 2);
  return index;
}
function targetDelay(profile, index, count, cycleMs) {
  if (profile.pattern === 'ambient' || profile.pattern === 'pulse' || profile.pattern === 'parallax') return 0;
  const phase = orderedIndex(profile, index, count) * (Number(profile.wave_stagger_ms) || 0);
  return cycleMs ? phase % cycleMs : 0;
}
function backgroundFrames(profile) {
  const intensity = motionGain(profile);
  const travel = (Number(profile.travel_px) || 0) * intensity;
  const depth = (Number(profile.background_zoom_percent) || 0) / 100;
  const baseScale = 1.035 + depth * 0.35;
  const peakScale = baseScale + depth * Math.max(0.2, intensity);
  const base = `scale(${baseScale.toFixed(4)}) translate3d(0,0,0)`;
  if (profile.background_effect === 'breathe' || profile.background_effect === 'zoom') return [{ transform: base }, { transform: `scale(${peakScale.toFixed(4)}) translate3d(0,0,0)` }, { transform: base }];
  return [
    { transform: `scale(${baseScale.toFixed(4)}) translate3d(${-travel * 0.45}px, ${travel * 0.2}px, 0)` },
    { transform: `scale(${peakScale.toFixed(4)}) translate3d(${travel}px, ${-travel * 0.45}px, 0)` },
    { transform: `scale(${baseScale.toFixed(4)}) translate3d(${-travel * 0.45}px, ${travel * 0.2}px, 0)` }
  ];
}
function shimmerFrames(profile) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.08, 0.72);
  const gain = motionGain(profile);
  return [
    { offset: 0, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.12, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.45, opacity: 0.5 * gain, transform: 'translateX(320%) skewX(-18deg)' },
    { offset: eventFraction, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' },
    { offset: 1, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' }
  ];
}

function addAnimation(list, node, keyframes, options) {
  if (!node) return;
  const animation = node.animate(keyframes, { iterations: Infinity, fill: 'both', ...options });
  list.push(animation);
}
function animateVisualFx(stage, profile, total, animations) {
  const effect = profile.visual_effect || 'none';
  stage.dataset.visualEffect = effect;
  if (effect === 'none') return;
  const gain = motionGain(profile);
  const easing = EASING[profile.easing] || EASING.smooth;

  if (effect === 'ocean-wave') {
    stage.querySelectorAll('.motion-fx-ocean i').forEach((node, index) => addAnimation(animations, node, [
      { transform: `translate3d(${-6 - index * 3}%,8%,0) scaleY(${0.92 + index * 0.04})`, opacity: 0.22 * gain },
      { transform: `translate3d(${6 + index * 4}%,-7%,0) scaleY(${1.08 - index * 0.03})`, opacity: 0.62 * gain },
      { transform: `translate3d(${-6 - index * 3}%,8%,0) scaleY(${0.92 + index * 0.04})`, opacity: 0.22 * gain }
    ], { duration: total * (index ? 1.15 : 1), easing }));
  } else if (effect === 'aurora') {
    stage.querySelectorAll('.motion-fx-aurora i').forEach((node, index) => addAnimation(animations, node, [
      { transform: `translate3d(${-12 + index * 4}%,-3%,0) rotate(${-9 + index * 7}deg) scale(.92)`, opacity: 0.28 * gain },
      { transform: `translate3d(${18 - index * 5}%,7%,0) rotate(${8 - index * 5}deg) scale(1.16)`, opacity: 0.74 * gain },
      { transform: `translate3d(${-12 + index * 4}%,-3%,0) rotate(${-9 + index * 7}deg) scale(.92)`, opacity: 0.28 * gain }
    ], { duration: total * (1 + index * 0.12), easing }));
  } else if (effect === 'ripple') {
    stage.querySelectorAll('.motion-fx-ripple i').forEach((node, index) => addAnimation(animations, node, [
      { offset: 0, transform: 'scale(.25)', opacity: 0 },
      { offset: 0.12, transform: 'scale(.35)', opacity: 0.7 * gain },
      { offset: 0.52, transform: 'scale(3.8)', opacity: 0.14 * gain },
      { offset: 0.72, transform: 'scale(5)', opacity: 0 },
      { offset: 1, transform: 'scale(5)', opacity: 0 }
    ], { duration: total, delay: index * total * 0.14, easing: 'cubic-bezier(.16,.8,.25,1)' }));
  } else if (effect === 'sun-sweep') {
    addAnimation(animations, stage.querySelector('.motion-fx-sun i'), [
      { offset: 0, transform: 'translateX(-120%) skewX(-18deg)', opacity: 0 },
      { offset: 0.12, opacity: 0 },
      { offset: 0.35, transform: 'translateX(290%) skewX(-18deg)', opacity: 0.78 * gain },
      { offset: 0.56, transform: 'translateX(590%) skewX(-18deg)', opacity: 0 },
      { offset: 1, transform: 'translateX(590%) skewX(-18deg)', opacity: 0 }
    ], { duration: total, easing: 'ease-in-out' });
  } else if (effect === 'spotlight') {
    addAnimation(animations, stage.querySelector('.motion-fx-spotlight i'), [
      { transform: 'translate3d(0,0,0) scale(.92)', opacity: 0.35 * gain },
      { transform: 'translate3d(95%,15%,0) scale(1.12)', opacity: 0.62 * gain },
      { transform: 'translate3d(48%,58%,0) scale(1)', opacity: 0.48 * gain },
      { transform: 'translate3d(0,0,0) scale(.92)', opacity: 0.35 * gain }
    ], { duration: total, easing });
  } else if (effect === 'liquid-glass') {
    addAnimation(animations, stage.querySelector('.motion-fx-glass i'), [
      { offset: 0, transform: 'translateX(-120%) skewX(-10deg) scaleX(.82)', opacity: 0 },
      { offset: 0.12, opacity: 0 },
      { offset: 0.34, transform: 'translateX(250%) skewX(-7deg) scaleX(1.08)', opacity: 0.66 * gain },
      { offset: 0.6, transform: 'translateX(530%) skewX(-12deg) scaleX(.9)', opacity: 0 },
      { offset: 1, transform: 'translateX(530%) skewX(-12deg) scaleX(.9)', opacity: 0 }
    ], { duration: total, easing });
  }
}

export class AnimationPreviewPlayer {
  constructor({ stage, timeline, timeLabel, playButton, pauseButton, replayButton }) {
    this.stage = stage; this.timeline = timeline; this.timeLabel = timeLabel; this.playButton = playButton; this.pauseButton = pauseButton; this.replayButton = replayButton;
    this.animations = []; this.master = null; this.total = 12000; this.raf = null; this.profile = null; this.bindControls();
  }
  bindControls() {
    this.playButton?.addEventListener('click', () => this.play());
    this.pauseButton?.addEventListener('click', () => this.pause());
    this.replayButton?.addEventListener('click', () => this.replay());
    this.timeline?.addEventListener('input', () => { if (!this.master) return; const value = Number(this.timeline.value) / Number(this.timeline.max || 1000); this.seek(value * this.total); });
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.animations.forEach((animation) => animation.cancel());
    this.animations = []; this.master = null;
    if (this.stage) delete this.stage.dataset.visualEffect;
  }
  restart(profile) {
    this.destroy();
    this.profile = { ...profile };
    const intensity = clamp(Number(profile.intensity) || 0, 0, 100);
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.stage.dataset.motionMode = 'continuous';
    this.total = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
    const byKind = { section: [...this.stage.querySelectorAll('[data-motion="section"]')], item: [...this.stage.querySelectorAll('[data-motion="item"]')], price: [...this.stage.querySelectorAll('[data-motion="price"]')] };
    for (const [kind, targets] of Object.entries(byKind)) {
      const effect = effectFor(profile, kind);
      if (!effect || effect === 'none') continue;
      targets.forEach((element, index) => addAnimation(this.animations, element, elementFrames(profile, kind, effect, index), {
        duration: this.total, delay: targetDelay(profile, index, targets.length, this.total), easing: EASING[profile.easing] || EASING.smooth
      }));
    }
    const background = this.stage.querySelector('[data-motion-background]');
    if (background && profile.background_effect !== 'none') addAnimation(this.animations, background, backgroundFrames(profile), { duration: this.total, easing: EASING[profile.easing] || EASING.smooth });
    const shimmer = this.stage.querySelector('.animation-screen-shimmer');
    if (shimmer && profile.section_effect === 'shimmer') addAnimation(this.animations, shimmer, shimmerFrames(profile), { duration: this.total, easing: 'ease-in-out' });
    animateVisualFx(this.stage, profile, this.total, this.animations);
    this.master = this.stage.animate([{ opacity: 1 }, { opacity: 1 }], { duration: this.total, iterations: Infinity, fill: 'both' });
    this.animations.push(this.master);
    this.updateProgress();
  }
  play() { if (!this.master) return; this.animations.forEach((animation) => animation.play()); this.updateProgress(); }
  pause() { this.animations.forEach((animation) => animation.pause()); this.updateProgress(); }
  replay() { if (!this.master) return; this.animations.forEach((animation) => { animation.currentTime = 0; animation.play(); }); this.updateProgress(); }
  seek(milliseconds) { const time = Math.max(0, Math.min(this.total, milliseconds)); this.animations.forEach((animation) => { animation.currentTime = time; }); this.pause(); this.renderProgress(time); }
  renderProgress(time) {
    const normalized = this.total ? ((time % this.total) + this.total) % this.total : 0;
    const value = this.total ? Math.round((normalized / this.total) * 1000) : 0;
    if (this.timeline) this.timeline.value = String(value);
    if (this.timeLabel) this.timeLabel.textContent = `${formatTime(normalized)} / ${formatTime(this.total)}`;
  }
  updateProgress() {
    cancelAnimationFrame(this.raf);
    const tick = () => { if (!this.master) return; this.renderProgress(Number(this.master.currentTime) || 0); if (this.master.playState === 'running') this.raf = requestAnimationFrame(tick); };
    tick();
  }
}
