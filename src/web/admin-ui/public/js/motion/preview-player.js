const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)',
  smooth: 'cubic-bezier(.16,1,.3,1)',
  snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)',
  elastic: 'cubic-bezier(.34,1.56,.64,1)'
});

const GOLD_SHADOW = 'rgba(244,201,21,.72)';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function motionGain(profile) {
  const normalized = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  return Math.sqrt(normalized);
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} с`;
}

function effectFor(profile, kind) {
  if (kind === 'section') return profile.section_effect;
  if (kind === 'price') return profile.price_effect;
  return profile.item_effect;
}

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

function transform({ x = 0, y = 0, scale = 1 } = {}) {
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
}

function baseFrame(offset) {
  return { offset, opacity: 1, transform: transform(), filter: 'brightness(1)' };
}

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
  return [
    baseFrame(0),
    peakFrame(profile, kind, effect, index, peakOffset),
    baseFrame(eventFraction),
    baseFrame(1)
  ];
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

  if (profile.background_effect === 'breathe') {
    return [{ transform: base }, { transform: `scale(${peakScale.toFixed(4)}) translate3d(0,0,0)` }, { transform: base }];
  }
  if (profile.background_effect === 'zoom') {
    return [{ transform: base }, { transform: `scale(${peakScale.toFixed(4)}) translate3d(0,0,0)` }, { transform: base }];
  }
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

export class AnimationPreviewPlayer {
  constructor({ stage, timeline, timeLabel, playButton, pauseButton, replayButton }) {
    this.stage = stage;
    this.timeline = timeline;
    this.timeLabel = timeLabel;
    this.playButton = playButton;
    this.pauseButton = pauseButton;
    this.replayButton = replayButton;
    this.animations = [];
    this.master = null;
    this.total = 12000;
    this.raf = null;
    this.profile = null;
    this.bindControls();
  }

  bindControls() {
    this.playButton?.addEventListener('click', () => this.play());
    this.pauseButton?.addEventListener('click', () => this.pause());
    this.replayButton?.addEventListener('click', () => this.replay());
    this.timeline?.addEventListener('input', () => {
      if (!this.master) return;
      const value = Number(this.timeline.value) / Number(this.timeline.max || 1000);
      this.seek(value * this.total);
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.animations.forEach((animation) => animation.cancel());
    this.animations = [];
    this.master = null;
  }

  restart(profile) {
    this.destroy();
    this.profile = { ...profile };
    const intensity = clamp(Number(profile.intensity) || 0, 0, 100);
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.stage.dataset.motionMode = 'continuous';
    this.total = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);

    const byKind = {
      section: [...this.stage.querySelectorAll('[data-motion="section"]')],
      item: [...this.stage.querySelectorAll('[data-motion="item"]')],
      price: [...this.stage.querySelectorAll('[data-motion="price"]')]
    };

    for (const [kind, targets] of Object.entries(byKind)) {
      const effect = effectFor(profile, kind);
      if (!effect || effect === 'none') continue;
      targets.forEach((element, index) => {
        const animation = element.animate(elementFrames(profile, kind, effect, index), {
          duration: this.total,
          delay: targetDelay(profile, index, targets.length, this.total),
          easing: EASING[profile.easing] || EASING.smooth,
          iterations: Infinity,
          fill: 'both'
        });
        this.animations.push(animation);
      });
    }

    const background = this.stage.querySelector('[data-motion-background]');
    if (background && profile.background_effect !== 'none') {
      const animation = background.animate(backgroundFrames(profile), {
        duration: this.total,
        easing: EASING[profile.easing] || EASING.smooth,
        iterations: Infinity,
        fill: 'both'
      });
      this.animations.push(animation);
    }

    const shimmer = this.stage.querySelector('.animation-screen-shimmer');
    if (shimmer && profile.section_effect === 'shimmer') {
      const animation = shimmer.animate(shimmerFrames(profile), {
        duration: this.total,
        easing: 'ease-in-out',
        iterations: Infinity,
        fill: 'both'
      });
      this.animations.push(animation);
    }

    this.master = this.stage.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: this.total,
      iterations: Infinity,
      fill: 'both'
    });
    this.animations.push(this.master);
    this.updateProgress();
  }

  play() {
    if (!this.master) return;
    this.animations.forEach((animation) => animation.play());
    this.updateProgress();
  }

  pause() {
    this.animations.forEach((animation) => animation.pause());
    this.updateProgress();
  }

  replay() {
    if (!this.master) return;
    this.animations.forEach((animation) => {
      animation.currentTime = 0;
      animation.play();
    });
    this.updateProgress();
  }

  seek(milliseconds) {
    const time = Math.max(0, Math.min(this.total, milliseconds));
    this.animations.forEach((animation) => { animation.currentTime = time; });
    this.pause();
    this.renderProgress(time);
  }

  renderProgress(time) {
    const normalized = this.total ? ((time % this.total) + this.total) % this.total : 0;
    const value = this.total ? Math.round((normalized / this.total) * 1000) : 0;
    if (this.timeline) this.timeline.value = String(value);
    if (this.timeLabel) this.timeLabel.textContent = `${formatTime(normalized)} / ${formatTime(this.total)}`;
  }

  updateProgress() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.master) return;
      this.renderProgress(Number(this.master.currentTime) || 0);
      if (this.master.playState === 'running') this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
