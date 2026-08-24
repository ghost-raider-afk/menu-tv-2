import { WaapiMotionDriver } from './drivers/waapi-driver.js';
import { compileMotionPlan } from './motion-plan.js';
import { buildMotionScene } from './scene-graph.js';
import { MotionTimeline } from './timeline.js';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} с`;
}

export class AnimationPreviewPlayer {
  constructor({ stage, timeline, timeLabel, playButton, pauseButton, replayButton, driver = null }) {
    this.stage = stage;
    this.timeline = timeline;
    this.timeLabel = timeLabel;
    this.playButton = playButton;
    this.pauseButton = pauseButton;
    this.replayButton = replayButton;
    this.driver = driver || new WaapiMotionDriver();
    this.motionTimeline = new MotionTimeline({ root: stage, driver: this.driver });
    this.total = 12000;
    this.raf = null;
    this.profile = null;
    this.scene = null;
    this.plan = null;
    this.bindControls();
  }

  bindControls() {
    this.playButton?.addEventListener('click', () => this.play());
    this.pauseButton?.addEventListener('click', () => this.pause());
    this.replayButton?.addEventListener('click', () => this.replay());
    this.timeline?.addEventListener('input', () => {
      if (!this.plan) return;
      const value = Number(this.timeline.value) / Number(this.timeline.max || 1000);
      this.seek(value * this.total);
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.motionTimeline.destroy();
    this.scene = null;
    this.plan = null;
  }

  restart(profile) {
    this.motionTimeline.destroy();
    this.profile = { ...profile };
    const intensity = clamp(Number(profile.intensity) || 0, 0, 100);
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.stage.dataset.motionMode = 'continuous';
    this.scene = buildMotionScene(this.stage);
    this.plan = compileMotionPlan(this.scene, profile);
    this.total = this.plan.duration;
    this.motionTimeline.load(this.plan);
    this.updateProgress();
  }

  play() {
    if (!this.plan) return;
    this.motionTimeline.play();
    this.updateProgress();
  }

  pause() {
    this.motionTimeline.pause();
    this.updateProgress();
  }

  replay() {
    if (!this.plan) return;
    this.motionTimeline.replay();
    this.updateProgress();
  }

  seek(milliseconds) {
    const time = this.motionTimeline.seek(milliseconds);
    this.motionTimeline.pause();
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
      if (!this.plan) return;
      this.renderProgress(this.motionTimeline.currentTime());
      if (this.motionTimeline.playState() === 'running') this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
