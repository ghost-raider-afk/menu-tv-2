const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)',
  smooth: 'cubic-bezier(.16,1,.3,1)',
  snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)',
  elastic: 'cubic-bezier(.34,1.56,.64,1)'
});

function entranceTransform(profile, kind) {
  const distance = Number(profile.distance_px) || 0;
  const scale = Number(profile.scale_from) || 1;
  if (profile.entrance === 'focus' || profile.entrance === 'zoom') return `scale(${scale})`;
  if (profile.entrance === 'split' && kind === 'price') return `translateX(${distance}px)`;
  switch (profile.direction) {
    case 'left': return `translateX(${-distance}px)`;
    case 'right': return `translateX(${distance}px)`;
    case 'up': return `translateY(${distance}px)`;
    case 'down': return `translateY(${-distance}px)`;
    case 'diagonal': return `translate(${-distance}px, ${Math.round(distance * 0.55)}px) rotate(-1deg)`;
    default: return profile.entrance === 'diagonal' ? `translate(${-distance}px, ${Math.round(distance * 0.55)}px)` : 'none';
  }
}

function clipFrames(profile) {
  if (!['wipe', 'reveal'].includes(profile.entrance) && profile.section_emphasis !== 'wipe') return null;
  switch (profile.direction) {
    case 'right': return ['inset(0 0 0 100%)', 'inset(0 0 0 0)'];
    case 'up': return ['inset(100% 0 0 0)', 'inset(0 0 0 0)'];
    case 'down': return ['inset(0 0 100% 0)', 'inset(0 0 0 0)'];
    default: return ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
  }
}

function keyframes(profile, kind) {
  const from = {
    opacity: Number(profile.opacity_from),
    transform: entranceTransform(profile, kind),
    filter: Number(profile.blur_px) > 0 ? `blur(${profile.blur_px}px)` : 'blur(0px)'
  };
  const to = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
  const clip = clipFrames(profile);
  if (clip && (kind === 'section' || profile.entrance === 'wipe' || profile.entrance === 'reveal')) {
    from.clipPath = clip[0];
    to.clipPath = clip[1];
  }
  if (kind === 'price' && profile.price_emphasis === 'pop') {
    from.transform = `${from.transform === 'none' ? '' : `${from.transform} `}scale(.82)`.trim();
  }
  if (kind === 'section' && profile.section_emphasis === 'pulse') {
    return [from, { opacity: 1, transform: 'scale(1.025)', offset: 0.82 }, to];
  }
  return [from, to];
}

function delayFor(profile, kind, index) {
  const base = kind === 'section'
    ? Number(profile.section_delay_ms)
    : kind === 'price' ? Number(profile.price_delay_ms) : Number(profile.item_delay_ms);
  return base + index * Number(profile.stagger_ms);
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} с`;
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
    this.total = 2000;
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
    const intensity = Math.max(0, Math.min(100, Number(profile.intensity) || 0));
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.stage.style.setProperty('--ambient-duration', `${Number(profile.ambient_speed_seconds) || 28}s`);
    this.stage.classList.toggle('motion-glow', profile.glow === true);
    this.stage.classList.toggle('motion-shimmer', profile.shimmer === true);
    this.stage.classList.toggle('motion-background', profile.background_motion === true);

    const targets = [...this.stage.querySelectorAll('[data-motion]')];
    let maximumEnd = 0;
    const counters = { section: 0, item: 0, price: 0 };
    targets.forEach((element) => {
      const kind = element.dataset.motion || 'item';
      const index = counters[kind] ?? 0;
      counters[kind] = index + 1;
      const delay = delayFor(profile, kind, index);
      const duration = Number(profile.duration_ms);
      maximumEnd = Math.max(maximumEnd, delay + duration);
      const animation = element.animate(keyframes(profile, kind), {
        duration,
        delay,
        easing: EASING[profile.easing] || EASING.smooth,
        fill: 'both'
      });
      this.animations.push(animation);
    });

    const background = this.stage.querySelector('[data-motion-background]');
    this.total = Math.max(1800, maximumEnd + 700);
    if (background && profile.background_motion) {
      const drift = 8 + Math.round(intensity * 0.12);
      const animation = background.animate([
        { transform: 'scale(1.035) translate3d(0,0,0)' },
        { transform: `scale(1.055) translate3d(${drift}px, ${-Math.round(drift * .45)}px, 0)` }
      ], { duration: this.total, easing: 'ease-in-out', fill: 'both' });
      this.animations.push(animation);
    }

    this.master = this.stage.animate([{ opacity: 1 }, { opacity: 1 }], { duration: this.total, fill: 'both' });
    this.animations.push(this.master);
    this.updateProgress();
  }

  play() {
    if (!this.master) return;
    if (this.master.playState === 'finished') this.seek(0);
    this.animations.forEach((animation) => animation.play());
    this.updateProgress();
  }

  pause() {
    this.animations.forEach((animation) => animation.pause());
    this.updateProgress();
  }

  replay() {
    if (!this.profile) return;
    this.restart(this.profile);
  }

  seek(milliseconds) {
    const time = Math.max(0, Math.min(this.total, milliseconds));
    this.animations.forEach((animation) => { animation.currentTime = time; });
    this.pause();
    this.renderProgress(time);
  }

  renderProgress(time) {
    const value = this.total ? Math.round((time / this.total) * 1000) : 0;
    if (this.timeline) this.timeline.value = String(value);
    if (this.timeLabel) this.timeLabel.textContent = `${formatTime(time)} / ${formatTime(this.total)}`;
  }

  updateProgress() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.master) return;
      const current = Math.min(this.total, Number(this.master.currentTime) || 0);
      this.renderProgress(current);
      if (this.master.playState === 'running') this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
