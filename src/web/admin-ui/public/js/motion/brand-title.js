export const BRAND_FONT_STACKS = Object.freeze({
  inter: 'Inter, Arial, Helvetica, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  montserrat: 'Montserrat, Arial, Helvetica, sans-serif',
  oswald: 'Oswald, "Arial Narrow", Arial, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif'
});

export const DEFAULT_BRAND_TITLE = Object.freeze({
  enabled: false,
  text: '',
  x: 960,
  y: 96,
  font_family: 'inter',
  font_size: 72,
  vertical_scale: 1,
  letter_spacing: 2,
  text_color: '#FFFFFF',
  glow_color: '#35D9FF',
  glow_strength: 18,
  effect: 'neon-pulse',
  cycle_seconds: 5.5
});

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normaliseBrandTitle(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const textColor = /^#[0-9a-f]{6}$/i.test(String(source.text_color || '')) ? String(source.text_color) : DEFAULT_BRAND_TITLE.text_color;
  const glowColor = /^#[0-9a-f]{6}$/i.test(String(source.glow_color || '')) ? String(source.glow_color) : DEFAULT_BRAND_TITLE.glow_color;
  return {
    enabled: source.enabled === true,
    text: String(source.text ?? DEFAULT_BRAND_TITLE.text).trim().slice(0, 80),
    x: clamp(source.x, DEFAULT_BRAND_TITLE.x, 0, 1920),
    y: clamp(source.y, DEFAULT_BRAND_TITLE.y, 0, 1080),
    font_family: BRAND_FONT_STACKS[source.font_family] ? source.font_family : DEFAULT_BRAND_TITLE.font_family,
    font_size: clamp(source.font_size, DEFAULT_BRAND_TITLE.font_size, 18, 180),
    vertical_scale: clamp(source.vertical_scale, DEFAULT_BRAND_TITLE.vertical_scale, 0.5, 2.2),
    letter_spacing: clamp(source.letter_spacing, DEFAULT_BRAND_TITLE.letter_spacing, -2, 20),
    text_color: textColor,
    glow_color: glowColor,
    glow_strength: clamp(source.glow_strength, DEFAULT_BRAND_TITLE.glow_strength, 0, 48),
    effect: ['none', 'neon-pulse', 'breathe', 'float'].includes(source.effect) ? source.effect : DEFAULT_BRAND_TITLE.effect,
    cycle_seconds: clamp(source.cycle_seconds, DEFAULT_BRAND_TITLE.cycle_seconds, 2, 30)
  };
}

export function renderBrandTitleLayer(layer, value) {
  if (!(layer instanceof Element)) return null;
  const brand = normaliseBrandTitle(value);
  layer.replaceChildren();
  layer.classList.toggle('is-enabled', brand.enabled);
  if (!brand.enabled || !brand.text) return brand;

  const root = document.createElement('div');
  root.className = `scene-brand-title scene-brand-title-${brand.effect}`;
  root.dataset.brandTitle = 'true';
  root.style.left = `${(brand.x / 19.2).toFixed(4)}cqw`;
  root.style.top = `${(brand.y / 19.2).toFixed(4)}cqw`;
  root.style.setProperty('--brand-font-family', BRAND_FONT_STACKS[brand.font_family]);
  root.style.setProperty('--brand-font-size', `${brand.font_size / 19.2}cqw`);
  root.style.setProperty('--brand-scale-y', String(brand.vertical_scale));
  root.style.setProperty('--brand-letter-spacing', `${brand.letter_spacing / 19.2}cqw`);
  root.style.setProperty('--brand-text-color', brand.text_color);
  root.style.setProperty('--brand-glow-color', brand.glow_color);
  root.style.setProperty('--brand-glow-radius', `${brand.glow_strength / 19.2}cqw`);
  root.style.setProperty('--brand-cycle', `${brand.cycle_seconds}s`);

  const motion = document.createElement('div');
  motion.className = 'scene-brand-title-motion';
  const glyphs = document.createElement('span');
  glyphs.className = 'scene-brand-title-glyphs';
  glyphs.textContent = brand.text;
  motion.append(glyphs);
  root.append(motion);
  layer.append(root);
  return brand;
}
