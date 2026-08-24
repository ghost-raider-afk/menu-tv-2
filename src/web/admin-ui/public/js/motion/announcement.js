export const DEFAULT_ANNOUNCEMENT = Object.freeze({
  enabled: false,
  text: '',
  position: 'bottom',
  speed_px_per_second: 90,
  font_size: 34,
  text_color: '#FFFFFF',
  background_color: '#101317',
  background_opacity: 0.82
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normaliseAnnouncement(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const textColor = /^#[0-9a-f]{6}$/i.test(String(source.text_color || '')) ? String(source.text_color) : DEFAULT_ANNOUNCEMENT.text_color;
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(String(source.background_color || '')) ? String(source.background_color) : DEFAULT_ANNOUNCEMENT.background_color;
  return {
    enabled: source.enabled === true,
    text: String(source.text || '').trim().slice(0, 500),
    position: source.position === 'top' ? 'top' : 'bottom',
    speed_px_per_second: clamp(Number(source.speed_px_per_second) || DEFAULT_ANNOUNCEMENT.speed_px_per_second, 30, 240),
    font_size: clamp(Number(source.font_size) || DEFAULT_ANNOUNCEMENT.font_size, 18, 72),
    text_color: textColor,
    background_color: backgroundColor,
    background_opacity: clamp(Number.isFinite(Number(source.background_opacity)) ? Number(source.background_opacity) : DEFAULT_ANNOUNCEMENT.background_opacity, 0, 1)
  };
}

function rgba(hex, opacity) {
  const value = String(hex).replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
}

function durationSeconds(announcement) {
  const textWidth = Math.max(180, [...announcement.text].length * announcement.font_size * 0.62);
  return clamp((1920 + textWidth) / announcement.speed_px_per_second, 8, 120);
}

export function renderAnnouncementLayer(layer, value) {
  if (!(layer instanceof Element)) return null;
  const announcement = normaliseAnnouncement(value);
  layer.replaceChildren();
  layer.classList.toggle('is-enabled', announcement.enabled && Boolean(announcement.text));
  layer.classList.toggle('is-top', announcement.position === 'top');
  layer.classList.toggle('is-bottom', announcement.position === 'bottom');
  if (!announcement.enabled || !announcement.text) return announcement;

  const bar = document.createElement('div');
  bar.className = 'scene-announcement';
  bar.style.setProperty('--announcement-font-size', `${announcement.font_size / 19.2}cqw`);
  bar.style.setProperty('--announcement-text-color', announcement.text_color);
  bar.style.setProperty('--announcement-background', rgba(announcement.background_color, announcement.background_opacity));
  bar.style.setProperty('--announcement-duration', `${durationSeconds(announcement)}s`);

  const text = document.createElement('span');
  text.className = 'scene-announcement-text';
  text.textContent = announcement.text;
  bar.append(text);
  layer.append(bar);
  return announcement;
}
